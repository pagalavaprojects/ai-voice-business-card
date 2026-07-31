-- getAgentByEmployee() runs on EVERY public card load and again on every
-- Vapi assistant-request at call start, but ai_agents was only indexed on
-- company_id — so the hottest lookup in the product was a sequential scan.
CREATE INDEX IF NOT EXISTS idx_ai_agents_employee ON ai_agents(employee_id) WHERE deleted_at IS NULL;

-- The same query filters on deleted_at and orders by created_at; this covers
-- the listAgents() dashboard path without a separate sort.
CREATE INDEX IF NOT EXISTS idx_ai_agents_company_created ON ai_agents(company_id, created_at DESC) WHERE deleted_at IS NULL;
