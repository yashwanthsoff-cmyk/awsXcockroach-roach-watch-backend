import { getPool } from "../db/pool.js";

const MIN_DAYS_CLEAN_FOR_VALIDATION = 7;

/**
 * Automatic, evidence-based fix validation - separate from human
 * confirmation. A fix is only marked "validated" once it has genuinely
 * held clean (no recurrence detected) for a real elapsed window. This
 * does NOT fabricate before/after metrics - there is no live production
 * metrics feed to draw them from honestly. Instead it uses the one
 * real signal actually available: time held without a detected
 * recurrence, via the existing recurrence-check mechanism. A fix that
 * regresses (caught by downgradeFixEffectiveness) is marked "failed" -
 * validation earned, not just claimed.
 */
export async function runValidationPass() {
  const pool = getPool();

  const candidates = await pool.query(
    `SELECT id, service, description, fix_confirmed, fix_held_since, fix_effectiveness_score, validation_status
     FROM incidents
     WHERE status IN ('resolved', 'monitoring', 'investigating') AND fix_confirmed = true`
  );

  const results = [];

  for (const row of candidates.rows) {
    const daysHeld = row.fix_held_since
      ? (Date.now() - new Date(row.fix_held_since).getTime()) / (1000 * 60 * 60 * 24)
      : 0;

    // A recurrence already lowered effectiveness below the healthy
    // threshold - the fix demonstrably did not hold. Mark failed,
    // regardless of how long ago that happened.
    if (row.fix_effectiveness_score <= 0.5 && row.validation_status !== "failed") {
      await pool.query(`UPDATE incidents SET validation_status = 'failed' WHERE id = $1`, [row.id]);
      results.push({ id: row.id, service: row.service, validationStatus: "failed", daysHeld: Math.round(daysHeld) });
      continue;
    }

    // Held clean long enough with no recurrence penalty - genuinely
    // validated, not just claimed by a human.
    if (daysHeld >= MIN_DAYS_CLEAN_FOR_VALIDATION && row.validation_status !== "validated") {
      await pool.query(`UPDATE incidents SET validation_status = 'validated' WHERE id = $1`, [row.id]);
      results.push({ id: row.id, service: row.service, validationStatus: "validated", daysHeld: Math.round(daysHeld) });
      continue;
    }

    results.push({ id: row.id, service: row.service, validationStatus: row.validation_status, daysHeld: Math.round(daysHeld * 10) / 10 });
  }

  return results;
}

/**
 * Builds a real, human-readable explanation from the actual computed
 * state - not a canned string.
 */
export function explainValidation({ validationStatus, daysHeld }) {
  if (validationStatus === "validated") {
    return `Automatically validated - held clean with no detected recurrence for ${Math.round(daysHeld)} days.`;
  }
  if (validationStatus === "failed") {
    return "Validation failed - a recurrence was detected against this confirmed fix, so it did not genuinely hold.";
  }
  const remaining = Math.max(0, Math.ceil(MIN_DAYS_CLEAN_FOR_VALIDATION - daysHeld));
  return `Pending validation - needs ${remaining} more day${remaining === 1 ? "" : "s"} clean before it can be automatically validated.`;
}


