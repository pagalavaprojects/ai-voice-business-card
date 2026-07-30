-- ====================================================
-- Enterprise AI Agent Platform v2.0 Schema Migration
-- ====================================================

-- 1. Enable PGVector Extension
CREATE EXTENSION IF NOT EXISTS vector;

-- 2. AI Agent Fleet Table
CREATE TABLE IF NOT EXISTS ai_agents (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    department VARCHAR(50) NOT NULL DEFAULT 'SALES',
    name VARCHAR(255) NOT NULL,
    avatar_url TEXT,
    voice_model_id VARCHAR(255) DEFAULT 'vapi-default',
    personality_prompt TEXT NOT NULL,
    capabilities JSONB DEFAULT '[]'::jsonb,
    escalation_threshold NUMERIC(3, 2) DEFAULT 0.70 NOT NULL,
    is_active BOOLEAN DEFAULT TRUE NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- 3. RAG Knowledge Chunks with Vector Embeddings
CREATE TABLE IF NOT EXISTS rag_chunks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    document_title VARCHAR(255) NOT NULL,
    content TEXT NOT NULL,
    metadata JSONB DEFAULT '{}'::jsonb,
    embedding vector(1536),
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- 4. Workflows Table (DAG Automation)
CREATE TABLE IF NOT EXISTS workflows (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    trigger_type VARCHAR(100) NOT NULL,
    nodes JSONB DEFAULT '[]'::jsonb,
    edges JSONB DEFAULT '[]'::jsonb,
    is_published BOOLEAN DEFAULT FALSE NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- 5. Performance Indexes
CREATE INDEX IF NOT EXISTS idx_ai_agents_company ON ai_agents(company_id);
CREATE INDEX IF NOT EXISTS idx_workflows_company ON workflows(company_id);
CREATE INDEX IF NOT EXISTS idx_rag_chunks_company ON rag_chunks(company_id);

-- 6. Row Level Security Policies
ALTER TABLE ai_agents ENABLE ROW LEVEL SECURITY;
ALTER TABLE rag_chunks ENABLE ROW LEVEL SECURITY;
ALTER TABLE workflows ENABLE ROW LEVEL SECURITY;

CREATE POLICY service_role_ai_agents ON ai_agents FOR ALL USING (true);
CREATE POLICY service_role_rag_chunks ON rag_chunks FOR ALL USING (true);
CREATE POLICY service_role_workflows ON workflows FOR ALL USING (true);
