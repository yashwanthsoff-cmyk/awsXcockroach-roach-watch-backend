import express from "express";
import { checkRecurrence } from "../services/recurrenceService.js";

export const recurrenceRouter = express.Router();

recurrenceRouter.get("/watch-list", async (req, res) => {
  try {
    const watchList = await checkRecurrence();
    res.json({ watchList });
  } catch (err) {
    console.error("Recurrence check failed:", err);
    res.status(500).json({ error: err.message });
  }
});
