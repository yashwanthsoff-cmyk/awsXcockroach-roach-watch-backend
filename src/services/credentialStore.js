// Live, in-memory credential store. Starts from .env at boot, but can
// be overwritten at runtime after a successful, tested key rotation -
// no server restart required. This is what every service (embedding,
// rerank, groq, S3) should read from instead of process.env directly.

const credentials = {
  GROQ_API_KEY: process.env.GROQ_API_KEY,
  NVIDIA_API_KEY: process.env.NVIDIA_API_KEY,
  AWS_ACCESS_KEY_ID: process.env.AWS_ACCESS_KEY_ID,
  AWS_SECRET_ACCESS_KEY: process.env.AWS_SECRET_ACCESS_KEY,
};

export function getCredential(name) {
  return credentials[name];
}

export function setCredential(name, value) {
  if (!(name in credentials)) {
    throw new Error(`Unknown credential: ${name}`);
  }
  credentials[name] = value;
}

export function listCredentialNames() {
  return Object.keys(credentials);
}
