import { createQueryEmbedding } from "./embeddingService.js";
import { rerankCandidates } from "./rerankService.js";
import { searchIncidents } from "../db/incidentRepo.js";
import { checkClusterHealth } from "./mcpService.js";
import { getCredential } from "./credentialStore.js";

const GROQ_BASE_URL = "https://api.groq.com/openai/v1";

const RELEVANCE_THRESHOLD = -8;
const MAX_CITED = 8;
const CROSS_SERVICE_SCORE_THRESHOLD = 0;

function dedupeCandidates(candidates) {
  const seen = new Set();
  const deduped = [];
  for (const c of candidates) {
    const key = (c.description || "").trim().toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(c);
  }
  return deduped;
}

function computeEvidence(citedRecords) {
  const total = citedRecords.length;
  const confirmed = citedRecords.filter((r) => r.fix_confirmed).length;
  const confirmedScores = citedRecords
    .filter((r) => r.fix_confirmed && r.fix_effectiveness_score != null)
    .map((r) => r.fix_effectiveness_score);
  const avgEffectiveness = confirmedScores.length
    ? confirmedScores.reduce((a, b) => a + b, 0) / confirmedScores.length
    : null;

  return {
    similarIncidentsFound: total,
    confirmedFixCount: confirmed,
    avgEffectiveness: avgEffectiveness != null ? Math.round(avgEffectiveness * 100) / 100 : null,
  };
}

