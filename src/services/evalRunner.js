import { getPool } from "../db/pool.js";
import { createIncidentFromInput } from "./incidentPipeline.js";
import { evalCases } from "./evalCases.js";

// A positive rerank score is used as the "genuinely relevant" bar
// elsewhere in this codebase (chatService.js's cross-service filter) -
// reused here for consistency. This replaces the LLM's self-reported
// confidence number as the match/no-match signal, since that number is
// sampled with non-zero temperature and varies run-to-run on identical
// input - the rerank score, computed directly from embeddings and the
// reranker (not LLM-generated text), is materially more stable.
const MATCH_SCORE_THRESHOLD = 0;

export async function runEval() {
  const results = [];
  const createdIds = [];

  for (const testCase of evalCases) {
    const result = await createIncidentFromInput({
      service: testCase.service,
      severity: "medium",
      description: testCase.description,
      source: "eval",
    });
    createdIds.push(result.incident.id);

    const topScore = result.similarIncidents?.[0]?.score ?? null;
    const actualMatch = topScore !== null && topScore > MATCH_SCORE_THRESHOLD;
    const correct = actualMatch === testCase.expectMatch;

    results.push({
      id: testCase.id,
      expectedTopic: testCase.expectedTopic,
      expectMatch: testCase.expectMatch,
      actualMatch,
      topScore,
      confidence: result.analysis.confidence,
      citedCount: result.analysis.citedRecordIds.length,
      correct,
    });
  }

  const correctCount = results.filter((r) => r.correct).length;
  const accuracy = correctCount / results.length;

  let cleanup = { deleted: 0, error: null };
  try {
    if (createdIds.length > 0) {
      const deleteResult = await getPool().query(
        `DELETE FROM incidents WHERE id = ANY($1::UUID[])`,
        [createdIds]
      );
      cleanup.deleted = deleteResult.rowCount;
    }
  } catch (err) {
    console.error("Eval cleanup failed (non-fatal):", err.message);
    cleanup.error = err.message;
  }

  return {
    accuracy,
    correctCount,
    totalCases: results.length,
    scoringMethod: "deterministic rerank score (> 0), not LLM self-reported confidence",
    results,
    cleanup,
  };
}
