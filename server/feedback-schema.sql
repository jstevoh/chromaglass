-- The feedback database (D1, server/feedback-worker.js). One table, one row an
-- entry, so "what have people said this month" is one SELECT.
--
-- Once, after `npx wrangler d1 create chromaglass-feedback`:
--   npx wrangler d1 execute chromaglass-feedback --remote --file server/feedback-schema.sql
-- Safe to run again: every statement is IF NOT EXISTS.

CREATE TABLE IF NOT EXISTS feedback (
  id          TEXT PRIMARY KEY,           -- YYYY-MM-DD-<base36 ms>-<random>
  at          TEXT NOT NULL,              -- received, ISO 8601 UTC
  topic       TEXT NOT NULL,              -- bug | idea | love | other
  message     TEXT NOT NULL,
  uid         TEXT,                       -- the Firebase account, only from a verified token
  email       TEXT,                       -- that account's email, verified the same way
  reply_to    TEXT,                       -- an address typed by someone not signed in
  app_version TEXT,                       -- the Mac app's version, or null in a browser
  build       TEXT,                       -- the site's commit
  shell       TEXT,                       -- mac | browser
  phone       INTEGER NOT NULL DEFAULT 0, -- drawn in the phone layout
  tier        TEXT,                       -- free | home | pro, as the app saw it
  look        TEXT,                       -- the look on the plate when it was sent
  page        TEXT,                       -- the page's path, no query
  user_agent  TEXT,
  country     TEXT,
  has_logs    INTEGER NOT NULL DEFAULT 0, -- the sender ticked "log and settings"
  context     TEXT NOT NULL,              -- everything sent, as JSON, minus the picture
  picture     BLOB,                       -- the plate as a JPEG, when they ticked it
  status      TEXT NOT NULL DEFAULT 'new',-- new | read | done
  emailed     TEXT,                       -- sent | failed <status> | off
  ip_hash     TEXT                        -- for the rate limit, cleared after an hour; never the address itself
);

CREATE INDEX IF NOT EXISTS feedback_at ON feedback (at);
CREATE INDEX IF NOT EXISTS feedback_ip ON feedback (ip_hash, at);
