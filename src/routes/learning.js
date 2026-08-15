import express from "express";
import { confirmFix, getLearningStats, explainEffectiveness } from "../db/learningRepo.js";
import { getIncident } from "../db/incidentRepo.js";

export const learningRouter = express.Router();

/**
 * A human confirms that a resolved incident's fix actually worked.
 * This is the real signal that boosts the record's trust in future
 * search/rerank - not automatic, someone verified it. Returns the
 * updated record plus a structured, user-facing explanation of the
 * new score.
 */
learningRouter.post("/confirm-fix/:incidentId", async (req, res) => {
  try {
    const result = await confirmFix(req.params.incidentId);
    res.json({ ...result, explanation: explainEffectiveness(result) });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

/**
 * Returns a single incident's effectiveness score with its structured
 * explanation - used by the UI to show "why" a fix is trusted, not
 * just a bare percentage.
 */
learningRouter.get("/explain/:incidentId", async (req, res) => {
  try {
    const incident = await getIncident(req.params.incidentId);
    if (!incident) return res.status(404).json({ error: "Incident not found" });
    res.json({
      incidentId: incident.id,
      fixEffectivenessScore: incident.fix_effectiveness_score,
      explanation: explainEffectiveness(incident),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

learningRouter.get("/stats", async (req, res) => {
  try {
    const stats = await getLearningStats();
    res.json(stats);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
