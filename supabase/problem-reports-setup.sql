-- ============================================================
-- Problem Reports Table
-- Run this in the Supabase SQL Editor (project: kbwcsmctwtgrjtjcghkt)
-- ============================================================

CREATE TABLE IF NOT EXISTS problem_reports (
  id          uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid         REFERENCES auth.users(id) ON DELETE SET NULL,
  user_name   text,
  "user"      text,
  problem     text         NOT NULL,
  page        text,
  version     text,
  user_agent  text,
  timestamp   timestamptz  DEFAULT now(),
  resolved    boolean      DEFAULT false,
  created_at  timestamptz  DEFAULT now()
);

-- Enable RLS
ALTER TABLE problem_reports ENABLE ROW LEVEL SECURITY;

-- Any authenticated user can insert their own report
CREATE POLICY "Users can insert problem reports"
  ON problem_reports FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- Only admins can read reports
CREATE POLICY "Admins can read all reports"
  ON problem_reports FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true)
  );

-- Only admins can mark resolved
CREATE POLICY "Admins can update reports"
  ON problem_reports FOR UPDATE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true)
  );
