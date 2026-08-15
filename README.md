# Roach Watch

**The on-call memory that never goes down - because it cannot afford to.**

An incident-response copilot where memory and transactional state live in the same CockroachDB-backed store, with the same ACID guarantees - not a separate memory service bolted onto the side.

---

## The problem

Every memory framework we surveyed (Mem0, Zep/Graphiti, LangMem) treats memory as a separate service from the application own state. Zep in particular has documented retrieval failures immediately after a write, with correct answers only surfacing hours later once background processing catches up. For a chatbot, that lag is tolerable. For an on-call engineer mid-incident, it is not.

Roach Watch collapses memory and transactional state into one store, one ACID transaction, and proves it holds up under real failure conditions.

---

## Features

### 1. Same-store transactional + embedding memory
Every incident record and its vector embedding commit together, in the same CockroachDB transaction, or neither commits at all.

Verified: tested with both exact-match and fully paraphrased queries. The paraphrased test still surfaced the correct prior incidents with 0.9 confidence.

### 2. MCP-based cluster introspection
The agent inspects its own database health using CockroachDB managed MCP server.

Cluster metadata runs through a Cluster Operator-scoped MCP key. SQL-level health checks run through a separate, dedicated database role that can only SELECT.

### 3. Synchronous post-write retrieval
New incidents are searchable via the vector index immediately after write.

Latency is roughly 0.9-1.0 seconds, down from an initial 2.6s after removing a redundant embedding call.

### 4. Connection-recovery resilience
The system detects a severed database connection mid-operation and recovers automatically.

CockroachDB Serverless does not expose node-level kill controls on this plan. What we demonstrate instead: forcibly destroying the raw TCP socket of a live connection mid-flight, then showing detection, reconnection, and retry - confirmed recovering in 582ms on the first retry attempt.

### 5. Recurrence Watch
Periodically re-checks resolved incidents against currently open ones, flagging recurrence.

Verified: tested both the positive case (correctly flagged high risk) and the negative case (correctly returned low risk, no false positives).

### AWS - S3 postmortem export
Every analyzed incident is exported as a JSON postmortem to S3, using a scoped IAM policy limited to only this bucket.

---

## Reliability and input handling

- Incident creation validates all inputs and returns clear 400 errors instead of raw stack traces.
- The core write path fails loudly if it breaks.
- Everything downstream of the write degrades gracefully instead of crashing the whole request.

---

## Tech stack

- Database: CockroachDB Serverless
- Embeddings and reranking: NVIDIA NIM
- Reasoning: Groq (Llama 3.3 70B)
- Storage: AWS S3
- Backend: Node.js, Express
- Cluster introspection: CockroachDB Managed MCP Server

---

## Setup

1. Copy .env.example to .env and fill in real credentials
2. npm install
3. npm run migrate
4. npm start