export async function chatAboutIncident({ incident, message, history = [], codeContext = null }) {
  const trace = [];
  const startedAt = Date.now();
  const stamp = () => new Date().toISOString();

  // The very first message in a conversation (empty history) is always
  // the auto-fired "Triage this incident..." request - that gets the
  // full structured RCA template. Every message after that is a normal
  // follow-up in an ongoing conversation ("hi", a clarifying question,
  // etc.) and should get a normal conversational reply, not be forced
  // through the same Root Cause / RCA Confidence / Evidence template
  // regardless of what was actually asked.
  const isInitialTriage = history.length === 0;

  const runStep = async (label, tool, fn) => {
    const t0 = Date.now();
    try {
      const result = await fn();
      trace.push({ time: stamp(), step: label, tool, durationMs: Date.now() - t0, ok: true });
      return result;
    } catch (err) {
      trace.push({ time: stamp(), step: label, tool, durationMs: Date.now() - t0, ok: false, error: err.message });
      return null;
    }
  };

  await runStep("Checking memory layer health", "CockroachDB MCP", () => checkClusterHealth());

  let citedRecords = [];
  const queryEmbedding = await runStep("Embedding message", "NIM Embed", () => createQueryEmbedding(message));
  if (queryEmbedding) {
    const candidates = await runStep("Retrieving candidate incidents", "NIM Embed", () =>
      searchIncidents(queryEmbedding, 15, { service: incident.service, severity: incident.severity })
    );

    if (candidates && candidates.length > 0) {
      const deduped = dedupeCandidates(candidates);
      const reranked = await runStep("Reranking candidates", "NIM Rerank", () =>
        rerankCandidates(
          message,
          deduped.map((c) => ({
            id: c.id,
            text: c.description,
            service: c.service,
            root_cause: c.root_cause,
            fix_summary: c.fix_summary,
            created_at: c.created_at,
            fix_confirmed: c.fix_confirmed,
            fix_effectiveness_score: c.fix_effectiveness_score,
          }))
        )
      );

      citedRecords = (reranked || [])
        .filter((r) => r.score > RELEVANCE_THRESHOLD)
        .filter((r) => r.service === incident.service || r.score > CROSS_SERVICE_SCORE_THRESHOLD)
        .slice(0, MAX_CITED);
    }
  }

  const evidence = computeEvidence(citedRecords);

  const memoryContext = citedRecords.length
    ? `\n\nRELEVANT PAST INCIDENTS (retrieved from memory, ranked by relevance - there are exactly ${citedRecords.length}, cite only these, do not invent additional ones):\n${citedRecords
        .map(
          (r, i) =>
            `[${i + 1}] ${r.text}\n    Root cause: ${r.root_cause ?? "unknown"}\n    Fix: ${r.fix_summary ?? "unknown"}\n    Fix confirmed effective: ${r.fix_confirmed ? "yes" : "no"}`
        )
        .join("\n\n")}`
    : `\n\nNo sufficiently relevant past incidents were found in memory (candidates were retrieved but none passed the relevance threshold, or none existed).`;

  const codeSection = codeContext
    ? `\n\nRELEVANT CODE (provided by the engineer - this is real code from the actual system):\n\`\`\`\n${codeContext}\n\`\`\`\nYou may propose a specific patch or diff against this code if it addresses the engineer's question. Only change what is necessary.`
    : "";

  const systemPrompt = isInitialTriage
    ? `You are an on-call incident-response agent triaging a specific incident for an engineer. Respond in clean, well-structured markdown - this will be rendered as formatted text, so use real markdown syntax (## headers, **bold**, bullet lists, code blocks).

FORMAT (use exactly these headers, in this order, and OMIT a section entirely if you have nothing grounded to put there - do not pad):

## Root Cause
1-2 sentences, direct, grounded only in the incident details and any retrieved evidence below.

## RCA Confidence
A single percentage (e.g. "65%") on its own line, followed by one sentence explaining why. Base this on the STRENGTH AND QUANTITY of grounding evidence available to you right now - NOT on whether any past fix was confirmed effective, and NOT on how similar the wording feels. If little evidence exists, say so and give a low number.

## Evidence
Bullet points, only real ones. Skip this section if you have no real evidence beyond the incident description itself.

## Similar Historical Incidents
List only the past incidents actually given to you below, citing them as [1], [2], etc. with a one-line note on why each is relevant. If none were given to you, omit this section entirely.

## Recommended Fix
As many concrete, prioritized bullet points as the incident genuinely warrants - do not pad to a fixed count.

## Immediate Action
The single highest-priority next step, one line.

RULES:
- Do NOT include a "Historical Fix Evidence" section yourself - that is appended separately with verified numbers.
- Never invent metrics, logs, config values, file names, or incident records you were not given.

INCIDENT
Service: ${incident.service}
Severity: ${incident.severity}
Status: ${incident.status}
Description: ${incident.description}
Prior root cause analysis: ${incident.root_cause ?? "not yet analyzed"}
Prior fix suggestion: ${incident.fix_summary ?? "not yet determined"}${memoryContext}${codeSection}`
    : `You are an on-call incident-response agent continuing an ongoing conversation about a specific incident. This is a FOLLOW-UP message in an existing conversation, not a fresh triage request - the initial full analysis already happened earlier in this conversation.

Respond naturally and conversationally, in plain markdown where useful (not forced into headers). Answer what was actually asked - if it's a greeting or small talk, respond briefly and naturally, not with a report. If it's a real technical question, answer it directly and concisely, citing retrieved evidence below only if it's actually relevant to what was asked. Do not repeat the full Root Cause / RCA Confidence / Evidence template unless the engineer explicitly asks you to re-run or redo the analysis.

INCIDENT CONTEXT (for your reference, don't restate it unless asked)
Service: ${incident.service} | Severity: ${incident.severity} | Status: ${incident.status}
Description: ${incident.description}${memoryContext}${codeSection}`;

  const messages = [
    { role: "system", content: systemPrompt },
    ...history.map((h) => ({ role: h.role === "agent" ? "assistant" : "user", content: h.text })),
    { role: "user", content: message },
  ];

  const rawReply = await runStep("Generating response", "Groq", async () => {
    const res = await fetch(`${GROQ_BASE_URL}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${getCredential("GROQ_API_KEY")}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: process.env.GROQ_MODEL,
        messages,
        temperature: 0.2,
        max_tokens: 700,
      }),
    });
    if (!res.ok) throw new Error(`Groq chat request failed (${res.status}): ${await res.text()}`);
    const data = await res.json();
    return data.choices[0].message.content;
  });

  // Only append the deterministic evidence footer on the initial triage
  // response - a casual follow-up reply shouldn't always end with a
  // bolted-on stats block regardless of what was actually asked.
  const evidenceLine = evidence.similarIncidentsFound > 0
    ? `\n\n## Historical Fix Evidence\n${evidence.confirmedFixCount}/${evidence.similarIncidentsFound} similar incidents in memory had a human-confirmed effective fix${evidence.avgEffectiveness != null ? ` (average confirmed effectiveness ${Math.round(evidence.avgEffectiveness * 100)}%)` : ""}.`
    : `\n\n## Historical Fix Evidence\nNo similar incidents were found in memory, so there is no historical fix evidence to report.`;

  const text = rawReply
    ? isInitialTriage
      ? `${rawReply}${evidenceLine}`
      : rawReply
    : "I wasn't able to generate a response - please try again.";

  return {
    text,
    citedRecords: isInitialTriage ? citedRecords : [],
    evidence,
    trace,
    totalDurationMs: Date.now() - startedAt,
  };
}
