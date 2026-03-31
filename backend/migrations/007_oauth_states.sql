-- OAuth states table for CSRF protection during YouCan OAuth flow
-- States are stored in DB instead of session because the callback runs in a popup window
-- that may not share the session with the main CRM window
CREATE TABLE IF NOT EXISTS oauth_states (
    state VARCHAR(64) PRIMARY KEY,
    user_id UUID NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Auto-cleanup: delete expired states older than 10 minutes
-- (the callback query already filters by time, this is just housekeeping)
