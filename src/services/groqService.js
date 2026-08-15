import { getCredential } from "./credentialStore.js";

const GROQ_BASE_URL = "https://api.groq.com/openai/v1";

const RELEVANCE_THRESHOLD = -8;

function buildEvidence(relevantMatches) {
  const total = relevantMatches.length;
  const confirmed = relevantMatches.filter((r) => r.fix_confirmed).length;
  const confirmedScores = relevantMatches
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

export async function analyzeIncident(newIncident, similarIncidents) {
  const relevantMatches = (similarIncidents || []).filter((r) => r.score > RELEVANCE_THRESHOLD);
  const evidence = buildEvidence(relevantMatches);

  const context = relevantMatches.length
    ? relevantMatches
        .map(
          (inc, i) =>
            `[${i + 1}] (relevance ${inc.score.toFixed(2)}) ${inc.text}\n    Past root cause: ${inc.root_cause ?? "unknown"}\n    Past fix: ${inc.fix_summary ?? "unknown"}\n    Fix confirmed effective: ${inc.fix_confirmed ? "yes" : "no"}`
        )
        .join("\n\n")
    : "(no sufficiently relevant past incidents found in memory)";

  const systemPrompt = `You are an incident-response assistant performing the first-pass analysis on a newly-created incident. Respond in clean markdown - this will be rendered as formatted text.

FORMAT (use exactly these headers, in this order, and OMIT a section entirely if you have nothing grounded to put there - do not pad):

## Root Cause
1-2 sentences, direct, grounded only in the incident description and any retrieved evidence below.

## RCA Confidence
A single percentage on its own line, followed by one sentence explaining why. Base this on the STRENGTH AND QUANTITY of grounding evidence right now - NOT on whether any past fix was confirmed effective. If little evidence exists, give a low number and say so plainly.

## Similar Historical Incidents
For each past incident actually given to you below, write one line per incident in this exact format: [N] <one-sentence description of what that past incident was, based on its text> - <one-sentence note on why it is relevant to this new incident>. Every citation MUST include real descriptive text - never write a bare [N] with nothing after it. If none were given to you, omit this section entirely - do not force a weak or unrelated match.

## Recommended Fix
As many concrete, prioritized bullet points as genuinely warranted - do not pad to a fixed count.

RULES:
- Never invent metrics, logs, config values, or incident records you were not given.
- Respond ONLY as valid JSON with keys: markdownResponse (string, the full formatted response above), rootCause (string, 1-2 sentences, same as in the markdown), fixSuggestion (string, short summary of the top recommended fix), confidence (0-1 number, matching the RCA Confidence percentage), citedIndexes (array of numbers, matching which of the numbered past incidents above were actually cited).

NEW INCIDENT
Service: ${newIncident.service}
Description: ${newIncident.description}

SIMILAR PAST INCIDENTS (relevance-filtered, ${relevantMatches.length} found)
${context}`;

  const res = await fetch(`${GROQ_BASE_URL}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${getCredential("GROQ_API_KEY")}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: process.env.GROQ_MODEL,
      messages: [{ role: "system", content: systemPrompt }],
      temperature: 0.2,
      response_format: { type: "json_object" },
    }),
  });
  if (!res.ok) throw new Error(`Groq request failed (${res.status}): ${await res.text()}`);
  const data = await res.json();
  const parsed = JSON.parse(data.choices[0].message.content);

  const evidenceLine = evidence.similarIncidentsFound > 0
    ? `\n\n## Historical Fix Evidence\n${evidence.confirmedFixCount}/${evidence.similarIncidentsFound} similar incidents in memory had a human-confirmed effective fix${evidence.avgEffectiveness != null ? ` (average confirmed effectiveness ${Math.round(evidence.avgEffectiveness * 100)}%)` : ""}.`
    : `\n\n## Historical Fix Evidence\nNo similar incidents were found in memory, so there is no historical fix evidence to report.`;

  return {
    markdownResponse: `${parsed.markdownResponse || ""}${evidenceLine}`,
    rootCause: parsed.rootCause,
    fixSuggestion: parsed.fixSuggestion,
    confidence: parsed.confidence,
    citedRecordIds: (parsed.citedIndexes || []).map((i) => relevantMatches[i - 1]?.id).filter(Boolean),
    evidence,
  };
}
