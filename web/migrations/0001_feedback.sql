-- Feedback table — populated by POST /api/feedback from the chat UI's
-- thumbs-up / thumbs-down buttons on answers.
--
-- Apply to the remote D1 database with:
--   pnpm exec wrangler d1 execute abolitionist-feedback \
--     --file=migrations/0001_feedback.sql --remote
-- (and --local for the local dev mirror).

CREATE TABLE IF NOT EXISTS feedback (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
  rating      INTEGER NOT NULL CHECK (rating IN (-1, 1)),
  source      TEXT    NOT NULL DEFAULT 'ai' CHECK (source IN ('ai', 'index')),
  question    TEXT    NOT NULL,
  answer      TEXT    NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_feedback_created_at ON feedback (created_at);
CREATE INDEX IF NOT EXISTS idx_feedback_rating     ON feedback (rating);
CREATE INDEX IF NOT EXISTS idx_feedback_source     ON feedback (source);
