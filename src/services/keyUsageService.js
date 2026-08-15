// Simple in-memory sliding-window counter, per API key. Not persisted -
// resets on server restart - but sufficient to detect "this key is
// getting hammered right now" and warn before the hard rate limiter
// (express-rate-limit, IP-based) even kicks in.

const WINDOW_MS = 60 * 1000;
const LIMIT = 100;

const usage = new Map(); // key -> { count, windowStart }

export function recordRequest(apiKey) {
  const now = Date.now();
  const entry = usage.get(apiKey);

  if (!entry || now - entry.windowStart > WINDOW_MS) {
    usage.set(apiKey, { count: 1, windowStart: now });
    return { count: 1, limit: LIMIT, remaining: LIMIT - 1, resetInMs: WINDOW_MS };
  }

  entry.count += 1;
  return {
    count: entry.count,
    limit: LIMIT,
    remaining: Math.max(0, LIMIT - entry.count),
    resetInMs: WINDOW_MS - (now - entry.windowStart),
  };
}

export function getUsage(apiKey) {
  const entry = usage.get(apiKey);
  if (!entry) return { count: 0, limit: LIMIT, remaining: LIMIT, resetInMs: 0 };
  const now = Date.now();
  if (now - entry.windowStart > WINDOW_MS) {
    return { count: 0, limit: LIMIT, remaining: LIMIT, resetInMs: 0 };
  }
  return {
    count: entry.count,
    limit: LIMIT,
    remaining: Math.max(0, LIMIT - entry.count),
    resetInMs: WINDOW_MS - (now - entry.windowStart),
  };
}
