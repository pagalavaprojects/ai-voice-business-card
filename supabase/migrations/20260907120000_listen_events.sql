-- ============================================================
-- listen_events — genuine user-initiated card interaction events
-- ============================================================
-- Records ONLY real, user-initiated playback/interaction on the public
-- business card (Introduction / Elevator / Service / Why Us), never a
-- background prefetch / Range warm-up / API probe. Powers the per-user
-- listening analytics on the existing dashboard.
--
-- event_id is a client-generated UUID per genuine play, so the recording
-- endpoint can INSERT ... ON CONFLICT (event_id) DO NOTHING — deduplicating
-- accidental duplicate fires (React re-render, double-click, retry) while a
-- legitimate replay (a fresh event_id) still counts. Attribution is by the
-- card visit's own session_id (and the lead_id once the visitor qualifies),
-- never an invented user.

CREATE TABLE IF NOT EXISTS listen_events (
    event_id   TEXT PRIMARY KEY,
    company_id UUID NOT NULL,
    employee_id UUID NOT NULL,
    session_id TEXT NOT NULL,
    event_type TEXT NOT NULL,
    lead_id    UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_listen_events_company_created ON listen_events (company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_listen_events_employee_created ON listen_events (employee_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_listen_events_session ON listen_events (session_id);
