import { getPool } from "./pool.js";

export async function insertIncident({ service, severity, description, embedding }) {
  const result = await getPool().query(
    `INSERT INTO incidents (service, severity, description, embedding)
     VALUES ($1, $2, $3, $4)
     RETURNING id, service, severity, status, description, created_at`,
    [service, severity, description, JSON.stringify(embedding)]
  );
  return result.rows[0];
}

export async function listIncidents(limit = 100, offset = 0) {
  const result = await getPool().query(
    `SELECT id, service, severity, status, description, root_cause, fix_summary, created_at, resolved_at,
            fix_confirmed, fix_effectiveness_score
     FROM incidents
     ORDER BY created_at DESC
     LIMIT $1 OFFSET $2`,
    [limit, offset]
  );
  return result.rows;
}

export async function countIncidents() {
  const result = await getPool().query(`SELECT count(*) AS total FROM incidents`);
  return parseInt(result.rows[0].total);
}

export async function findSimilarIncidents(embedding, excludeId, limit = 5, context = {}) {
  const service = context.service ?? null;
  const severity = context.severity ?? null;

  const result = await getPool().query(
    `SELECT id, service, description, root_cause, fix_summary,
            fix_confirmed, fix_effectiveness_score,
            1 - (embedding <=> $1) AS similarity
     FROM incidents
     WHERE id != $2 AND embedding IS NOT NULL
     ORDER BY
       (1 - (embedding <=> $1))
       + (fix_effectiveness_score * 0.15)
       + (CASE WHEN $4::STRING IS NOT NULL AND service = $4 THEN 0.2 ELSE 0 END)
       + (CASE WHEN $5::STRING IS NOT NULL AND severity = $5 THEN 0.05 ELSE 0 END)
       DESC
     LIMIT $3`,
    [JSON.stringify(embedding), excludeId, limit, service, severity]
  );
  return result.rows;
}

export async function searchIncidents(embedding, limit = 5, context = {}) {
  const service = context.service ?? null;
  const severity = context.severity ?? null;

  const result = await getPool().query(
    `SELECT id, service, description, root_cause, fix_summary, created_at,
            fix_confirmed, fix_effectiveness_score,
            1 - (embedding <=> $1) AS similarity
     FROM incidents
     WHERE embedding IS NOT NULL
     ORDER BY
       (1 - (embedding <=> $1))
       + (fix_effectiveness_score * 0.15)
       + (CASE WHEN $3::STRING IS NOT NULL AND service = $3 THEN 0.2 ELSE 0 END)
       + (CASE WHEN $4::STRING IS NOT NULL AND severity = $4 THEN 0.05 ELSE 0 END)
       DESC
     LIMIT $2`,
    [JSON.stringify(embedding), limit, service, severity]
  );
  return result.rows;
}

/**
 * status defaults to 'investigating' (the pre-lifecycle behavior) but
 * incidentPipeline.js now passes 'fix_proposed' when analysis succeeds
 * with a real, non-degraded fix - 'investigating' is reserved for the
 * genuinely-still-working case (degraded/failed analysis).
 * markdownResponse persists the full structured RCA (headers, cited
 * incidents with real text, evidence line) so the detail page can
 * render it on every future visit, not just right after creation.
 */
export async function saveAnalysis(incidentId, { rootCause, fixSuggestion, markdownResponse = null, status = "investigating" }) {
  await getPool().query(
    `UPDATE incidents SET root_cause = $1, fix_summary = $2, markdown_response = $5, status = $4 WHERE id = $3`,
    [rootCause, fixSuggestion, incidentId, status, markdownResponse]
  );
}

/**
 * The only route that actually marks an incident resolved - this never
 * existed before (every 'resolved' status this whole session was set
 * manually via SQL). Non-blocking by design: doesn't hard-require the
 * incident to be in 'fix_proposed' first, since a rigid guard could
 * break the demo on an edge case - it logs the transition as irregular
 * instead of rejecting it outright.
 */
export async function resolveIncident(incidentId) {
  const pool = getPool();
  const existing = await pool.query(`SELECT status FROM incidents WHERE id = $1`, [incidentId]);
  if (existing.rows.length === 0) {
    throw new Error("Incident not found");
  }
  const currentStatus = existing.rows[0].status;
  const irregular = currentStatus !== "fix_proposed";
  if (irregular) {
    console.warn(`[lifecycle] Resolving incident ${incidentId} from unexpected status '${currentStatus}' (expected 'fix_proposed')`);
  }

  const result = await pool.query(
    `UPDATE incidents SET status = 'resolved', resolved_at = now() WHERE id = $1
     RETURNING id, service, status, resolved_at`,
    [incidentId]
  );
  return { ...result.rows[0], irregularTransition: irregular, previousStatus: currentStatus };
}

/**
 * Generic status-set used by the recurrence auto-revert (resolved/
 * monitoring -> investigating on high-confidence regression). Kept
 * separate from resolveIncident since this path never touches
 * resolved_at - a reopened incident isn't "resolved again from scratch."
 */
export async function setIncidentStatus(incidentId, status) {
  await getPool().query(`UPDATE incidents SET status = $2 WHERE id = $1`, [incidentId, status]);
}

export async function getIncident(id) {
  const result = await getPool().query(`SELECT * FROM incidents WHERE id = $1`, [id]);
  return result.rows[0];
}

