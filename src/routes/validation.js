import express from "express";
import { runValidationPass, explainValidation } from "../services/validationService.js";

export const validationRouter = express.Router();

validationRouter.post("/run", async (req, res) => {
  try {
    const results = await runValidationPass();
    const withExplanations = results.map((r) => ({ ...r, explanation: explainValidation(r) }));
    res.json({ results: withExplanations });
  } catch (err) {
    console.error("Validation pass failed:", err);
    res.status(500).json({ error: err.message });
  }
});
