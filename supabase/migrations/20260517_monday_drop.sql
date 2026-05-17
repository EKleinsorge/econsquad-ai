-- ============================================================
-- Monday AI for ED Drop — Email System
-- Run this in Supabase SQL Editor
-- ============================================================

-- 1. SUBSCRIBERS TABLE
CREATE TABLE IF NOT EXISTS monday_drop_subscribers (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id            uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  email              text NOT NULL UNIQUE,
  name               text,
  subscribed_at      timestamptz DEFAULT now(),
  unsubscribed_at    timestamptz,
  unsubscribe_token  text UNIQUE DEFAULT gen_random_uuid()::text,
  created_at         timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_mds_email   ON monday_drop_subscribers(email);
CREATE INDEX IF NOT EXISTS idx_mds_user_id ON monday_drop_subscribers(user_id);
CREATE INDEX IF NOT EXISTS idx_mds_token   ON monday_drop_subscribers(unsubscribe_token);

-- 2. SENDS TABLE (one row per subscriber per issue)
CREATE TABLE IF NOT EXISTS monday_drop_sends (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subscriber_id    uuid REFERENCES monday_drop_subscribers(id) ON DELETE CASCADE,
  issue_number     integer NOT NULL,
  issue_date       date NOT NULL,
  issue_title      text,
  sent_at          timestamptz DEFAULT now(),
  first_opened_at  timestamptz,
  open_count       integer DEFAULT 0,
  tracking_token   text UNIQUE DEFAULT gen_random_uuid()::text,
  UNIQUE(subscriber_id, issue_number)
);

CREATE INDEX IF NOT EXISTS idx_mdse_subscriber ON monday_drop_sends(subscriber_id);
CREATE INDEX IF NOT EXISTS idx_mdse_issue      ON monday_drop_sends(issue_number);
CREATE INDEX IF NOT EXISTS idx_mdse_token      ON monday_drop_sends(tracking_token);

-- 3. RLS
ALTER TABLE monday_drop_subscribers ENABLE ROW LEVEL SECURITY;
ALTER TABLE monday_drop_sends       ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_all_subscribers" ON monday_drop_subscribers
  FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "service_all_sends" ON monday_drop_sends
  FOR ALL USING (auth.role() = 'service_role');

-- Users can see their own subscription status
CREATE POLICY "users_own_subscription" ON monday_drop_subscribers
  FOR SELECT USING (auth.uid() = user_id);

-- 4. AUTO-ENROLL ALL EXISTING USERS
INSERT INTO monday_drop_subscribers (user_id, email, name)
SELECT
  u.id,
  u.email,
  COALESCE(p.full_name, split_part(u.email, '@', 1))
FROM auth.users u
LEFT JOIN profiles p ON p.id = u.id
WHERE u.email IS NOT NULL
ON CONFLICT (email) DO NOTHING;

-- 5. TRIGGER — auto-enroll every new signup
CREATE OR REPLACE FUNCTION auto_enroll_monday_drop()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO monday_drop_subscribers (user_id, email, name)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(split_part(NEW.email, '@', 1), NEW.email)
  )
  ON CONFLICT (email) DO UPDATE
    SET user_id = EXCLUDED.user_id
    WHERE monday_drop_subscribers.user_id IS NULL;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_new_user_enroll_drop ON auth.users;
CREATE TRIGGER on_new_user_enroll_drop
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION auto_enroll_monday_drop();
