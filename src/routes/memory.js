import express from "express";
import { createQueryEmbedding } from "../services/embeddingService.js";
import { rerankCandidates } from "../services/rerankService.js";
import { searchIncidents } from "../db/incidentRepo.js";

export const memoryRouter = express.Router();

memoryRouter.get("/search", async (req, res) => {
  const query = req.query.q;
  if (!query) {
    return res.status(400).json({ error: "query param 'q' is required" });
  }

  try {
    const startedAt = Date.now();

    const queryEmbedding = await createQueryEmbedding(query);
    const candidates = await searchIncidents(queryEmbedding, 5);
    const dbCompletedAt = Date.now();

    const reranked = await rerankCandidates(
      query,
      candidates.map((c) => ({
        id: c.id,
        text: c.description,
        service: c.service,
        root_cause: c.root_cause,
        fix_summary: c.fix_summary,
        created_at: c.created_at,
      }))
    );

    const totalLatencyMs = Date.now() - startedAt;
    // Real per-result timing: how long after the request started this
    // specific result was ready, not a wall-clock timestamp.
    const dbLatencyMs = dbCompletedAt - startedAt;

    const results = reranked.map((r) => ({
      ...r,
      retrievedAfterMs: totalLatencyMs,
      dbLatencyMs,
    }));

    res.json({ query, results, totalLatencyMs });
  } catch (err) {
    console.error("Memory search failed:", err);
    res.status(500).json({ error: err.message });
  }
});
