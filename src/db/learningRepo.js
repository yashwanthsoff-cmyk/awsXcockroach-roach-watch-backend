import { getPool } from "./pool.js";
import { setIncidentStatus } from "./incidentRepo.js";

const BASE_CONFIRMED_SCORE = 0.6;
const MAX_REPEAT_BONUS = 0.2;
const REPEAT_BONUS_PER_CONFIRMATION = 0.05;
const TIME_HELD_FULL_BONUS_DAYS = 60;
const MAX_TIME_HELD_BONUS = 0.2;
const MIN_HOURS_BETWEEN_COUNTED_CONFIRMATIONS = 24;

function computeScore({ confirmationCount, daysHeld }) {
  const repeatBonus = Math.min(MAX_REPEAT_BONUS, confirmationCount * REPEAT_BONUS_PER_CONFIRMATION);
  const timeBonus = Math.min(MAX_TIME_HELD_BONUS, (daysHeld / TIME_HELD_FULL_BONUS_DAYS) * MAX_TIME_HELD_BONUS);
  return Math.min(1, BASE_CONFIRMED_SCORE + repeatBonus + timeBonus);
}

/**
 * A fix can be confirmed while the incident is 'resolved' (first-ever
 * confirmation) or 'monitoring' (re-confirming trust in a fix that's
 * already being actively watched by Recurrence Watch). Both are valid
 * pre-states - excluding 'monitoring' here previously made every
 * confirmed incident permanently unconfirmable again, since the first
 * confirmation always transitions status to 'monitoring'.
 */
export async function confirmFix(incidentId) {
  const pool = getPool();

  const existing = await pool.query(
    `SELECT fix_confirmation_count, fix_held_since, fix_last_confirmed_at, fix_confirmed, status
     FROM incidents WHERE id = $1 AND status IN ('resolved', 'monitoring')`,
    [incidentId]
  );
  if (existing.rows.length === 0) {
    throw new Error("Incident not found or not in a confirmable status (must be resolved or monitoring)");
  }

  const row = existing.rows[0];
  const now = new Date();
  const lastConfirmedAt = row.fix_last_confirmed_at ? new Date(row.fix_last_confirmed_at) : null;
  const hoursSinceLastConfirm = lastConfirmedAt ? (now - lastConfirmedAt) / (1000 * 60 * 60) : Infinity;

  const isFirstConfirmation = !row.fix_confirmed;
  const cooldownPassed = hoursSinceLastConfirm >= MIN_HOURS_BETWEEN_COUNTED_CONFIRMATIONS;

  if (!isFirstConfirmation && !cooldownPassed) {
    const currentScore = await pool.query(
      `SELECT id, service, description, fix_confirmed, fix_effectiveness_score, fix_confirmation_count, fix_held_since, status
       FROM incidents WHERE id = $1`,
      [incidentId]
    );
    const hoursRemaining = Math.ceil(MIN_HOURS_BETWEEN_COUNTED_CONFIRMATIONS - hoursSinceLastConfirm);
    return {
      ...currentScore.rows[0],
      alreadyConfirmedRecently: true,
      hoursUntilNextCountedConfirmation: hoursRemaining,
    };
  }

  const newCount = (row.fix_confirmation_count || 0) + 1;
  const heldSince = row.fix_held_since || now;
  const daysHeld = (now - new Date(heldSince).getTime()) / (1000 * 60 * 60 * 24);
  const score = computeScore({ confirmationCount: newCount, daysHeld });

  const result = await pool.query(
    `UPDATE incidents
     SET fix_confirmed = true,
         fix_effectiveness_score = $2,
         fix_confirmation_count = $3,
         fix_held_since = COALESCE(fix_held_since, now()),
         fix_last_confirmed_at = now()
     WHERE id = $1
     RETURNING id, service, description, fix_confirmed, fix_effectiveness_score, fix_confirmation_count, fix_held_since, status`,
    [incidentId, score, newCount]
  );

  let updatedRow = result.rows[0];

  // A resolved incident that just got its first confirmation moves into
  // 'monitoring' - the recurrence system actively watches it from here.
  // Already-monitoring incidents being re-confirmed stay in monitoring.
  if (updatedRow.status === "resolved") {
    await setIncidentStatus(incidentId, "monitoring");
    updatedRow = { ...updatedRow, status: "monitoring" };
  }

  return { ...updatedRow, alreadyConfirmedRecently: false };
}

export async function downgradeFixEffectiveness(incidentId) {
  await getPool().query(
    `UPDATE incidents
     SET fix_effectiveness_score = GREATEST(0.1, fix_effectiveness_score - 0.4),
         fix_held_since = now()
     WHERE id = $1`,
    [incidentId]
  );
}

export function explainEffectiveness(incident) {
  if (!incident.fix_confirmed) {
    return "Not yet confirmed by an engineer.";
  }
  const parts = ["Confirmed by an engineer"];
  const count = incident.fix_confirmation_count || 0;
  if (count > 1) parts.push(`confirmed ${count} times`);
  if (incident.fix_held_since) {
    const daysHeld = Math.floor((Date.now() - new Date(incident.fix_held_since).getTime()) / (1000 * 60 * 60 * 24));
    if (daysHeld > 0) parts.push(`held for ${daysHeld} day${daysHeld === 1 ? "" : "s"} with no recurrence`);
  }
  return parts.join(" • ");
}

function explainLearningStats({ confirmedFixes, fixesThatRegressed, avgEffectiveness }) {
  if (confirmedFixes === 0) {
    return "No fixes have been confirmed by an engineer yet - the system has no verified outcomes to learn from.";
  }
  const held = confirmedFixes - fixesThatRegressed;
  const pct = avgEffectiveness != null ? Math.round(avgEffectiveness * 100) : null;
  let summary = `${held} of ${confirmedFixes} confirmed fix${confirmedFixes === 1 ? "" : "es"} ${held === confirmedFixes ? "have" : "has"} held with no detected recurrence`;
  if (fixesThatRegressed > 0) {
    summary += `, while ${fixesThatRegressed} regressed and had its trust automatically lowered`;
  }
  if (pct != null) {
    summary += `. Average confirmed-fix effectiveness is currently ${pct}%`;
  }
  return summary + ".";
}

export async function getLearningStats() {
  const result = await getPool().query(
    `SELECT
       count(*) FILTER (WHERE fix_confirmed = true) AS confirmed_fixes,
       count(*) FILTER (WHERE fix_confirmed = true AND fix_effectiveness_score <= 0.5) AS fixes_that_regressed,
       avg(fix_effectiveness_score) FILTER (WHERE fix_confirmed = true) AS avg_effectiveness
     FROM incidents`
  );
  const row = result.rows[0];
  const stats = {
    confirmedFixes: parseInt(row.confirmed_fixes) || 0,
    fixesThatRegressed: parseInt(row.fixes_that_regressed) || 0,
    avgEffectiveness: row.avg_effectiveness ? parseFloat(row.avg_effectiveness) : null,
  };
  return { ...stats, explanation: explainLearningStats(stats) };
}
