import express from "express";
import { chatAboutIncident } from "../services/chatService.js";
import { getIncident } from "../db/incidentRepo.js";

export const agentRouter = express.Router();

agentRouter.post("/message", async (req, res) => {
  const { incidentId, message, history, codeContext } = req.body;

  if (!incidentId || !message) {
    return res.status(400).json({ error: "incidentId and message are required" });
  }

  try {
    const incident = await getIncident(incidentId);
    if (!incident) {
      return res.status(404).json({ error: "Incident not found" });
    }

    const result = await chatAboutIncident({ incident, message, history: history || [], codeContext: codeContext || null });

    res.json({
      text: result.text,
      citedRecords: result.citedRecords,
      evidence: result.evidence,
      trace: result.trace,
      totalDurationMs: result.totalDurationMs,
      toolsUsed: [...new Set(result.trace.filter((t) => t.ok).map((t) => t.tool))],
      hadCodeContext: !!codeContext,
    });
  } catch (err) {
    console.error("Agent chat failed:", err);
    res.status(502).json({ error: "Agent chat failed", detail: err.message });
  }
});
