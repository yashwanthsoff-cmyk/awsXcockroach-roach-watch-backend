import express from "express";
import { runEval } from "../services/evalRunner.js";

export const evalRouter = express.Router();

evalRouter.post("/run", async (req, res) => {
  try {
    const report = await runEval();
    res.json(report);
  } catch (err) {
    console.error("Eval run failed:", err);
    res.status(500).json({ error: err.message });
  }
});
