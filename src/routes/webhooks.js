import express from "express";
import { createIncidentFromInput } from "../services/incidentPipeline.js";

export const webhooksRouter = express.Router();

const SEVERITY_MAP = {
  critical: "critical", crit: "critical", p1: "critical", sev1: "critical",
  high: "high", p2: "high", sev2: "high", error: "high",
  medium: "medium", p3: "medium", sev3: "medium", warning: "medium", warn: "medium",
  low: "low", p4: "low", sev4: "low", info: "low",
};

function normalizeSeverity(raw) {
  if (!raw) return "medium";
  const key = String(raw).toLowerCase().trim();
  return SEVERITY_MAP[key] || "medium";
}

/**
 * Accepts common alert-payload shapes from external monitoring tools.
 * Different tools name fields differently (title vs summary vs
 * alert_name, message vs description vs details) - this normalizes
 * them instead of forcing every integration to match one exact shape.
 * Exported so the authenticated /simulate route can reuse identical
 * normalization logic without duplicating it.
 */
export function normalizeWebhookPayload(body) {
  const service =
    body.service || body.service_name || body.host || body.source || body.monitor || "unknown-service";
  const titleOrSummary =
    body.title || body.summary || body.alert_name || body.event_title || "";
  const details =
    body.description || body.message || body.details || body.body || "";
  const description = [titleOrSummary, details].filter(Boolean).join(" - ") || "Alert received with no description";
  const severity = normalizeSeverity(body.severity || body.priority || body.level);
  return { service: String(service).slice(0, 100), severity, description: description.slice(0, 2000) };
}

/**
 * Generic webhook endpoint - protected by a query-string secret, not
 * the x-api-key header, since most monitoring tools can't easily send
 * custom headers. Deliberately separate from the API key so webhook
 * access can be rotated independently of frontend/API access.
 */
webhooksRouter.post("/generic", async (req, res) => {
  if (req.query.secret !== process.env.WEBHOOK_SECRET) {
    return res.status(401).json({ error: "Unauthorized: missing or invalid webhook secret" });
  }
  const { service, severity, description } = normalizeWebhookPayload(req.body);
  try {
    const result = await createIncidentFromInput({ service, severity, description, source: "webhook" });
    res.status(201).json(result);
  } catch (err) {
    console.error("Webhook incident creation failed:", err);
    res.status(502).json({ error: "Failed to create incident from webhook", detail: err.message });
  }
});

/**
 * Demo-only simulate route - reuses the exact same normalization and
 * pipeline as the real webhook, but does NOT require WEBHOOK_SECRET.
 * This is intentional: it's meant to be called from within the app's
 * own authenticated frontend to demonstrate ingestion/normalization
 * live, without exposing the real external-facing secret to browser
 * JavaScript. A fixed set of realistic sample payloads is provided
 * server-side rather than accepting arbitrary freeform input, so this
 * can't be used to spam-create incidents with junk data.
 */
const SAMPLE_ALERTS = {
  datadog: {
    alert_name: "High error rate on checkout-service",
    message: "5xx rate exceeded 5% threshold for 3 consecutive minutes",
    priority: "p2",
    host: "checkout-service",
  },
  pagerduty: {
    summary: "Payment gateway timeout spike",
    details: "P95 latency on /api/payments exceeded 3000ms, 15 requests affected in last minute",
    severity: "critical",
    service_name: "payments-api",
  },
  cloudwatch: {
    event_title: "CPU utilization alarm",
    body: "EC2 instance running auth-gateway exceeded 90% CPU for 5 minutes",
    level: "warn",
    source: "auth-gateway",
  },
};

webhooksRouter.post("/simulate", async (req, res) => {
  const kind = req.body?.kind;
  const samplePayload = SAMPLE_ALERTS[kind];
  if (!samplePayload) {
    return res.status(400).json({
      error: "Invalid or missing 'kind'",
      validKinds: Object.keys(SAMPLE_ALERTS),
    });
  }

  const { service, severity, description } = normalizeWebhookPayload(samplePayload);
  try {
    const result = await createIncidentFromInput({ service, severity, description, source: `simulated-${kind}` });
    res.status(201).json({ ...result, simulatedPayload: samplePayload, simulatedKind: kind });
  } catch (err) {
    console.error("Simulated webhook incident creation failed:", err);
    res.status(502).json({ error: "Failed to create incident from simulated webhook", detail: err.message });
  }
});
