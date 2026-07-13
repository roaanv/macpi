ALTER TABLE channels RENAME TO workspaces;
ALTER TABLE channel_sessions RENAME TO workspace_sessions;
ALTER TABLE workspace_sessions RENAME COLUMN channel_id TO workspace_id;

DROP INDEX idx_channel_sessions_session;
DROP INDEX idx_channel_sessions_parent;
CREATE INDEX idx_workspace_sessions_session ON workspace_sessions(pi_session_id);
CREATE INDEX idx_workspace_sessions_parent ON workspace_sessions(parent_pi_session_id);

ALTER TABLE settings_channel RENAME TO settings_workspace;
ALTER TABLE settings_workspace RENAME COLUMN channel_id TO workspace_id;
