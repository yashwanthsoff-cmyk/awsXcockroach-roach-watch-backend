import { createEmbedding } from "./embeddingService.js";
import { rerankCandidates } from "./rerankService.js";
import { analyzeIncident } from "./groqService.js";
import { uploadPostmortem } from "./s3Service.js";
import { findOpenDuplicate } from "./dedupService.js";
import { insertIncident, findSimilarIncidents, saveAnalysis } from "../db/incidentRepo.js";

export async function createIncidentFromInput({ service, severity, description, source = "manual" }) {
  const embedding = await createEmbedding(description);

  let likelyDuplicateOf = null;
  try {
    likelyDuplicateOf = await findOpenDuplicate(embedding);
  } catch (err) {
    console.error(`[${source}] Dedup check failed (non-fatal):`, err.message);
  }

  const incident = await insertIncident({ service, severity, description, embedding });

  let similarIncidents = [];
  let analysis = {
    markdownResponse: "## Root Cause\nAnalysis temporarily unavailable - please retry shortly.",
    rootCause: "Analysis temporarily unavailable",
    fixSuggestion: "Please retry shortly",
    confidence: 0,
    citedRecordIds: [],
    evidence: { similarIncidentsFound: 0, confirmedFixCount: 0, avgEffectiveness: null },
    degraded: true,
  };
  let s3Result = { uploaded: false, error: null };

  try {
    const candidates = await findSimilarIncidents(embedding, incident.id, 5, { service, severity });
    similarIncidents = await rerankCandidates(
      description,
      candidates.map((c) => ({
        id: c.id,
        text: c.description,
        root_cause: c.root_cause,
        fix_summary: c.fix_summary,
        fix_confirmed: c.fix_confirmed,
        fix_effectiveness_score: c.fix_effectiveness_score,
      }))
    );
  } catch (err) {
    console.error(`[${source}] Similarity search/rerank failed (non-fatal):`, err.message);
  }

  try {
    analysis = await analyzeIncident({ service, description }, similarIncidents);
    analysis.degraded = false;
    const lifecycleStatus = !analysis.degraded && analysis.fixSuggestion ? "fix_proposed" : "investigating";
    await saveAnalysis(incident.id, { ...analysis, status: lifecycleStatus });
    incident.status = lifecycleStatus;
  } catch (err) {
    console.error(`[${source}] Groq analysis failed (non-fatal):`, err.message);
  }

  try {
    s3Result = await uploadPostmortem(incident, analysis);
  } catch (err) {
    console.error(`[${source}] S3 postmortem upload failed (non-fatal):`, err.message);
    s3Result = { uploaded: false, error: err.message };
  }

  return {
    incident,
    similarIncidents,
    analysis,
    s3: s3Result,
    likelyDuplicateOf: likelyDuplicateOf
      ? { id: likelyDuplicateOf.id, service: likelyDuplicateOf.service, description: likelyDuplicateOf.description, similarity: likelyDuplicateOf.similarity }
      : null,
  };
}
