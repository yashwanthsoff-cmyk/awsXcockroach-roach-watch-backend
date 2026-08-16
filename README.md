 Roach Watch — Autonomous Incident Response & Memory Engine

Roach Watch is an autonomous incident-response and memory engine built on CockroachDB. It ingests incidents, retrieves and reranks historically similar incidents, generates evidence-grounded root cause analysis, tracks incident lifecycle state, and — its core differentiator — continuously validates whether its own past advice actually held up over time.

Every other AI memory framework treats application state and memory as two systems that have to stay in sync. Roach Watch puts them in one: CockroachDB, a single ACID-consistent, distributed database, storing both transactional incident state and vector embeddings together.

 Table of Contents
 - [Architecture](#architecture)
- [Core Workflow](#core-workflow)
- [Features](#features)
- [Tech Stack](#tech-stack)
- [Setup & Run Instructions](#setup--run-instructions)
- [Environment Variables](#environment-variables)
- [Project Structure](#project-structure)

 Architecture

Alert (webhook / manual / demo)
        │
        ▼
Normalize (service, severity, description)
        │
        ▼
NVIDIA NIM Embedding ──► CockroachDB (incident + vector, one atomic write)
        │
        ▼
Hybrid Retrieval (vector similarity + service + severity + fix-effectiveness boost)
        │
        ▼
NVIDIA NIM Reranker (sharpens candidates to genuinely relevant matches)
        │
        ▼
Groq (GPT-OSS-120B) reasoning ──► structured Root Cause / Confidence / Evidence / Fix
        │
        ▼
AWS S3 (postmortem export)
        │
        ▼
Incident Lifecycle: open → investigating → fix_proposed → resolved → monitoring
```

### Self-Improving Memory Loop

```
Engineer confirms fix worked
        │
        ▼
Trust score computed (base + repeat-confirmation bonus + time-held-clean bonus)
        │        (24-hour cooldown prevents repeat-click score farming)
        ▼
Recurrence Watch silently re-checks resolved incidents against new incidents
        │        (time-decay weighting: a match minutes after resolution is
        │         strong evidence; a match months later is weak evidence)
        ▼
   ┌────┴────┐
   ▼         ▼
Validated   Failed
(7+ real    (real recurrence
clean days) detected — trust
            downgraded, incident
            reopens automatically)
```

No fabricated before/after metrics anywhere in this loop — every verdict is grounded in real elapsed time and real recurrence detection against actual stored incidents.

---

 Core Workflow

1. Ingestion — an alert arrives via a real webhook endpoint (accepts Datadog/PagerDuty/CloudWatch-style payloads, secret-protected), manual entry through the frontend, or a live "Simulate Alert" button for demos — all normalize into `{service, severity, description}`.
2. Memory write — the description is embedded via NVIDIA NIM and written to CockroachDB alongside the incident record in a single transaction. Retrieval is immediate — no background indexing delay.
3. Hybrid retrieval — candidates are scored by vector similarity, boosted by matching service, matching severity, and confirmed fix effectiveness — then reranked by NVIDIA NIM for genuine relevance.
4. Grounded reasoning — Groq (GPT-OSS-120B) generates a structured root cause analysis: Root Cause, RCA Confidence (grounded in real evidence strength, not vibes), cited Similar Historical Incidents, Recommended Fix. The backend independently computes real evidence stats (X/Y similar incidents had a human-confirmed fix) rather than trusting the model's self-reported numbers.
5. Postmortem export — a structured postmortem record is uploaded to AWS S3.
6. Lifecycle tracking — the incident moves through real states (`open` → `investigating` → `fix_proposed` → `resolved` → `monitoring`) and automatically reopens to `investigating` if a confirmed fix is later found to be recurring.

---

Features

 Memory & Retrieval
- Same-store transactional + vector memory (CockroachDB, single ACID transaction per write)
- Synchronous post-write retrieval — no background indexing delay (demonstrated live in Memory Explorer, which shows real write-to-read latency)
- Hybrid retrieval — vector similarity combined with service/severity metadata and fix-effectiveness boosting, not embedding similarity alone
- Deduplication check on incident creation (flags likely-duplicate open incidents)

 Reasoning & Evidence
- Evidence-grounded root cause analysis via Groq (GPT-OSS-120B), replacing an earlier decommissioned Llama 3.3 70B model
- Structured, markdown-rendered responses (Root Cause / RCA Confidence / Evidence / Similar Historical Incidents / Recommended Fix) persisted to the database, not just shown once at creation time
- Real evidence computation independent of the LLM — the backend counts actual confirmed-effective fixes among cited incidents rather than trusting a self-reported confidence number

 Self-Improving Memory
- Multi-signal fix effectiveness scoring (human confirmation + repeat confirmations + time held clean without recurrence)
- 24-hour cooldown on repeat confirmations — closes a real gap where repeat-clicking "confirm fix worked" could artificially inflate trust
- Recurrence Watch — re-embeds and re-checks resolved incidents against new incidents, applying time-decay weighting so a fast recurrence is treated as much stronger evidence of failure than a distant one
- Automated Fix Validation — independently marks a confirmed fix `validated` after 7 real clean days or `failed` on detected recurrence, with no fabricated before/after metrics

 Incident Lifecycle
- Full 5-state lifecycle (`open`, `investigating`, `fix_proposed`, `resolved`, `monitoring`) with a dedicated resolve endpoint and status badges throughout the UI
- Irregular-transition detection (e.g., resolving an incident that skipped `fix_proposed`) is logged and surfaced, not silently allowed or blocked

 Agent Chat
- Real 4-step tool pipeline per message: CockroachDB MCP health check → NVIDIA NIM embed → retrieve & rerank → Groq reasoning
- Live, timestamped reasoning trace shown in the UI — every tool call, its duration, and success/failure is visible
- Real citation cards with actual similarity scores, and an evidence bar showing how many similar incidents were found and how many had confirmed-effective fixes
- Conversation persistence across page navigation within a session

 Ingestion & Normalization
- Generic webhook endpoint accepting real monitoring-tool payload shapes (Datadog, PagerDuty, CloudWatch-style field names), normalizing differing field names (`title`/`summary`/`alert_name`, `message`/`description`/`details`) and severity conventions (`p1`/`sev1`/`critical`, etc.) into a consistent internal shape
- "Simulate Alert" endpoint and UI button — demonstrates the same ingestion pipeline live without exposing the real webhook secret to the browser

 Verification & Observability
- Memory Explorer — manual search interface into the same vector memory, with real write-to-read provenance data
- Cluster Inspector — live CockroachDB cluster health via the CockroachDB Managed MCP Server (version, region, availability zones)
- Evaluation Harness — an automated test suite of 5 known cases (3 expected matches, 2 expected novel/no-match), scored by a deterministic rerank-score threshold rather than LLM self-reported confidence, self-cleaning after each run

 Tech Stack

| Layer | Technology |
|---|---|
| Database (transactional + vector) | CockroachDB |
| Embeddings & Reranking | NVIDIA NIM |
| LLM Reasoning | Groq — GPT-OSS-120B |
| Object Storage | AWS S3 |
| Cluster Introspection | CockroachDB Managed MCP Server |
| Backend | Node.js / Express |
| Frontend | React, TanStack Start/Router, TanStack Query, Tailwind CSS |

Setup & Run Instructions
 Prerequisites
- Node.js 18+
- A CockroachDB cluster (Serverless or self-hosted) with vector index support
- API keys: Groq, NVIDIA NIM, AWS (S3 access)
- A CockroachDB Managed MCP Server endpoint + API key

 Backend

```bash
cd roach-watch-backend
npm install
cp .env.example .env   # fill in real values, see Environment Variables below
npm run migrate         # applies schema.sql to your CockroachDB instance
npm start                # starts on http://localhost:8081
```

### Frontend

```bash
cd incident-guardian
npm install
cp .env.example .env    # set VITE_BACKEND_URL to your backend's URL
npm run dev              # starts on http://localhost:8080
```

---

## Environment Variables

### Backend (`roach-watch-backend/.env`)

```
COCKROACHDB_URL=postgresql://<user>:<password>@<host>:26257/<database>?sslmode=verify-full
GROQ_API_KEY=<your Groq API key>
GROQ_MODEL=openai/gpt-oss-120b
NVIDIA_API_KEY=<your NVIDIA API key>
NVIDIA_EMBED_MODEL=<your embedding model ID>
NVIDIA_RERANK_MODEL=<your rerank model ID>
AWS_ACCESS_KEY_ID=<your AWS access key>
AWS_SECRET_ACCESS_KEY=<your AWS secret key>
AWS_REGION=<your AWS region>
S3_BUCKET_NAME=<your S3 bucket name>
COCKROACHDB_MCP_URL=<your Managed MCP Server URL>
COCKROACHDB_MCP_KEY=<your MCP service account API key>
COCKROACHDB_CLUSTER_ID=<your cluster UUID>
WEBHOOK_SECRET=<a secret string for the generic webhook endpoint>
PORT=8081
```

### Frontend (`incident-guardian/.env`)

```
VITE_BACKEND_URL=<your deployed backend URL>
```

> **Note:** Never commit `.env` files. Confirm `.env` is listed in `.gitignore` before pushing.

---

## Project Structure

```
roach-watch-backend/
  src/
    db/            # CockroachDB queries, schema, connection pool
    routes/         # Express route handlers
    services/       # Business logic (embedding, reranking, Groq reasoning,
                      recurrence detection, fix validation, evaluation)
    server.js        # App entry point

incident-guardian/
  src/
    routes/         # TanStack Router pages (dashboard, incidents, chat, etc.)
    services/        # Frontend API clients and type adapters
    components/       # Shared UI components

This project is licensed under the MIT License — see the `LICENSE` file for details.

*(Add a LICENSE file with the MIT or Apache 2.0 text at the repo root — required for the license to be detectable in the repo's "About" section on GitHub.)*
