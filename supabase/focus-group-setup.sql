-- ============================================================
-- Focus Group / Beta Tester Access Program
-- Run this in the Supabase SQL Editor
-- ============================================================

-- 1. Add beta tester fields to profiles
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS is_beta_tester   boolean     DEFAULT false,
  ADD COLUMN IF NOT EXISTS beta_expires_at  timestamptz DEFAULT '2026-06-30 23:59:59+00',
  ADD COLUMN IF NOT EXISTS beta_activated_at timestamptz,
  ADD COLUMN IF NOT EXISTS promo_code_used  text;

-- 2. Index for fast admin queries
CREATE INDEX IF NOT EXISTS idx_profiles_beta_tester ON profiles(is_beta_tester) WHERE is_beta_tester = true;

-- Done. The app handles promo code redemption and access control in JS.
-- To manually grant beta access to a user by email:
-- UPDATE profiles SET is_beta_tester=true, beta_expires_at='2026-06-30 23:59:59+00', beta_activated_at=now(), promo_code_used='FOCUSGROUP' WHERE email='user@example.com';
