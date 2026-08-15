import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { getCredential } from "./credentialStore.js";

function getS3Client() {
  return new S3Client({
    region: process.env.AWS_REGION,
    credentials: {
      accessKeyId: getCredential("AWS_ACCESS_KEY_ID"),
      secretAccessKey: getCredential("AWS_SECRET_ACCESS_KEY"),
    },
  });
}

export async function uploadPostmortem(incident, analysis) {
  const postmortem = {
    incidentId: incident.id,
    service: incident.service,
    severity: incident.severity,
    description: incident.description,
    rootCause: analysis.rootCause,
    fixSuggestion: analysis.fixSuggestion,
    confidence: analysis.confidence,
    exportedAt: new Date().toISOString(),
  };

  const key = `postmortems/incident-${incident.id}.json`;

  try {
    await getS3Client().send(
      new PutObjectCommand({
        Bucket: process.env.S3_BUCKET_NAME,
        Key: key,
        Body: JSON.stringify(postmortem, null, 2),
        ContentType: "application/json",
      })
    );
    return { uploaded: true, key };
  } catch (err) {
    console.error("S3 postmortem upload failed:", err.message);
    return { uploaded: false, error: err.message };
  }
}
