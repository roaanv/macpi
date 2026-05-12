ALTER TABLE channel_sessions ADD COLUMN parent_pi_session_id TEXT;
CREATE INDEX idx_channel_sessions_parent ON channel_sessions(parent_pi_session_id);
