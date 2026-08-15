import { getCredential } from "./credentialStore.js";

export async function rerankCandidates(query, candidates) {
  if (candidates.length === 0) return [];

  const model = process.env.NVIDIA_RERANK_MODEL;
  const url = `https://ai.api.nvidia.com/v1/retrieval/${model}/reranking`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${getCredential("NVIDIA_API_KEY")}`,
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      query: { text: query },
      passages: candidates.map((c) => ({ text: c.text })),
    }),
  });

  if (!res.ok) {
    const errBody = await res.text();
    throw new Error(`NVIDIA rerank request failed (${res.status}): ${errBody}`);
  }

  const data = await res.json();
  return data.rankings.map((r) => ({ ...candidates[r.index], score: r.logit }));
}
