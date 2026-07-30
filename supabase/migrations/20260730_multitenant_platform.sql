-- ====================================================
-- Multi-Tenant Platform Schema — Phase 2 Build-Out
-- ====================================================
-- Adds: users, company_members (the tenant-membership model the app was
-- missing — see PRODUCTION_VALIDATION audit, "cross-tenant IDOR"), agents
-- (extends ai_agents), knowledge_documents/knowledge_chunks, prompt
-- versioning, branding, settings, api_keys, email_logs, lead_activities.
--
-- Design notes (documented, not silent):
--  * "agents" from the spec = ai_agents, extended in place. A second table
--    would just fork the same concept under two names.
--  * "conversation_logs" = the existing conversation_messages table.
--    "voice_sessions" = the existing conversations table, extended with the
--    fields Phase 11 needs (intent, tools_called, lead_score, transcript,
--    audio_metadata). Two new tables covering an identical concept to two
--    existing ones would split the data with no single source of truth.
--  * rag_chunks (v2 migration) is superseded by knowledge_documents /
--    knowledge_chunks below, which add the upload/status/chunk-provenance
--    model the Knowledge Base module needs. rag_chunks is left in place
--    (not dropped) since dropping a table this migration doesn't own the
--    history of is a destructive, hard-to-reverse action with no upside —
--    the application code simply stops reading/writing it.
-- ====================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ----------------------------------------------------
-- 1. Identity & Membership
-- ----------------------------------------------------

CREATE TYPE company_member_role AS ENUM ('OWNER', 'ADMIN', 'MANAGER', 'EMPLOYEE', 'VIEWER');
CREATE TYPE company_member_status AS ENUM ('INVITED', 'ACTIVE', 'SUSPENDED');

-- Mirrors auth.users (Supabase-managed). One row per authenticated person,
-- created on first login via a DB trigger (see section 9).
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY, -- matches auth.users.id, not independently generated
    email VARCHAR(255) NOT NULL,
    full_name VARCHAR(255),
    avatar_url TEXT,
    is_platform_admin BOOLEAN DEFAULT FALSE NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- The tenant-membership table the audit flagged as missing. Every
-- authorization decision in the app now traces back to a row here.
CREATE TABLE IF NOT EXISTS company_members (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role company_member_role NOT NULL DEFAULT 'VIEWER',
    status company_member_status NOT NULL DEFAULT 'INVITED',
    invited_by UUID REFERENCES users(id) ON DELETE SET NULL,
    invited_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    joined_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    UNIQUE (company_id, user_id)
);

CREATE INDEX idx_company_members_company ON company_members(company_id);
CREATE INDEX idx_company_members_user ON company_members(user_id);

-- ----------------------------------------------------
-- 2. Agents (extends ai_agents from the v2 migration)
-- ----------------------------------------------------

CREATE TYPE agent_status AS ENUM ('ACTIVE', 'INACTIVE', 'TESTING');

ALTER TABLE ai_agents
    ADD COLUMN IF NOT EXISTS employee_id UUID REFERENCES employees(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS prompt_template_id UUID,
    ADD COLUMN IF NOT EXISTS status agent_status NOT NULL DEFAULT 'TESTING',
    ADD COLUMN IF NOT EXISTS tools JSONB DEFAULT '[]'::jsonb,
    ADD COLUMN IF NOT EXISTS last_tested_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS agent_knowledge_documents (
    agent_id UUID NOT NULL REFERENCES ai_agents(id) ON DELETE CASCADE,
    knowledge_document_id UUID NOT NULL, -- FK added in section 3 after the table exists
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    PRIMARY KEY (agent_id, knowledge_document_id)
);

-- ----------------------------------------------------
-- 3. Knowledge Base (documents -> chunks -> embeddings)
-- ----------------------------------------------------

CREATE TYPE knowledge_source_type AS ENUM ('PDF', 'DOCX', 'TXT', 'MARKDOWN');
CREATE TYPE knowledge_status AS ENUM ('PENDING', 'CHUNKING', 'EMBEDDING', 'READY', 'FAILED');

CREATE TABLE IF NOT EXISTS knowledge_documents (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    source_type knowledge_source_type NOT NULL,
    storage_path TEXT NOT NULL, -- Supabase Storage object path
    file_size_bytes BIGINT,
    status knowledge_status NOT NULL DEFAULT 'PENDING',
    chunk_count INT DEFAULT 0 NOT NULL,
    error_message TEXT,
    uploaded_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    deleted_at TIMESTAMPTZ
);

ALTER TABLE agent_knowledge_documents
    ADD CONSTRAINT fk_akd_knowledge_document
    FOREIGN KEY (knowledge_document_id) REFERENCES knowledge_documents(id) ON DELETE CASCADE;

CREATE TABLE IF NOT EXISTS knowledge_chunks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    knowledge_document_id UUID NOT NULL REFERENCES knowledge_documents(id) ON DELETE CASCADE,
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE, -- denormalized for RLS + query perf
    chunk_index INT NOT NULL,
    content TEXT NOT NULL,
    token_count INT,
    embedding vector(1536),
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    UNIQUE (knowledge_document_id, chunk_index)
);

