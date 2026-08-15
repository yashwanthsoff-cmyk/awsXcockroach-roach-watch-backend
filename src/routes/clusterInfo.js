import express from "express";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { getRegions } from "../services/healthCheckService.js";

export const clusterInfoRouter = express.Router();

let client = null;
async function getClient() {
  if (client) return client;
  const transport = new StreamableHTTPClientTransport(
    new URL(process.env.COCKROACHDB_MCP_URL),
    { requestInit: { headers: { Authorization: `Bearer ${process.env.COCKROACHDB_MCP_KEY}` } } }
  );
  client = new Client({ name: "roach-watch-backend", version: "0.1.0" }, { capabilities: {} });
  await client.connect(transport);
  return client;
}

/**
 * Returns only real, verified fields from the cluster - no fabricated
 * node counts. CockroachDB Serverless reports node_count: 0 in its own
 * API response on this plan, so there is no real per-node number to
 * show; zones (from SHOW REGIONS) is the real, honest substitute.
 */
clusterInfoRouter.get("/", async (req, res) => {
  try {
    const c = await getClient();
    const result = await c.callTool({
      name: "get_cluster",
      arguments: { cluster_id: process.env.COCKROACHDB_CLUSTER_ID },
    });
    const cluster = JSON.parse(result.content[0].text);

    const regions = await getRegions();
    const zones = regions[0]?.zones ?? [];

    res.json({
      name: cluster.name,
      version: cluster.cockroach_version,
      cloudProvider: cluster.cloud_provider,
      plan: cluster.plan,
      state: cluster.state,
      region: regions[0]?.region ?? cluster.regions?.[0]?.name ?? "unknown",
      zones,
      zoneCount: zones.length,
    });
  } catch (err) {
    console.error("Cluster info fetch failed:", err);
    res.status(502).json({ error: "Failed to fetch cluster info", detail: err.message });
  }
});
