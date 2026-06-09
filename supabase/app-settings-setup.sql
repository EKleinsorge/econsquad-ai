-- ============================================================
-- App Settings Table + Problem Report Recipients
-- Run this in the Supabase SQL Editor
-- ============================================================

CREATE TABLE IF NOT EXISTS app_settings (
  key   text PRIMARY KEY,
  value text NOT NULL,
  updated_at timestamptz DEFAULT now()
);

-- Seed default report recipients (update as needed)
INSERT INTO app_settings (key, value)
VALUES ('report_recipients', 'eric@gslisolutions.com')
ON CONFLICT (key) DO NOTHING;

-- RLS: anyone can read settings, only admins (service role) can write
ALTER TABLE app_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read app_settings"
  ON app_settings FOR SELECT
  USING (true);

-- Only service role can insert/update (done via edge function or admin SQL)
