import express from "express";
import { readonlyPool } from "../db/readonlyPool.js";

export const statusRouter = express.Router();

/**
 * Real, per-dependency health check - actually queries CockroachDB
 * (not just "is the Node process alive") and reports latency. Groq and
 * NVIDIA don't have public unauthenticated health endpoints, so those
 * report "configured" (key present) rather than faking a live ping -
 * an honest distinction, not a full active check.
 */
statusRouter.get("/", async (req, res) => {
  const status = { cockroachdb: null, groq: null, nvidia: null, aws: null };

  try {
    const start = Date.now();
    await readonlyPool.query("SELECT 1");
    status.cockroachdb = { status: "connected", latencyMs: Date.now() - start };
  } catch (err) {
    status.cockroachdb = { status: "degraded", error: err.message };
  }

  status.groq = { status: process.env.GROQ_API_KEY ? "configured" : "not_configured" };
  status.nvidia = { status: process.env.NVIDIA_API_KEY ? "configured" : "not_configured" };
  status.aws = { status: process.env.AWS_ACCESS_KEY_ID ? "configured" : "not_configured" };

  res.json(status);
});
