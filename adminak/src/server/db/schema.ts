// Versioned SQLite migrations. Append new entries; never edit an applied one.

export const MIGRATIONS: { version: number; name: string; sql: string }[] = [
  {
    version: 1,
    name: "initial",
    sql: `
CREATE TABLE IF NOT EXISTS meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE users (
  id INTEGER PRIMARY KEY,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  totp_secret_enc TEXT,
  totp_enabled INTEGER NOT NULL DEFAULT 0,
  totp_last_step INTEGER,
  recovery_codes_enc TEXT,
  created_at TEXT NOT NULL,
  last_login_at TEXT
);

CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  ip TEXT,
  user_agent TEXT
);
CREATE INDEX idx_sessions_user ON sessions(user_id);

CREATE TABLE settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE accounts (
  id INTEGER PRIMARY KEY,
  provider TEXT NOT NULL,
  label TEXT NOT NULL,
  email TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  secret_enc TEXT,
  settings TEXT NOT NULL DEFAULT '{}',
  sync_state TEXT NOT NULL DEFAULT '{}',
  last_sync_at TEXT,
  last_success_at TEXT,
  last_error TEXT,
  error_count INTEGER NOT NULL DEFAULT 0,
  backfill_done INTEGER NOT NULL DEFAULT 0,
  message_count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE TABLE vendors (
  id INTEGER PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  domain TEXT,
  category TEXT,
  kind TEXT,
  manage_url TEXT,
  color TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE messages (
  id INTEGER PRIMARY KEY,
  account_id INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  provider_id TEXT NOT NULL,
  thread_id TEXT,
  message_id TEXT,
  from_name TEXT,
  from_email TEXT,
  from_domain TEXT,
  to_email TEXT,
  subject TEXT NOT NULL DEFAULT '',
  snippet TEXT NOT NULL DEFAULT '',
  body_text TEXT,
  received_at TEXT NOT NULL,
  labels TEXT NOT NULL DEFAULT '[]',
  attachments TEXT NOT NULL DEFAULT '[]',
  list_unsubscribe TEXT,
  category TEXT NOT NULL DEFAULT 'other',
  subtype TEXT,
  confidence REAL NOT NULL DEFAULT 0,
  importance INTEGER NOT NULL DEFAULT 0,
  vendor_id INTEGER REFERENCES vendors(id) ON DELETE SET NULL,
  summary TEXT,
  analysis TEXT NOT NULL DEFAULT '{}',
  user_category TEXT,
  muted INTEGER NOT NULL DEFAULT 0,
  ai_status TEXT,
  processed_at TEXT,
  created_at TEXT NOT NULL,
  UNIQUE(account_id, provider_id)
);
CREATE INDEX idx_messages_received ON messages(received_at DESC);
CREATE INDEX idx_messages_category ON messages(category, received_at DESC);
CREATE INDEX idx_messages_vendor ON messages(vendor_id);
CREATE INDEX idx_messages_msgid ON messages(message_id);
CREATE INDEX idx_messages_from ON messages(from_email);
CREATE INDEX idx_messages_ai ON messages(ai_status);

CREATE VIRTUAL TABLE messages_fts USING fts5(
  subject, from_name, from_email, snippet, body_text,
  content='messages', content_rowid='id', tokenize='porter unicode61'
);
CREATE TRIGGER messages_fts_ai AFTER INSERT ON messages BEGIN
  INSERT INTO messages_fts(rowid, subject, from_name, from_email, snippet, body_text)
  VALUES (new.id, new.subject, new.from_name, new.from_email, new.snippet, new.body_text);
END;
CREATE TRIGGER messages_fts_ad AFTER DELETE ON messages BEGIN
  INSERT INTO messages_fts(messages_fts, rowid, subject, from_name, from_email, snippet, body_text)
  VALUES ('delete', old.id, old.subject, old.from_name, old.from_email, old.snippet, old.body_text);
END;
CREATE TRIGGER messages_fts_au AFTER UPDATE OF subject, from_name, from_email, snippet, body_text ON messages BEGIN
  INSERT INTO messages_fts(messages_fts, rowid, subject, from_name, from_email, snippet, body_text)
  VALUES ('delete', old.id, old.subject, old.from_name, old.from_email, old.snippet, old.body_text);
  INSERT INTO messages_fts(rowid, subject, from_name, from_email, snippet, body_text)
  VALUES (new.id, new.subject, new.from_name, new.from_email, new.snippet, new.body_text);
END;

CREATE TABLE subscriptions (
  id INTEGER PRIMARY KEY,
  key TEXT NOT NULL UNIQUE,
  vendor_id INTEGER REFERENCES vendors(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  plan TEXT,
  kind TEXT,
  amount REAL,
  currency TEXT,
  cycle TEXT NOT NULL DEFAULT 'unknown',
  next_amount REAL,
  status TEXT NOT NULL DEFAULT 'active',
  started_at TEXT,
  trial_ends_at TEXT,
  next_renewal_at TEXT,
  last_charged_at TEXT,
  cancelled_at TEXT,
  payment_method TEXT,
  manage_url TEXT,
  source TEXT NOT NULL DEFAULT 'detected',
  overrides TEXT NOT NULL DEFAULT '{}',
  notes TEXT,
  muted INTEGER NOT NULL DEFAULT 0,
  confidence REAL NOT NULL DEFAULT 0.5,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX idx_subscriptions_vendor ON subscriptions(vendor_id);

CREATE TABLE subscription_events (
  id INTEGER PRIMARY KEY,
  subscription_id INTEGER NOT NULL REFERENCES subscriptions(id) ON DELETE CASCADE,
  message_id INTEGER REFERENCES messages(id) ON DELETE SET NULL,
  type TEXT NOT NULL,
  amount REAL,
  old_amount REAL,
  currency TEXT,
  cycle TEXT,
  plan TEXT,
  payment_method TEXT,
  occurred_at TEXT NOT NULL,
  effective_at TEXT,
  created_at TEXT NOT NULL
);
CREATE UNIQUE INDEX idx_sub_events_unique ON subscription_events(subscription_id, message_id, type);
CREATE INDEX idx_sub_events_sub ON subscription_events(subscription_id, occurred_at);

CREATE TABLE bills (
  id INTEGER PRIMARY KEY,
  key TEXT NOT NULL UNIQUE,
  vendor_id INTEGER REFERENCES vendors(id) ON DELETE SET NULL,
  message_id INTEGER REFERENCES messages(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'other',
  amount_due REAL,
  minimum_due REAL,
  statement_balance REAL,
  currency TEXT,
  due_at TEXT,
  statement_at TEXT,
  status TEXT NOT NULL DEFAULT 'due',
  autopay INTEGER NOT NULL DEFAULT 0,
  account_hint TEXT,
  paid_at TEXT,
  paid_amount REAL,
  pay_url TEXT,
  notes TEXT,
  source TEXT NOT NULL DEFAULT 'detected',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX idx_bills_due ON bills(due_at);
CREATE INDEX idx_bills_vendor ON bills(vendor_id);

CREATE TABLE charges (
  id INTEGER PRIMARY KEY,
  message_id INTEGER REFERENCES messages(id) ON DELETE CASCADE,
  vendor_id INTEGER REFERENCES vendors(id) ON DELETE SET NULL,
  subscription_id INTEGER REFERENCES subscriptions(id) ON DELETE SET NULL,
  bill_id INTEGER REFERENCES bills(id) ON DELETE SET NULL,
  kind TEXT NOT NULL,
  spend_category TEXT NOT NULL DEFAULT 'other',
  description TEXT NOT NULL,
  amount REAL NOT NULL,
  currency TEXT NOT NULL,
  direction TEXT NOT NULL DEFAULT 'out',
  status TEXT NOT NULL DEFAULT 'posted',
  payment_method TEXT,
  occurred_at TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'email',
  created_at TEXT NOT NULL
);
CREATE INDEX idx_charges_occurred ON charges(occurred_at DESC);
CREATE INDEX idx_charges_sub ON charges(subscription_id);
CREATE INDEX idx_charges_vendor ON charges(vendor_id);
CREATE UNIQUE INDEX idx_charges_message_kind ON charges(message_id, kind) WHERE message_id IS NOT NULL;

CREATE TABLE insights (
  id INTEGER PRIMARY KEY,
  message_id INTEGER REFERENCES messages(id) ON DELETE CASCADE,
  vendor_id INTEGER REFERENCES vendors(id) ON DELETE SET NULL,
  category TEXT NOT NULL,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  summary TEXT,
  amount REAL,
  currency TEXT,
  occurs_at TEXT,
  status TEXT,
  group_key TEXT,
  data TEXT NOT NULL DEFAULT '{}',
  links TEXT NOT NULL DEFAULT '[]',
  archived INTEGER NOT NULL DEFAULT 0,
  occurred_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE UNIQUE INDEX idx_insights_message_type ON insights(message_id, type) WHERE message_id IS NOT NULL;
CREATE INDEX idx_insights_category ON insights(category, occurred_at DESC);
CREATE INDEX idx_insights_occurs ON insights(occurs_at);
CREATE INDEX idx_insights_group ON insights(category, group_key);

CREATE TABLE alerts (
  id INTEGER PRIMARY KEY,
  fingerprint TEXT NOT NULL UNIQUE,
  type TEXT NOT NULL,
  category TEXT NOT NULL,
  severity TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT,
  facts TEXT NOT NULL DEFAULT '[]',
  message_id INTEGER REFERENCES messages(id) ON DELETE SET NULL,
  vendor_id INTEGER REFERENCES vendors(id) ON DELETE SET NULL,
  entity_type TEXT,
  entity_id INTEGER,
  action_url TEXT,
  action_label TEXT,
  due_at TEXT,
  status TEXT NOT NULL DEFAULT 'new',
  snoozed_until TEXT,
  notify INTEGER NOT NULL DEFAULT 1,
  notified_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX idx_alerts_status ON alerts(status, created_at DESC);
CREATE INDEX idx_alerts_notify ON alerts(notify, notified_at);

CREATE TABLE rules (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  match TEXT NOT NULL DEFAULT 'all',
  conditions TEXT NOT NULL DEFAULT '[]',
  actions TEXT NOT NULL DEFAULT '{}',
  hits INTEGER NOT NULL DEFAULT 0,
  last_hit_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE sender_overrides (
  id INTEGER PRIMARY KEY,
  pattern TEXT NOT NULL UNIQUE COLLATE NOCASE,
  category TEXT,
  ignore INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE TABLE channels (
  id INTEGER PRIMARY KEY,
  type TEXT NOT NULL,
  name TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  min_severity TEXT NOT NULL DEFAULT 'high',
  events TEXT NOT NULL DEFAULT '{}',
  config_enc TEXT NOT NULL,
  target_hint TEXT,
  last_used_at TEXT,
  last_error TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE notifications (
  id INTEGER PRIMARY KEY,
  channel_id INTEGER REFERENCES channels(id) ON DELETE SET NULL,
  channel_type TEXT NOT NULL,
  kind TEXT NOT NULL,
  subject TEXT NOT NULL,
  status TEXT NOT NULL,
  error TEXT,
  attempts INTEGER NOT NULL DEFAULT 0,
  alert_ids TEXT NOT NULL DEFAULT '[]',
  payload TEXT,
  next_attempt_at TEXT,
  created_at TEXT NOT NULL,
  sent_at TEXT
);
CREATE INDEX idx_notifications_created ON notifications(created_at DESC);
CREATE INDEX idx_notifications_retry ON notifications(status, next_attempt_at);

CREATE TABLE sync_runs (
  id INTEGER PRIMARY KEY,
  account_id INTEGER REFERENCES accounts(id) ON DELETE CASCADE,
  trigger TEXT NOT NULL,
  status TEXT NOT NULL,
  started_at TEXT NOT NULL,
  finished_at TEXT,
  fetched INTEGER NOT NULL DEFAULT 0,
  new_messages INTEGER NOT NULL DEFAULT 0,
  alerts_created INTEGER NOT NULL DEFAULT 0,
  error TEXT
);
CREATE INDEX idx_sync_runs_started ON sync_runs(started_at DESC);

CREATE TABLE audit_log (
  id INTEGER PRIMARY KEY,
  at TEXT NOT NULL,
  action TEXT NOT NULL,
  detail TEXT,
  ip TEXT
);
CREATE INDEX idx_audit_at ON audit_log(at DESC);

CREATE TABLE job_state (
  name TEXT PRIMARY KEY,
  last_run_at TEXT,
  last_status TEXT,
  last_error TEXT,
  duration_ms INTEGER
);

CREATE TABLE ai_usage (
  day TEXT PRIMARY KEY,
  calls INTEGER NOT NULL DEFAULT 0,
  input_tokens INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0
);
`,
  },
  {
    version: 2,
    name: "agent_gate",
    sql: `
CREATE TABLE agent_visits (
  id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  path TEXT NOT NULL,
  agent_name TEXT,
  agent_kind TEXT,
  reason TEXT,
  user_agent TEXT,
  ip TEXT,
  canary TEXT NOT NULL,
  headers TEXT
);
CREATE INDEX idx_agent_visits_created ON agent_visits(created_at DESC);

CREATE TABLE agent_checkins (
  id TEXT PRIMARY KEY,
  visit_id TEXT,
  created_at TEXT NOT NULL,
  agent_name TEXT,
  user_agent TEXT,
  ip TEXT,
  answered INTEGER NOT NULL DEFAULT 0,
  answers TEXT NOT NULL
);
CREATE INDEX idx_agent_checkins_created ON agent_checkins(created_at DESC);
`,
  },
];
