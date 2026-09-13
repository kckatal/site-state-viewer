CREATE TABLE pages (
  id TEXT PRIMARY KEY,
  url TEXT NOT NULL UNIQUE,
  label TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE snapshots (
  id TEXT PRIMARY KEY,
  page_id TEXT NOT NULL REFERENCES pages(id),
  captured_at TEXT NOT NULL,
  title TEXT,
  html_key TEXT NOT NULL,
  text_content TEXT NOT NULL,
  trigger TEXT NOT NULL DEFAULT 'manual'
);

CREATE INDEX idx_snapshots_page_captured ON snapshots(page_id, captured_at DESC);

CREATE TABLE snapshot_assets (
  id TEXT PRIMARY KEY,
  snapshot_id TEXT NOT NULL REFERENCES snapshots(id),
  original_url TEXT NOT NULL,
  r2_key TEXT NOT NULL,
  content_type TEXT
);

CREATE INDEX idx_assets_snapshot ON snapshot_assets(snapshot_id);
