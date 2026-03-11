CREATE TABLE IF NOT EXISTS pageviews (
  id TEXT PRIMARY KEY,
  occurred_at TEXT NOT NULL,
  received_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  hour_bucket TEXT NOT NULL,
  day_bucket TEXT NOT NULL,
  path TEXT NOT NULL,
  title TEXT NOT NULL,
  referrer TEXT NOT NULL,
  referrer_host TEXT NOT NULL,
  referrer_source TEXT NOT NULL,
  host TEXT NOT NULL,
  language TEXT,
  timezone TEXT,
  screen TEXT,
  viewport TEXT,
  session_id TEXT NOT NULL,
  visitor_id TEXT NOT NULL,
  user_agent TEXT,
  device_type TEXT NOT NULL,
  country TEXT,
  region TEXT,
  city TEXT,
  latitude REAL,
  longitude REAL,
  postal_code TEXT,
  colo TEXT
);

CREATE INDEX IF NOT EXISTS idx_pageviews_occurred_at ON pageviews(occurred_at);
CREATE INDEX IF NOT EXISTS idx_pageviews_hour_bucket ON pageviews(hour_bucket);
CREATE INDEX IF NOT EXISTS idx_pageviews_day_bucket ON pageviews(day_bucket);
CREATE INDEX IF NOT EXISTS idx_pageviews_path ON pageviews(path);
CREATE INDEX IF NOT EXISTS idx_pageviews_visitor_id ON pageviews(visitor_id);
CREATE INDEX IF NOT EXISTS idx_pageviews_session_id ON pageviews(session_id);
CREATE INDEX IF NOT EXISTS idx_pageviews_referrer_source ON pageviews(referrer_source);
CREATE INDEX IF NOT EXISTS idx_pageviews_device_type ON pageviews(device_type);
CREATE INDEX IF NOT EXISTS idx_pageviews_location ON pageviews(country, region, city);
