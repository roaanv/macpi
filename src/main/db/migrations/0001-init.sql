CREATE TABLE channels (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  position    INTEGER NOT NULL,
  icon        TEXT,
  created_at  INTEGER NOT NULL
);

CREATE TABLE channel_sessions (
  channel_id     TEXT NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
  pi_session_id  TEXT NOT NULL,
  position       INTEGER NOT NULL,
  added_at       INTEGER NOT NULL,
  PRIMARY KEY (channel_id, pi_session_id)
);
CREATE INDEX idx_channel_sessions_session ON channel_sessions(pi_session_id);

CREATE TABLE settings_global (
  key    TEXT PRIMARY KEY,
  value  TEXT NOT NULL
);

CREATE TABLE settings_channel (
  channel_id TEXT NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
  key        TEXT NOT NULL,
  value      TEXT NOT NULL,
  PRIMARY KEY (channel_id, key)
);

CREATE TABLE settings_session (
  pi_session_id TEXT NOT NULL,
  key           TEXT NOT NULL,
  value         TEXT NOT NULL,
  PRIMARY KEY (pi_session_id, key)
);

CREATE TABLE ui_state (
  key    TEXT PRIMARY KEY,
  value  TEXT NOT NULL
);