CREATE INDEX idx_knowledge_documents_company ON knowledge_documents(company_id);
CREATE INDEX idx_knowledge_chunks_document ON knowledge_chunks(knowledge_document_id);
CREATE INDEX idx_knowledge_chunks_company ON knowledge_chunks(company_id);
-- IVFFlat requires rows to train lists effectively; safe to create empty, tune `lists` once populated.
CREATE INDEX idx_knowledge_chunks_embedding ON knowledge_chunks USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- ----------------------------------------------------
-- 4. Prompt Versioning
-- ----------------------------------------------------

CREATE TABLE IF NOT EXISTS prompt_template_versions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    prompt_template_id UUID NOT NULL REFERENCES prompt_templates(id) ON DELETE CASCADE,
    version INT NOT NULL,
    content TEXT NOT NULL,
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    UNIQUE (prompt_template_id, version)
);

CREATE INDEX idx_prompt_versions_template ON prompt_template_versions(prompt_template_id);

ALTER TABLE ai_agents
    ADD CONSTRAINT fk_ai_agents_prompt_template
    FOREIGN KEY (prompt_template_id) REFERENCES prompt_templates(id) ON DELETE SET NULL;

-- ----------------------------------------------------
-- 5. Appointments — reschedule / cancel / timezone support
-- ----------------------------------------------------

