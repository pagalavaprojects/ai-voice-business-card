-- Extends `leads` with the signals a real sales-qualification conversation
-- actually produces beyond budget/timeline/problem_statement: decision
-- authority, current alternative, urgency, objections, and the AI's own
-- read of buying intent/sentiment/confidence in that read. None of this is
-- ever spoken back to the visitor — it exists so a human reviewing the CRM
-- later can see WHY a lead was scored the way it was, and so a cold lead
-- can be nurtured deliberately instead of silently dropped.
--
-- Kept as columns on `leads` (not a new table): every field here is a
-- property of one specific lead's qualification snapshot, not an
-- independently-queried entity, and it needs to appear in the same
-- `SELECT * FROM leads` the dashboard already does.

ALTER TABLE leads
    ADD COLUMN IF NOT EXISTS current_solution TEXT,
    ADD COLUMN IF NOT EXISTS decision_maker VARCHAR(20),      -- 'yes' | 'no' | 'shared' | null (unknown)
    ADD COLUMN IF NOT EXISTS urgency VARCHAR(20),              -- 'immediate' | 'this_quarter' | 'exploring' | null
    ADD COLUMN IF NOT EXISTS buying_intent VARCHAR(10),        -- 'high' | 'medium' | 'low' | null
    ADD COLUMN IF NOT EXISTS objections TEXT,
    ADD COLUMN IF NOT EXISTS referral_source VARCHAR(100),
    ADD COLUMN IF NOT EXISTS sentiment VARCHAR(10),             -- 'positive' | 'neutral' | 'negative' | null
    ADD COLUMN IF NOT EXISTS qualification_confidence NUMERIC(3, 2), -- 0.00–1.00, the AI's own confidence in this read
    ADD COLUMN IF NOT EXISTS conversation_summary TEXT,
    ADD COLUMN IF NOT EXISTS qualification_notes TEXT,          -- internal-only reasoning, never surfaced to the visitor
    ADD COLUMN IF NOT EXISTS lead_temperature VARCHAR(4) DEFAULT 'COLD'
        CHECK (lead_temperature IN ('HOT', 'WARM', 'COLD')),
    ADD COLUMN IF NOT EXISTS cold_reason VARCHAR(20)
        CHECK (cold_reason IS NULL OR cold_reason IN ('BUDGET', 'TIMING', 'AUTHORITY', 'NEED_UNCLEAR', 'RESEARCH_PHASE')),
    ADD COLUMN IF NOT EXISTS nurture_status VARCHAR(12) DEFAULT 'NONE'
        CHECK (nurture_status IN ('NONE', 'QUEUED', 'SENT', 'SKIPPED')),
    ADD COLUMN IF NOT EXISTS nurture_channel_recommended VARCHAR(10)
        CHECK (nurture_channel_recommended IS NULL OR nurture_channel_recommended IN ('EMAIL', 'WHATSAPP', 'CONTENT')),
    ADD COLUMN IF NOT EXISTS next_followup_date TIMESTAMPTZ;

-- The nurture worker (a scheduled job, not built in this migration) needs to
-- find "cold leads due for a follow-up today" without scanning the whole
-- table — the same reasoning as every other per-tenant list query here.
CREATE INDEX IF NOT EXISTS idx_leads_nurture_followup
    ON leads (company_id, next_followup_date)
    WHERE nurture_status = 'QUEUED';

CREATE INDEX IF NOT EXISTS idx_leads_temperature
    ON leads (company_id, lead_temperature);

COMMENT ON COLUMN leads.lead_temperature IS
    'Derived by LeadQualificationService from score + buying_intent + decision_maker. HOT/WARM push toward booking; COLD triggers the nurture path instead of being dropped.';
COMMENT ON COLUMN leads.qualification_notes IS
    'Internal reasoning for the AI''s own qualification read — never spoken to the visitor, shown only in the admin CRM.';
