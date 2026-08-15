import express from "express";
import { runConnectionRecoveryTest } from "../services/resilienceService.js";

export const resilienceRouter = express.Router();

resilienceRouter.post("/connection-recovery-test", async (req, res) => {
  try {
    const result = await runConnectionRecoveryTest();
    res.json(result);
  } catch (err) {
    console.error("Connection recovery test failed:", err);
    res.status(500).json({ error: err.message });
  }
});
