import { getCredential } from "./credentialStore.js";

const NVIDIA_BASE_URL = "https://integrate.api.nvidia.com/v1";

export async function createEmbedding(text) {
  const res = await fetch(`${NVIDIA_BASE_URL}/embeddings`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${getCredential("NVIDIA_API_KEY")}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: process.env.NVIDIA_EMBED_MODEL,
      input: [text],
      input_type: "passage",
    }),
  });
  if (!res.ok) throw new Error(`NVIDIA embedding request failed (${res.status}): ${await res.text()}`);
  const data = await res.json();
  return data.data[0].embedding;
}

export async function createQueryEmbedding(text) {
  const res = await fetch(`${NVIDIA_BASE_URL}/embeddings`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${getCredential("NVIDIA_API_KEY")}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: process.env.NVIDIA_EMBED_MODEL,
      input: [text],
      input_type: "query",
    }),
  });
  if (!res.ok) throw new Error(`NVIDIA embedding request failed (${res.status}): ${await res.text()}`);
  const data = await res.json();
  return data.data[0].embedding;
}
