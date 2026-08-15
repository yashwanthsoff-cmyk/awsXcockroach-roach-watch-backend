import { getPool } from "../db/pool.js";
import { createQueryEmbedding } from "./embeddingService.js";
import { rerankCandidates } from "./rerankService.js";
import { downgradeFixEffectiveness } from "../db/learningRepo.js";
import { setIncidentStatus } from "../db/incidentRepo.js";

function timeDecayWeight(daysSinceResolution) {
  if (daysSinceResolution < 0) return 1;
  if (daysSinceResolution <= 7) return 1.0;
  if (daysSinceResolution <= 30) return 0.75;
  if (daysSinceResolution <= 90) return 0.45;
  if (daysSinceResolution <= 180) return 0.25;
  return 0.1;
}

function normalizeScore(score) {
  return 1 / (1 + Math.exp(-score / 8));
}

function explainRecurrence({ riskLevel, recurrenceConfidence, daysSinceResolution, topMatch, reopened }) {
  if (!topMatch) {
    return "No open incidents created after the fix exist to compare against - nothing to watch for recurrence yet.";
  }
  const pct = Math.round(recurrenceConfidence * 100);
  const timing =
    daysSinceResolution == null
      ? ""
      : daysSinceResolution <= 1
        ? "less than a day after the fix"
        : daysSinceResolution <= 7
          ? `${Math.round(daysSinceResolution)} days after the fix`
          : daysSinceResolution <= 30
            ? `${Math.round(daysSinceResolution / 7)} weeks after the fix`
            : `${Math.round(daysSinceResolution / 30)} months after the fix`;

  if (riskLevel === "high") {
    const reopenNote = reopened ? " The incident has been automatically reopened to 'investigating'." : "";
    return `${pct}% recurrence confidence - a closely matching incident appeared ${timing}, which is strong evidence the original fix did not hold.${reopenNote}`;
  }
  if (riskLevel === "medium") {
    return `${pct}% recurrence confidence - a somewhat similar incident appeared ${timing}. Worth a look, but not strong enough evidence alone to call this a confirmed regression.`;
  }
  return `${pct}% recurrence confidence - the closest match appeared ${timing}, which is too weak or too distant in time to suggest the fix failed.`;
}

export async function checkRecurrence() {
  const pool = getPool();

  const resolvedResult = await pool.query(
    `SELECT id, service, description, root_cause, fix_summary, resolved_at, fix_confirmed, fix_effectiveness_score
     FROM incidents WHERE status IN ('resolved', 'monitoring')`
  );
  const resolvedIncidents = resolvedResult.rows;

  const openResult = await pool.query(
    `SELECT id, service, description, created_at
     FROM incidents WHERE status NOT IN ('resolved', 'monitoring')`
  );
  const openIncidents = openResult.rows;

  const watchList = [];

  for (const resolved of resolvedIncidents) {
    const eligibleOpenIncidents = openIncidents.filter(
      (o) => new Date(o.created_at) > new Date(resolved.resolved_at)
    );

    if (eligibleOpenIncidents.length === 0) {
      watchList.push({
        ...resolved,
        riskLevel: "low",
        matchedIncident: null,
        effectivenessDowngraded: false,
        reopened: false,
        recurrenceConfidence: 0,
        daysSinceResolution: null,
        explanation: explainRecurrence({ riskLevel: "low", recurrenceConfidence: 0, daysSinceResolution: null, topMatch: null, reopened: false }),
      });
      continue;
    }

    const queryEmbedding = await createQueryEmbedding(resolved.description);
    const reranked = await rerankCandidates(
      resolved.description,
      eligibleOpenIncidents.map((o) => ({ id: o.id, text: o.description, created_at: o.created_at }))
    );

    const topMatch = reranked[0];

    let riskLevel = "low";
    let recurrenceConfidence = 0;
    let daysSinceResolution = null;
    let timeWeight = 0;

    if (topMatch) {
      daysSinceResolution =
        (new Date(topMatch.created_at) - new Date(resolved.resolved_at)) / (1000 * 60 * 60 * 24);
      timeWeight = timeDecayWeight(daysSinceResolution);
      const semanticConfidence = normalizeScore(topMatch.score);
      recurrenceConfidence = semanticConfidence * timeWeight;

      if (recurrenceConfidence >= 0.55) riskLevel = "high";
      else if (recurrenceConfidence >= 0.3) riskLevel = "medium";
    }

    let effectivenessDowngraded = false;
    let reopened = false;
    if (riskLevel === "high" && recurrenceConfidence >= 0.55) {
      if (resolved.fix_confirmed) {
        await downgradeFixEffectiveness(resolved.id);
        effectivenessDowngraded = true;
      }
      // High-confidence regression means the problem is genuinely back -
      // the incident is reopened into 'investigating' regardless of
      // whether it was 'resolved' or already 'monitoring', closing the
      // loop between recurrence detection and the incident lifecycle.
      await setIncidentStatus(resolved.id, "investigating");
      reopened = true;
    }

    const roundedConfidence = Math.round(recurrenceConfidence * 100) / 100;
    const roundedDays = daysSinceResolution !== null ? Math.round(daysSinceResolution * 10) / 10 : null;

    watchList.push({
      ...resolved,
      riskLevel,
      matchedIncident: riskLevel !== "low" ? topMatch : null,
      effectivenessDowngraded,
      reopened,
      recurrenceConfidence: roundedConfidence,
      daysSinceResolution: roundedDays,
      explanation: explainRecurrence({ riskLevel, recurrenceConfidence: roundedConfidence, daysSinceResolution: roundedDays, topMatch, reopened }),
    });
  }

  return watchList;
}
