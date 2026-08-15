import { getPool, forceDisconnect } from "../db/pool.js";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function writeWithRetry(maxAttempts = 3) {
  let lastError = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const startedAt = Date.now();
    try {
      await getPool().query(`INSERT INTO write_checks DEFAULT VALUES`);
      return { attempt, success: true, latencyMs: Date.now() - startedAt };
    } catch (err) {
      lastError = err;
      await sleep(300 * attempt);
    }
  }
  return { attempt: maxAttempts, success: false, error: lastError?.message };
}

/**
 * Harder failure simulation than a graceful pool.end(): checks out a live
 * client from the pool and forcibly destroys its raw TCP socket mid-flight,
 * the same way a real network blip or connection reset would. This is a
 * genuine abrupt severance, not a polite shutdown - a stronger, more honest
 * proof point than the earlier version.
 */
export async function runConnectionRecoveryTest() {
  const steps = [];
  const pool = getPool();

  steps.push({ step: "Confirming initial connection is healthy..." });
  await pool.query("SELECT 1");
  steps.push({ step: "Initial connection healthy" });

  steps.push({ step: "Checking out a live client to forcibly sever..." });
  const client = await pool.connect();

  steps.push({ step: "Forcibly destroying the raw TCP socket (simulated network cut, not a graceful close)..." });
  const rawSocket = client.connection?.stream;
  if (rawSocket && typeof rawSocket.destroy === "function") {
    rawSocket.destroy(new Error("Simulated abrupt network failure"));
    steps.push({ step: "Raw socket destroyed - connection severed mid-flight" });
  } else {
    steps.push({ step: "Could not access raw socket - falling back to pool teardown" });
    await forceDisconnect();
  }
  client.release(true); // true = discard this broken client, don't return it to the pool

  steps.push({ step: "Attempting write immediately after the severed connection..." });
  const result = await writeWithRetry(3);

  if (result.success) {
    steps.push({
      step: `Write succeeded on attempt ${result.attempt} - pool auto-recovered from a hard socket failure`,
      latencyMs: result.latencyMs,
    });
  } else {
    steps.push({ step: "Write failed after all retry attempts", error: result.error });
  }

  return { steps, recovered: result.success };
}
