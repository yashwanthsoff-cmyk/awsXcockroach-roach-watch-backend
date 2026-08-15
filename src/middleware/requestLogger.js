import { logger } from "../services/logger.js";

/**
 * Logs every request: method, path, status code, and duration.
 * Placed before auth so even rejected/unauthorized requests get
 * logged - that is often the most important signal (who is hitting
 * this without a valid key).
 */
export function requestLogger(req, res, next) {
  const startedAt = Date.now();

  res.on("finish", () => {
    logger.info("request", {
      method: req.method,
      path: req.originalUrl,
      status: res.statusCode,
      durationMs: Date.now() - startedAt,
    });
  });

  next();
}
