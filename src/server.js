import "dotenv/config";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { incidentsRouter } from "./routes/incidents.js";
import { mcpRouter } from "./routes/mcp.js";
import { memoryRouter } from "./routes/memory.js";
import { resilienceRouter } from "./routes/resilience.js";
import { recurrenceRouter } from "./routes/recurrence.js";
import { webhooksRouter } from "./routes/webhooks.js";
import { evalRouter } from "./routes/eval.js";
import { agentRouter } from "./routes/agent.js";
import { statusRouter } from "./routes/status.js";
import { authRouter } from "./routes/auth.js";
import { statsRouter } from "./routes/stats.js";
import { clusterInfoRouter } from "./routes/clusterInfo.js";
import { learningRouter } from "./routes/learning.js";
import { validationRouter } from "./routes/validation.js";
import { requestLogger } from "./middleware/requestLogger.js";
import { logger } from "./services/logger.js";

const app = express();

app.use(helmet());

const allowedOrigin = process.env.ALLOWED_ORIGIN || "http://localhost:8080";
app.use(cors({ origin: allowedOrigin }));

app.use(express.json());
app.use(requestLogger);

const generalLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests, please try again shortly." },
});
app.use(generalLimiter);

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many auth attempts, please try again later." },
});

app.get("/health", (req, res) => res.json({ status: "ok" }));
app.use("/api/status", statusRouter);
app.use("/api/auth", authLimiter, authRouter);
app.use("/api/webhooks", webhooksRouter);

app.use("/api/incidents", incidentsRouter);
app.use("/api/mcp", mcpRouter);
app.use("/api/memory", memoryRouter);
app.use("/api/resilience", resilienceRouter);
app.use("/api/recurrence", recurrenceRouter);
app.use("/api/eval", evalRouter);
app.use("/api/agent", agentRouter);
app.use("/api/stats", statsRouter);
app.use("/api/cluster-info", clusterInfoRouter);
app.use("/api/learning", learningRouter);
app.use("/api/validation", validationRouter);

const port = process.env.PORT || 8081;
app.listen(port, () => {
  logger.info("server_started", { port });
});
