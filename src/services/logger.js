/**
 * Minimal structured logger - JSON lines instead of scattered
 * console.log calls. Not a full observability stack, but every log
 * line now has a consistent shape (timestamp, level, message, context)
 * that a real log aggregator (Datadog, CloudWatch, etc.) could ingest
 * without extra parsing work.
 */
function log(level, message, context = {}) {
  const entry = {
    timestamp: new Date().toISOString(),
    level,
    message,
    ...context,
  };
  const line = JSON.stringify(entry);
  if (level === "error") {
    console.error(line);
  } else {
    console.log(line);
  }
}

export const logger = {
  info: (message, context) => log("info", message, context),
  warn: (message, context) => log("warn", message, context),
  error: (message, context) => log("error", message, context),
};
