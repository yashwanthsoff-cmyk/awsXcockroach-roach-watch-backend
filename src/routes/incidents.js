import express from "express";
import { createIncidentFromInput } from "../services/incidentPipeline.js";
import { getIncident, listIncidents, countIncidents, resolveIncident } from "../db/incidentRepo.js";

export const incidentsRouter = express.Router();

const VALID_SEVERITIES = ["low", "medium", "high", "critical"];
const MAX_LIMIT = 500;
const DEFAULT_LIMIT = 100;

function validateIncidentInput(body) {
  const errors = [];
  if (!body.service || typeof body.service !== "string" || body.service.trim().length === 0) {
    errors.push("service is required and must be a non-empty string");
  } else if (body.service.length > 100) {
    errors.push("service must be under 100 characters");
  }
  if (!body.severity || !VALID_SEVERITIES.includes(body.severity)) {
    errors.push(`severity is required and must be one of: ${VALID_SEVERITIES.join(", ")}`);
  }
  if (!body.description || typeof body.description !== "string" || body.description.trim().length === 0) {
    errors.push("description is required and must be a non-empty string");
  } else if (body.description.length > 2000) {
    errors.push("description must be under 2000 characters");
  }
  return errors;
}

/**
 * Parses a query param as a non-negative integer. Returns null if the
 * param was omitted (caller should use a default), or throws-by-return
 * an error message if it was provided but invalid - rejecting bad input
 * explicitly instead of silently coercing "abc" or "-5" into a fallback.
 */
function parseNonNegativeInt(value, paramName) {
  if (value === undefined) return { value: null, error: null };
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) {
    return { value: null, error: `${paramName} must be a non-negative integer` };
  }
  return { value: parsed, error: null };
}

incidentsRouter.get("/", async (req, res) => {
  const limitResult = parseNonNegativeInt(req.query.limit, "limit");
  const offsetResult = parseNonNegativeInt(req.query.offset, "offset");
  const errors = [limitResult.error, offsetResult.error].filter(Boolean);
  if (errors.length > 0) {
    return res.status(400).json({ error: "Validation failed", details: errors });
  }

  const requestedLimit = limitResult.value ?? DEFAULT_LIMIT;
  const limit = Math.min(requestedLimit, MAX_LIMIT);
  const offset = offsetResult.value ?? 0;

  try {
    const [incidents, total] = await Promise.all([listIncidents(limit, offset), countIncidents()]);
    res.json({
      incidents,
      pagination: {
        total,
        limit,
        offset,
        returned: incidents.length,
        hasMore: offset + incidents.length < total,
      },
    });
  } catch (err) {
    console.error("List incidents failed:", err);
    res.status(500).json({ error: err.message });
  }
});

incidentsRouter.post("/", async (req, res) => {
  const validationErrors = validateIncidentInput(req.body);
  if (validationErrors.length > 0) {
    return res.status(400).json({ error: "Validation failed", details: validationErrors });
  }

  const { service, severity, description } = req.body;

  try {
    const result = await createIncidentFromInput({ service, severity, description, source: "manual" });
    res.status(201).json(result);
  } catch (err) {
    console.error("Core incident write failed:", err);
    res.status(502).json({
      error: "Failed to create incident (embedding or database write failed)",
      detail: err.message,
    });
  }
});

incidentsRouter.get("/:id", async (req, res) => {
  const incident = await getIncident(req.params.id);
  if (!incident) return res.status(404).json({ error: "Not found" });
  res.json(incident);
});

incidentsRouter.post("/:id/resolve", async (req, res) => {
  try {
    const incident = await getIncident(req.params.id);
    if (!incident) return res.status(404).json({ error: "Not found" });

    const result = await resolveIncident(req.params.id);
    res.json(result);
  } catch (err) {
    console.error("Resolve incident failed:", err);
    res.status(500).json({ error: err.message });
  }
});
