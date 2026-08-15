CREATE TABLE IF NOT EXISTS incidents (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    service         STRING NOT NULL,
    severity        STRING NOT NULL,
    status          STRING NOT NULL DEFAULT 'open',
    description     STRING NOT NULL,
    root_cause      STRING,
    fix_summary     STRING,
    embedding       VECTOR(1024),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    resolved_at     TIMESTAMPTZ
);

CREATE VECTOR INDEX IF NOT EXISTS incidents_embedding_idx
    ON incidents (embedding vector_cosine_ops);

CREATE TABLE IF NOT EXISTS resolutions (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    incident_id     UUID NOT NULL REFERENCES incidents(id),
    root_cause      STRING NOT NULL,
    fix_summary     STRING NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
