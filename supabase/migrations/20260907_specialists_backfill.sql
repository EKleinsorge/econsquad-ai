-- supabase/migrations/20260907_specialists_backfill.sql
--
-- FOUR SPECIALISTS EXIST FOR CUSTOMERS BUT NOT IN THE ADMIN TABLE.
--
-- Found on 2026-09-04, when a foreign key on specialist_prompts failed with
-- "Key (specialist_id)=(19) is not present in table specialists". That was not
-- a bad row - it was the truth about this schema.
--
-- index.html does NOT read public.specialists. The dashboard draws all 22
-- cards from a hardcoded `var squad=[...]` array. public.specialists is a
-- separate, admin-side table, and the last four specialists were added to the
-- array and to the chat function but never to the table. So Emma, Clara, Riley
-- and Nova work perfectly for every customer and are invisible in admin: they
-- cannot be renamed, switched off, included in Starter, given an hours-saved
-- figure, or - since the prompts move to the database - have their prompt
-- edited there.
--
-- This backfills them from the squad array, verbatim.
--
-- ON CONFLICT DO NOTHING: this can only fill genuine gaps. It cannot disturb
-- the 18 rows that already exist, and it is safe to run twice.
--
-- NOTE ON `plan`: every row here is 'starter'. That column is not enforced
-- anywhere today - index.html shows every specialist to everyone, and the
-- admin "Starter settings" checkboxes write a value no code has ever read.
-- 'starter' is therefore the choice that changes nothing for anybody. Decide
-- the real Starter/Pro split deliberately, on the Starter settings screen,
-- once this table is trustworthy again.

BEGIN;

INSERT INTO public.specialists
  (id, name, role, cat, color, plan, hours_per_use, save_time, description,
   is_new, is_locked, is_active, sort_order)
VALUES
  (19, 'Email Regenerator',  'Email copy specialist',      'marketing', 'coral',  'starter', 2,   'Saves 2 hrs/use',
       'Transform bland emails into compelling copy that gets opened and acted on.',
       true, false, true, 19),

  (20, 'Cover Letter Writer', 'Cover letter specialist',    'grants',    'blue',   'starter', 1.5, 'Saves 1.5 hrs/use',
       'Write compelling cover letters for grant applications, business proposals, and professional submissions.',
       true, false, true, 20),

  (21, 'RFI Responder',       'RFI response specialist',    'site',      'teal',   'starter', 3,   'Saves 3 hrs/use',
       'Craft strategic, compelling responses to RFIs from expanding companies to position your community competitively.',
       true, false, true, 21),

  (22, 'Data Analyzer',       'Data & spreadsheet analyst', 'data',      'purple', 'starter', 4,   'Saves 4 hrs/use',
       'Analyze spreadsheets and data sets to uncover insights, trends, and findings in plain language your stakeholders can act on.',
       true, false, true, 22)
ON CONFLICT (id) DO NOTHING;

COMMIT;

-- ── What you should see ──────────────────────────────────────
-- First: 22 rows, ids 1 to 22, with the four new ones at the end.
SELECT id, name, cat, plan, hours_per_use, is_active
FROM public.specialists
ORDER BY id;

-- Second: EMPTY. This is the same drift query from 20260904_specialist_prompts.sql.
-- It listed 19, 20, 21 and 22 before this migration. It should now list nothing.
SELECT g.id AS still_missing_from_specialists
FROM generate_series(1, 22) AS g(id)
LEFT JOIN public.specialists s ON s.id = g.id
WHERE s.id IS NULL
ORDER BY g.id;

-- Third: every specialist now has an editable prompt. 22 rows, no NULLs.
SELECT s.id, s.name,
       CASE WHEN p.specialist_id IS NULL THEN 'NO PROMPT ROW - uses the hardcoded fallback'
            ELSE 'editable in admin (' || length(p.system_prompt) || ' chars)' END AS prompt
FROM public.specialists s
LEFT JOIN public.specialist_prompts p ON p.specialist_id = s.id
ORDER BY s.id;
