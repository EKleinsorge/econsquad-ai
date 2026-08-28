-- ============================================================
-- Re-engagement email system
-- Run this in the Supabase SQL Editor BEFORE deploying
-- the send-reengagement edge function.
-- ============================================================

-- 1. SENDS TABLE (one row per nudge actually delivered)
CREATE TABLE IF NOT EXISTS reengagement_sends (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  subscriber_id    uuid REFERENCES monday_drop_subscribers(id) ON DELETE SET NULL,
  email            text NOT NULL,
  days_inactive    integer,
  plan             text,
  sent_at          timestamptz DEFAULT now(),
  first_opened_at  timestamptz,
  open_count       integer DEFAULT 0,
  tracking_token   text UNIQUE DEFAULT gen_random_uuid()::text
);

CREATE INDEX IF NOT EXISTS idx_rs_user    ON reengagement_sends(user_id);
CREATE INDEX IF NOT EXISTS idx_rs_sent_at ON reengagement_sends(sent_at DESC);
CREATE INDEX IF NOT EXISTS idx_rs_token   ON reengagement_sends(tracking_token);

-- Cooldown lookups hit (user_id, sent_at) together
CREATE INDEX IF NOT EXISTS idx_rs_user_sent ON reengagement_sends(user_id, sent_at DESC);

-- 2. RLS — service role only, same posture as monday_drop_sends
ALTER TABLE reengagement_sends ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_all_reengagement" ON reengagement_sends;
CREATE POLICY "service_all_reengagement" ON reengagement_sends
  FOR ALL USING (auth.role() = 'service_role');

-- 3. Admin read-only view of nudge performance
CREATE OR REPLACE VIEW reengagement_stats AS
SELECT
  date_trunc('week', sent_at)::date        AS week,
  count(*)                                 AS sent,
  count(first_opened_at)                   AS opened,
  round(
    100.0 * count(first_opened_at) / NULLIF(count(*), 0)
  , 1)                                     AS open_rate_pct,
  round(avg(days_inactive), 1)             AS avg_days_inactive
FROM reengagement_sends
GROUP BY 1
ORDER BY 1 DESC;
