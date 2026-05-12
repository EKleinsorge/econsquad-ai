-- ============================================================
-- EconSquad AI — Book Page Settings Table
-- Run this in: Supabase Dashboard → SQL Editor → New Query
-- ============================================================

CREATE TABLE IF NOT EXISTS book_settings (
  key text PRIMARY KEY,
  value text
);

ALTER TABLE book_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read" ON book_settings
  FOR SELECT USING (true);

CREATE POLICY "Auth write" ON book_settings
  FOR ALL USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');
