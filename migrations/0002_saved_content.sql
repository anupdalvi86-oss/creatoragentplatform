CREATE TABLE saved_content (
  creator_id TEXT NOT NULL REFERENCES creators(id),
  user_id TEXT NOT NULL REFERENCES users(id),
  content_id TEXT NOT NULL REFERENCES content_items(id),
  saved_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (creator_id, user_id, content_id)
);

CREATE INDEX saved_content_by_user ON saved_content(creator_id, user_id, saved_at DESC);
