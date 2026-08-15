import { readonlyPool } from "../db/readonlyPool.js";

/**
 * Checks whether a very similar OPEN incident already exists before
 * creating a new one. Uses the existing vector index - no new
 * infrastructure. A high similarity score against an already-open
 * incident is a strong signal this is the same underlying event being
 * reported twice (e.g. two monitors firing for one outage), not two
 * separate problems.
 */
export async function findOpenDuplicate(embedding, similarityThreshold = 0.93) {
  const result = await readonlyPool.query(
    `SELECT id, service, description,
            1 - (embedding <=> $1) AS similarity
     FROM incidents
     WHERE status != 'resolved' AND embedding IS NOT NULL
     ORDER BY embedding <=> $1
     LIMIT 1`,
    [JSON.stringify(embedding)]
  );

  const topMatch = result.rows[0];
  if (topMatch && topMatch.similarity >= similarityThreshold) {
    return topMatch;
  }
  return null;
}
