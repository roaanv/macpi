ALTER TABLE channel_sessions ADD COLUMN label TEXT;
ALTER TABLE channel_sessions ADD COLUMN label_user_set INTEGER NOT NULL DEFAULT 0;
