-- ═══════════════════════════════════════════════════════════════════
-- Keep the conversation, not a summary of it
-- ═══════════════════════════════════════════════════════════════════
--
-- What "Save to history" has been storing:
--
--   prompt : every USER message joined with ' | ' and CUT AT 500 CHARACTERS
--   result : the single last thing the specialist said
--
-- Everything in between - the draft, the correction, the second draft, the
-- thing you actually wanted - was discarded at save time. So "Reopen" could
-- never have worked, and "what exactly did we send them six months ago" was
-- unanswerable. Both are the point of having history at all.
--
-- ⚠️ THIS CANNOT BE BACKFILLED. Conversations already saved have lost their
-- middle permanently. Only missions saved after this ships can be resumed.
-- Same shape as the org stamp and the cost columns: the fix is cheap, the
-- delay is not.
--
-- Safe to re-run.

BEGIN;

DO $guard$
BEGIN
  IF to_regclass('public.task_history') IS NULL THEN
    RAISE EXCEPTION
      'task_history does not exist. This is not the EconSquad database. Nothing has been changed.';
  END IF;
END
$guard$;


ALTER TABLE public.task_history
  ADD COLUMN IF NOT EXISTS messages jsonb;

COMMENT ON COLUMN public.task_history.messages IS
  'The full conversation as [{role,content},...] in order. prompt and result stay as they were, for the card preview and for rows saved before this column existed. Written by the browser, so it is size-capped and shape-checked by esq_task_transcript_guard.';


-- ── ⚠️ THE BROWSER WRITES THIS COLUMN ───────────────────────────────
-- Which means one client can put anything in it, including 40MB of text, in
-- a table every ROI figure and badge already reads. A check constraint would
-- be neater but the size functions are not immutable, so it is a trigger.
--
-- It TRIMS rather than refuses: losing the oldest turns of a very long
-- conversation is a smaller harm than losing the whole mission because the
-- save was rejected. It always keeps the FIRST exchange (what was asked) and
-- the LAST (what was produced), which is what a person needs to recognise it.
CREATE OR REPLACE FUNCTION public.esq_task_transcript_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $$
DECLARE
  max_bytes  int := 300000;   -- ~300KB, generous for any real conversation
  max_turns  int := 200;
BEGIN
  IF NEW.messages IS NULL THEN RETURN NEW; END IF;

  -- Shape: an array of objects, or nothing at all.
  IF jsonb_typeof(NEW.messages) <> 'array' THEN
    NEW.messages := NULL;
    RETURN NEW;
  END IF;

  -- Too many turns: keep the first and the most recent.
  IF jsonb_array_length(NEW.messages) > max_turns THEN
    NEW.messages :=
      jsonb_build_array(NEW.messages -> 0)
      || (SELECT coalesce(jsonb_agg(e ORDER BY ord), '[]'::jsonb)
            FROM (SELECT e, ord
                    FROM jsonb_array_elements(NEW.messages) WITH ORDINALITY AS t(e, ord)
                   WHERE ord > jsonb_array_length(NEW.messages) - (max_turns - 1)
                 ) s);
  END IF;

  -- Still too big: drop from the middle until it fits, first and last kept.
  WHILE length(NEW.messages::text) > max_bytes
    AND jsonb_array_length(NEW.messages) > 2 LOOP
    NEW.messages := NEW.messages - 1;   -- removes element at index 1
  END LOOP;

  -- A single enormous message is not fixable by dropping turns.
  IF length(NEW.messages::text) > max_bytes THEN
    NEW.messages := NULL;
  END IF;

  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS esq_task_transcript_trg ON public.task_history;
CREATE TRIGGER esq_task_transcript_trg
  BEFORE INSERT OR UPDATE OF messages ON public.task_history
  FOR EACH ROW EXECUTE FUNCTION public.esq_task_transcript_guard();

COMMIT;


-- ── The report, as rows. Your SQL editor has no Messages pane. ──────
SELECT 'the column exists' AS what,
       (SELECT count(*) FROM information_schema.columns
         WHERE table_schema='public' AND table_name='task_history'
           AND column_name='messages')                              AS n,
       'wanted: 1'                                                   AS meaning
UNION ALL
SELECT 'the size guard is installed',
       (SELECT count(*) FROM pg_trigger
         WHERE tgrelid='public.task_history'::regclass
           AND tgname='esq_task_transcript_trg' AND NOT tgisinternal),
       'wanted: 1. The browser writes this column, so it is capped.'
UNION ALL
SELECT 'missions with a full transcript',
       (SELECT count(*) FROM public.task_history WHERE messages IS NOT NULL),
       'starts at 0 - save a new mission and it becomes 1'
UNION ALL
SELECT 'missions with only the old summary',
       (SELECT count(*) FROM public.task_history WHERE messages IS NULL),
       'these can never be resumed. Their middle was never written down.';
