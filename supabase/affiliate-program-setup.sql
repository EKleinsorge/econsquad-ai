-- =============================================
-- EconSquad AI — Affiliate Program Tables
-- Run in Supabase SQL Editor
-- =============================================

-- 1. Affiliates (applications + approved partners)
CREATE TABLE IF NOT EXISTS affiliates (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  code              text UNIQUE NOT NULL,
  status            text NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending','approved','rejected','suspended')),
  payout_method     text CHECK (payout_method IN ('paypal','direct_deposit')),
  payout_info       text,
  applied_at        timestamptz DEFAULT now(),
  approved_at       timestamptz,
  approved_by       uuid REFERENCES auth.users(id),
  rejection_note    text,
  admin_notes       text,
  total_referrals   int DEFAULT 0,
  paid_referrals    int DEFAULT 0,
  total_earned      numeric(10,2) DEFAULT 0,
  milestone_level   int DEFAULT 0,
  created_at        timestamptz DEFAULT now()
);

-- 2. Referrals (who signed up via an affiliate link)
CREATE TABLE IF NOT EXISTS affiliate_referrals (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  affiliate_id      uuid REFERENCES affiliates(id) ON DELETE CASCADE NOT NULL,
  referred_user_id  uuid REFERENCES auth.users(id),
  referred_email    text,
  signed_up_at      timestamptz DEFAULT now(),
  converted_to_paid boolean DEFAULT false,
  conversion_date   timestamptz,
  subscription_plan text,
  monthly_amount    numeric(10,2) DEFAULT 0,
  is_active         boolean DEFAULT true,
  created_at        timestamptz DEFAULT now(),
  UNIQUE(affiliate_id, referred_user_id)
);

-- 3. Commissions (monthly recurring + milestone bonuses)
CREATE TABLE IF NOT EXISTS affiliate_commissions (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  affiliate_id     uuid REFERENCES affiliates(id) ON DELETE CASCADE NOT NULL,
  period_month     text NOT NULL,
  type             text NOT NULL DEFAULT 'recurring'
                   CHECK (type IN ('recurring','milestone_bonus')),
  amount           numeric(10,2) NOT NULL,
  referred_user_id uuid REFERENCES auth.users(id),
  description      text,
  status           text NOT NULL DEFAULT 'pending'
                   CHECK (status IN ('pending','paid','cancelled')),
  paid_at          timestamptz,
  paid_by          uuid REFERENCES auth.users(id),
  created_at       timestamptz DEFAULT now()
);

-- ── Row Level Security ────────────────────────────────────────

ALTER TABLE affiliates ENABLE ROW LEVEL SECURITY;
ALTER TABLE affiliate_referrals ENABLE ROW LEVEL SECURITY;
ALTER TABLE affiliate_commissions ENABLE ROW LEVEL SECURITY;

-- Users can INSERT their own affiliate application
CREATE POLICY "affiliates_own_insert" ON affiliates
  FOR INSERT WITH CHECK (user_id = auth.uid());

-- Users can SELECT their own affiliate record
CREATE POLICY "affiliates_own_select" ON affiliates
  FOR SELECT USING (user_id = auth.uid());

-- Any authenticated user can look up an approved affiliate by code
-- (needed so newly signed-up users can record which affiliate referred them)
CREATE POLICY "affiliates_select_approved" ON affiliates
  FOR SELECT USING (status = 'approved');

-- Newly signed-up users can insert their own referral record
CREATE POLICY "affiliate_referrals_insert_referred" ON affiliate_referrals
  FOR INSERT WITH CHECK (referred_user_id = auth.uid());

-- Affiliates can view referrals for their own affiliate record
CREATE POLICY "affiliate_referrals_own_select" ON affiliate_referrals
  FOR SELECT USING (
    affiliate_id IN (SELECT id FROM affiliates WHERE user_id = auth.uid())
  );

-- Users can view their own commissions
CREATE POLICY "affiliate_commissions_own_select" ON affiliate_commissions
  FOR SELECT USING (
    affiliate_id IN (SELECT id FROM affiliates WHERE user_id = auth.uid())
  );

-- Admins get full access to all three tables
CREATE POLICY "affiliates_admin" ON affiliates
  FOR ALL USING (is_current_user_admin()) WITH CHECK (is_current_user_admin());

CREATE POLICY "affiliate_referrals_admin" ON affiliate_referrals
  FOR ALL USING (is_current_user_admin()) WITH CHECK (is_current_user_admin());

CREATE POLICY "affiliate_commissions_admin" ON affiliate_commissions
  FOR ALL USING (is_current_user_admin()) WITH CHECK (is_current_user_admin());
