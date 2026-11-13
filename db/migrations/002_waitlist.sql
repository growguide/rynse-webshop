-- ---------------------------------------------------------------------------
-- WAITLIST (coming soon page: "tell me when the shop opens")
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS waitlist (
  id          bigserial PRIMARY KEY,
  email       citext NOT NULL UNIQUE,
  locale      text NOT NULL DEFAULT 'en',
  source      text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  notified_at timestamptz
);
