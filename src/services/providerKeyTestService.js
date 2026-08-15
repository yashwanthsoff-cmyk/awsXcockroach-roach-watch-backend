const GROQ_BASE_URL = "https://api.groq.com/openai/v1";
const NVIDIA_BASE_URL = "https://integrate.api.nvidia.com/v1";

/**
 * Tests a candidate Groq API key with a real, minimal chat completion
 * call - the cheapest real request that still proves the key actually
 * authenticates and works, not just that it is formatted correctly.
 */
export async function testGroqKey(candidateKey) {
  try {
    const res = await fetch(`${GROQ_BASE_URL}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${candidateKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: process.env.GROQ_MODEL || "llama-3.3-70b-versatile",
        messages: [{ role: "user", content: "reply with the word OK" }],
        max_tokens: 5,
      }),
    });
    if (!res.ok) {
      const body = await res.text();
      return { passed: false, status: res.status, detail: body.slice(0, 200) };
    }
    const data = await res.json();
    return { passed: true, status: res.status, sample: data.choices?.[0]?.message?.content };
  } catch (err) {
    return { passed: false, error: err.message };
  }
}

/**
 * Tests a candidate NVIDIA API key with a real, minimal embedding call.
 */
export async function testNvidiaKey(candidateKey) {
  try {
    const res = await fetch(`${NVIDIA_BASE_URL}/embeddings`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${candidateKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: process.env.NVIDIA_EMBED_MODEL,
        input: ["test"],
        input_type: "query",
      }),
    });
    if (!res.ok) {
      const body = await res.text();
      return { passed: false, status: res.status, detail: body.slice(0, 200) };
    }
    const data = await res.json();
    return { passed: true, status: res.status, dimensions: data.data?.[0]?.embedding?.length };
  } catch (err) {
    return { passed: false, error: err.message };
  }
}

/**
 * Tests candidate AWS credentials with a real, minimal S3 call -
 * listing the target bucket (read-only, cheap, proves auth works end
 * to end including the IAM policy scope).
 */
export async function testAwsKey(accessKeyId, secretAccessKey) {
  try {
    const { S3Client, HeadBucketCommand } = await import("@aws-sdk/client-s3");
    const s3 = new S3Client({
      region: process.env.AWS_REGION,
      credentials: { accessKeyId, secretAccessKey },
    });
    await s3.send(new HeadBucketCommand({ Bucket: process.env.S3_BUCKET_NAME }));
    return { passed: true };
  } catch (err) {
    return { passed: false, error: err.message };
  }
}