ALTER TABLE appointments
    ADD COLUMN IF NOT EXISTS timezone VARCHAR(64) DEFAULT 'UTC' NOT NULL,
    ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS cancellation_reason TEXT,
    ADD COLUMN IF NOT EXISTS rescheduled_from_id UUID REFERENCES appointments(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS notes TEXT;

-- ----------------------------------------------------
-- 6. Voice sessions (extends `conversations`) — Phase 11
-- ----------------------------------------------------

ALTER TABLE conversations
    ADD COLUMN IF NOT EXISTS intent VARCHAR(255),
    ADD COLUMN IF NOT EXISTS tools_called JSONB DEFAULT '[]'::jsonb,
    ADD COLUMN IF NOT EXISTS lead_score INT,
    ADD COLUMN IF NOT EXISTS transcript TEXT,
    ADD COLUMN IF NOT EXISTS audio_metadata JSONB DEFAULT '{}'::jsonb,
    ADD COLUMN IF NOT EXISTS appointment_id UUID REFERENCES appointments(id) ON DELETE SET NULL;

-- ----------------------------------------------------
-- 7. CRM — lead ownership, tags, activity timeline
-- ----------------------------------------------------

CREATE TYPE lead_activity_type AS ENUM ('NOTE', 'STATUS_CHANGE', 'CALL', 'EMAIL', 'APPOINTMENT', 'OWNER_CHANGE');

ALTER TABLE leads
    ADD COLUMN IF NOT EXISTS owner_id UUID REFERENCES users(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS tags TEXT[] DEFAULT '{}';

CREATE TABLE IF NOT EXISTS lead_activities (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    type lead_activity_type NOT NULL,
    content TEXT,
    actor_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX idx_lead_activities_lead ON lead_activities(lead_id, created_at DESC);
CREATE INDEX idx_lead_activities_company ON lead_activities(company_id);
CREATE INDEX idx_leads_owner ON leads(owner_id);
CREATE INDEX idx_leads_tags ON leads USING gin(tags);

-- ----------------------------------------------------
-- 8. Branding, Settings, API Keys, Email Logs
-- ----------------------------------------------------

CREATE TABLE IF NOT EXISTS branding (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id UUID NOT NULL UNIQUE REFERENCES companies(id) ON DELETE CASCADE,
    logo_storage_path TEXT,
    primary_color VARCHAR(7) DEFAULT '#0369a1',
    secondary_color VARCHAR(7) DEFAULT '#0f172a',
    font_family VARCHAR(100) DEFAULT 'Inter',
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE TABLE IF NOT EXISTS settings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id UUID NOT NULL UNIQUE REFERENCES companies(id) ON DELETE CASCADE,
    business_info JSONB DEFAULT '{}'::jsonb,
    calendar_settings JSONB DEFAULT '{}'::jsonb,
    email_settings JSONB DEFAULT '{}'::jsonb,
    voice_settings JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE TABLE IF NOT EXISTS api_keys (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    key_prefix VARCHAR(16) NOT NULL, -- safe-to-display prefix, e.g. "sk_live_ab12"
    key_hash TEXT NOT NULL,          -- sha256 of the full key; raw key is shown once at creation, never stored
    scopes JSONB DEFAULT '[]'::jsonb,
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    last_used_at TIMESTAMPTZ,
    revoked_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX idx_api_keys_company ON api_keys(company_id);
CREATE UNIQUE INDEX idx_api_keys_hash ON api_keys(key_hash);

CREATE TYPE email_status AS ENUM ('QUEUED', 'SENT', 'FAILED', 'BOUNCED');

CREATE TABLE IF NOT EXISTS email_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
    to_email VARCHAR(255) NOT NULL,
    subject VARCHAR(500) NOT NULL,
    template_name VARCHAR(100),
    status email_status NOT NULL DEFAULT 'QUEUED',
    provider_message_id VARCHAR(255),
    error_message TEXT,
    attempt_count INT DEFAULT 0 NOT NULL,
    sent_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX idx_email_logs_company ON email_logs(company_id);
CREATE INDEX idx_email_logs_status ON email_logs(status);

-- ----------------------------------------------------
-- 9. Auto-provision a `users` row when someone signs up in Supabase Auth
-- ----------------------------------------------------

CREATE OR REPLACE FUNCTION handle_new_auth_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.users (id, email, full_name, avatar_url)
  VALUES (
    NEW.id,
    NEW.email,
    NEW.raw_user_meta_data->>'full_name',
    NEW.raw_user_meta_data->>'avatar_url'
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_auth_user();

-- ----------------------------------------------------
-- 10. updated_at triggers for new/extended tables
-- ----------------------------------------------------

CREATE TRIGGER trg_users_updated BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_company_members_updated BEFORE UPDATE ON company_members FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_ai_agents_updated BEFORE UPDATE ON ai_agents FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_knowledge_documents_updated BEFORE UPDATE ON knowledge_documents FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_branding_updated BEFORE UPDATE ON branding FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_settings_updated BEFORE UPDATE ON settings FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ----------------------------------------------------
-- 11. Authorization helper functions (used by RLS below AND mirrored in
--     application code — see src/shared/lib/tenant.ts — because every
--     write in this app currently goes through the Supabase service-role
--     client, which bypasses RLS entirely. RLS here is defense-in-depth
--     for any future anon-key / client-side / Realtime access; the
--     primary enforcement point is the application layer.)
-- ----------------------------------------------------

CREATE OR REPLACE FUNCTION is_platform_admin()
RETURNS boolean AS $$
  SELECT COALESCE((SELECT u.is_platform_admin FROM users u WHERE u.id = auth.uid()), false);
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION is_company_member(target_company_id uuid)
RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1 FROM company_members cm
    WHERE cm.company_id = target_company_id
      AND cm.user_id = auth.uid()
      AND cm.status = 'ACTIVE'
  ) OR is_platform_admin();
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION has_company_role(target_company_id uuid, min_role company_member_role)
RETURNS boolean AS $$
  SELECT is_platform_admin() OR EXISTS (
    SELECT 1 FROM company_members cm
    WHERE cm.company_id = target_company_id
      AND cm.user_id = auth.uid()
      AND cm.status = 'ACTIVE'
      AND CASE min_role
        WHEN 'VIEWER'   THEN true
        WHEN 'EMPLOYEE' THEN cm.role IN ('EMPLOYEE','MANAGER','ADMIN','OWNER')
        WHEN 'MANAGER'  THEN cm.role IN ('MANAGER','ADMIN','OWNER')
        WHEN 'ADMIN'    THEN cm.role IN ('ADMIN','OWNER')
        WHEN 'OWNER'    THEN cm.role = 'OWNER'
      END
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

-- ----------------------------------------------------
-- 12. RLS — replace the permissive `USING (true)` policies from the
--     original migrations with real tenant-scoped policies.
-- ----------------------------------------------------

ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE company_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE knowledge_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE knowledge_chunks ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_knowledge_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE prompt_template_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE lead_activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE branding ENABLE ROW LEVEL SECURITY;
ALTER TABLE settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE api_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY self_read_users ON users FOR SELECT USING (id = auth.uid() OR is_platform_admin());
CREATE POLICY self_update_users ON users FOR UPDATE USING (id = auth.uid()) WITH CHECK (id = auth.uid());

CREATE POLICY member_read_company_members ON company_members FOR SELECT USING (is_company_member(company_id));
CREATE POLICY admin_write_company_members ON company_members FOR ALL USING (has_company_role(company_id, 'ADMIN')) WITH CHECK (has_company_role(company_id, 'ADMIN'));

CREATE POLICY tenant_knowledge_documents ON knowledge_documents FOR ALL USING (is_company_member(company_id)) WITH CHECK (is_company_member(company_id));
CREATE POLICY tenant_knowledge_chunks ON knowledge_chunks FOR ALL USING (is_company_member(company_id)) WITH CHECK (is_company_member(company_id));
CREATE POLICY tenant_prompt_versions ON prompt_template_versions FOR ALL USING (
  EXISTS (SELECT 1 FROM prompt_templates pt WHERE pt.id = prompt_template_id AND is_company_member(pt.company_id))
);
CREATE POLICY tenant_lead_activities ON lead_activities FOR ALL USING (is_company_member(company_id)) WITH CHECK (is_company_member(company_id));
CREATE POLICY tenant_branding ON branding FOR ALL USING (is_company_member(company_id)) WITH CHECK (is_company_member(company_id));
CREATE POLICY tenant_settings ON settings FOR ALL USING (is_company_member(company_id)) WITH CHECK (is_company_member(company_id));
CREATE POLICY tenant_api_keys ON api_keys FOR ALL USING (has_company_role(company_id, 'ADMIN')) WITH CHECK (has_company_role(company_id, 'ADMIN'));
CREATE POLICY tenant_email_logs ON email_logs FOR SELECT USING (company_id IS NULL OR is_company_member(company_id));

-- Replace every permissive policy from the two prior migrations with real
-- tenant checks. `service_role_*` policies used USING(true), which the
-- Supabase service-role key ignores anyway (RLS is skipped for that role);
-- the practical effect of leaving them was that even a hypothetical
-- anon-key client could read/write any tenant's data. Recreate all of them.
DROP POLICY IF EXISTS service_role_all_access ON companies;
CREATE POLICY tenant_companies ON companies FOR ALL USING (is_company_member(id)) WITH CHECK (is_company_member(id));

DROP POLICY IF EXISTS service_role_employees ON employees;
CREATE POLICY tenant_employees ON employees FOR ALL USING (is_company_member(company_id)) WITH CHECK (is_company_member(company_id));

DROP POLICY IF EXISTS service_role_products ON products;
CREATE POLICY tenant_products ON products FOR ALL USING (is_company_member(company_id)) WITH CHECK (is_company_member(company_id));

DROP POLICY IF EXISTS service_role_services ON services;
CREATE POLICY tenant_services ON services FOR ALL USING (is_company_member(company_id)) WITH CHECK (is_company_member(company_id));

DROP POLICY IF EXISTS service_role_faqs ON faqs;
CREATE POLICY tenant_faqs ON faqs FOR ALL USING (is_company_member(company_id)) WITH CHECK (is_company_member(company_id));

DROP POLICY IF EXISTS service_role_leads ON leads;
CREATE POLICY tenant_leads ON leads FOR ALL USING (is_company_member(company_id)) WITH CHECK (is_company_member(company_id));

DROP POLICY IF EXISTS service_role_conversations ON conversations;
CREATE POLICY tenant_conversations ON conversations FOR ALL USING (is_company_member(company_id)) WITH CHECK (is_company_member(company_id));

DROP POLICY IF EXISTS service_role_appointments ON appointments;
CREATE POLICY tenant_appointments ON appointments FOR ALL USING (is_company_member(company_id)) WITH CHECK (is_company_member(company_id));

DROP POLICY IF EXISTS service_role_prompt_templates ON prompt_templates;
CREATE POLICY tenant_prompt_templates ON prompt_templates FOR ALL USING (is_company_member(company_id)) WITH CHECK (is_company_member(company_id));

DROP POLICY IF EXISTS service_role_ai_agents ON ai_agents;
CREATE POLICY tenant_ai_agents ON ai_agents FOR ALL USING (is_company_member(company_id)) WITH CHECK (is_company_member(company_id));

DROP POLICY IF EXISTS service_role_rag_chunks ON rag_chunks;
CREATE POLICY tenant_rag_chunks ON rag_chunks FOR ALL USING (is_company_member(company_id)) WITH CHECK (is_company_member(company_id));

DROP POLICY IF EXISTS service_role_workflows ON workflows;
CREATE POLICY tenant_workflows ON workflows FOR ALL USING (is_company_member(company_id)) WITH CHECK (is_company_member(company_id));

-- conversation_messages has no company_id column directly — scope through its parent conversation.
ALTER TABLE conversation_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_conversation_messages ON conversation_messages FOR ALL USING (
  EXISTS (SELECT 1 FROM conversations c WHERE c.id = conversation_id AND is_company_member(c.company_id))
);

-- agent_knowledge_documents scoped through its parent agent.
CREATE POLICY tenant_agent_knowledge_documents ON agent_knowledge_documents FOR ALL USING (
  EXISTS (SELECT 1 FROM ai_agents a WHERE a.id = agent_id AND is_company_member(a.company_id))
);
