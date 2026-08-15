import express from "express";
import { readonlyPool } from "../db/readonlyPool.js";

export const statsRouter = express.Router();

statsRouter.get("/", async (req, res) => {
  try {
    const totalsResult = await readonlyPool.query(
      `SELECT
         count(*) AS total,
         count(*) FILTER (WHERE status IN ('open', 'investigating', 'fix_proposed')) AS active,
         count(*) FILTER (WHERE status = 'resolved') AS resolved,
         count(*) FILTER (WHERE status = 'monitoring') AS monitoring,
         count(*) FILTER (WHERE status = 'fix_proposed') AS fix_proposed
       FROM incidents`
    );

    const confidenceResult = await readonlyPool.query(
      `SELECT root_cause FROM incidents WHERE root_cause IS NOT NULL`
    );

    const totals = totalsResult.rows[0];

    res.json({
      totalIncidents: parseInt(totals.total),
      activeIncidents: parseInt(totals.active),
      resolvedIncidents: parseInt(totals.resolved),
      monitoringIncidents: parseInt(totals.monitoring),
      fixProposedIncidents: parseInt(totals.fix_proposed),
      analyzedIncidents: confidenceResult.rows.length,
    });
  } catch (err) {
    console.error("Stats query failed:", err);
    res.status(500).json({ error: err.message });
  }
});
