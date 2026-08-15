import express from "express";
import { listTools, runInspection } from "../services/mcpService.js";

export const mcpRouter = express.Router();

mcpRouter.get("/tools", async (req, res) => {
  try {
    const tools = await listTools();
    res.json({ tools });
  } catch (err) {
    console.error("MCP tool discovery failed:", err);
    res.status(500).json({ error: err.message });
  }
});

mcpRouter.post("/inspect", async (req, res) => {
  try {
    const result = await runInspection();
    res.json(result);
  } catch (err) {
    console.error("MCP inspection failed:", err);
    res.status(500).json({ error: err.message });
  }
});
