-- ═══════════════════════════════════════════════════════════════════════
--  TRIAL CARE — one small change, run AFTER the main migration
-- ═══════════════════════════════════════════════════════════════════════
--
-- The main migration creates trial_sends with CREATE TABLE IF NOT EXISTS, so
-- editing it there does nothing once the table exists — which it now does.
-- This widens the status check on the table you already have.
--
-- WHY: a member can reach five missions before we have written to them at all,
-- so two milestones fall due on the same morning. Sending "nice, your first
-- one" today and "five missions in" tomorrow reads as software that has not
-- been paying attention. The one it overtakes is recorded as 'superseded' —
-- written down, never sent — so the unique index guarantees it cannot surface
-- later. Without this constraint change that write is rejected and the stale
-- message comes back tomorrow.
--
-- Safe to run twice.

BEGIN;

DO $$
DECLARE c text;
BEGIN
  -- Drop whatever the status check is currently called. It was created inline,
  -- so the name is generated and worth not guessing.
  FOR c IN
    SELECT con.conname
    FROM pg_constraint con
    JOIN pg_class     rel ON rel.oid = con.conrelid
    JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
    WHERE nsp.nspname = 'public'
      AND rel.relname = 'trial_sends'
      AND con.contype  = 'c'
      AND pg_get_constraintdef(con.oid) ILIKE '%status%'
  LOOP
    EXECUTE format('ALTER TABLE public.trial_sends DROP CONSTRAINT %I', c);
  END LOOP;
END $$;

ALTER TABLE public.trial_sends
  ADD CONSTRAINT trial_sends_status_check
  CHECK (status IN ('sent', 'failed', 'superseded'));

COMMENT ON COLUMN public.trial_sends.status IS
  'sent | failed | superseded. superseded = they had already passed this milestone when a later one was sent, so it was closed off rather than delivered.';

COMMIT;

-- Should return one row reading: sent, failed, superseded
SELECT pg_get_constraintdef(con.oid) AS status_check_now
FROM pg_constraint con
JOIN pg_class rel ON rel.oid = con.conrelid
WHERE rel.relname = 'trial_sends' AND con.conname = 'trial_sends_status_check';
