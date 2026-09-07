-- supabase/migrations/20260908_outreach_tags.sql
--
-- ═══════════════════════════════════════════════════════════════════════
--  TAGS AND SEGMENTS
-- ═══════════════════════════════════════════════════════════════════════
--
-- Eric: "the ability to add custom tags to the contacts so we can build
-- segments as they progress through the marketing and other things."
--
-- WHY A VOCABULARY TABLE RATHER THAN A TEXT COLUMN
--
-- Free text on each contact produces "Rural", "rural", "RURAL " and "Rural "
-- as four different tags, and a segment built on one of them silently misses
-- three quarters of the people it was meant to find. Silently is the problem:
-- the segment still returns rows, so nothing looks broken. Tags are therefore a
-- controlled vocabulary with a normalised slug, and the display label is a
-- separate field so renaming a tag never orphans its assignments.
--
-- THREE KINDS OF TAG, AND WHY THE DIFFERENCE MATTERS
--
--   manual   Eric adds it. "met at IEDC", "warm intro available", "priority".
--   auto     The engine adds it as someone progresses: emailed, opened,
--            replied, bounced, converted. This is the "as they progress"
--            Eric asked for.
--   derived  Computed from data at import: organisation type, state.
--
-- The distinction earns its place the first time auto tags are rebuilt: a
-- rebuild deletes and reinserts only its own kind, so Eric's manual tags
-- survive. A single undifferentiated tag table would lose them, once, quietly,
-- and there would be no way to get them back.

BEGIN;

CREATE TABLE IF NOT EXISTS public.outreach_tags (
  slug        text PRIMARY KEY
              CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),   -- normalised, always
  label       text NOT NULL,
  kind        text NOT NULL DEFAULT 'manual'
              CHECK (kind IN ('manual','auto','derived')),
  colour      text NOT NULL DEFAULT 'slate',
  description text,
  -- The engine reads some of these by name. Eric can rename the label but not
  -- delete the tag, because deleting 'replied' would not break loudly - it
  -- would just stop anyone being excluded for having replied.
  protected   boolean NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- Tags on people.
CREATE TABLE IF NOT EXISTS public.outreach_contact_tags (
  contact_id bigint NOT NULL REFERENCES public.outreach_contacts(id) ON DELETE CASCADE,
  tag        text   NOT NULL REFERENCES public.outreach_tags(slug) ON UPDATE CASCADE ON DELETE CASCADE,
  added_at   timestamptz NOT NULL DEFAULT now(),
  added_by   text,          -- an admin email, or 'system'
  note       text,
  PRIMARY KEY (contact_id, tag)
);
CREATE INDEX IF NOT EXISTS outreach_contact_tags_tag_idx ON public.outreach_contact_tags (tag);

-- Tags on organisations. Research finds facts about the ORGANISATION, not the
-- person - target sectors, an announced project, a live RFP - and those should
-- not have to be copied onto each colleague.
CREATE TABLE IF NOT EXISTS public.outreach_org_tags (
  domain   text NOT NULL REFERENCES public.outreach_orgs(domain) ON UPDATE CASCADE ON DELETE CASCADE,
  tag      text NOT NULL REFERENCES public.outreach_tags(slug)   ON UPDATE CASCADE ON DELETE CASCADE,
  added_at timestamptz NOT NULL DEFAULT now(),
  added_by text,
  note     text,
  PRIMARY KEY (domain, tag)
);
CREATE INDEX IF NOT EXISTS outreach_org_tags_tag_idx ON public.outreach_org_tags (tag);

-- Refuse to delete a protected tag rather than cascading through the engine.
CREATE OR REPLACE FUNCTION public.outreach_protect_tag()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.protected THEN
    RAISE EXCEPTION 'outreach: "%" is used by the engine and cannot be deleted. Rename its label instead.', OLD.slug;
  END IF;
  RETURN OLD;
END $$;
DROP TRIGGER IF EXISTS outreach_protect_tag_trg ON public.outreach_tags;
CREATE TRIGGER outreach_protect_tag_trg BEFORE DELETE ON public.outreach_tags
  FOR EACH ROW EXECUTE FUNCTION public.outreach_protect_tag();

-- ── Segments ─────────────────────────────────────────────────────────
-- A saved question, not a saved list. "Texas EDCs who opened but never replied"
-- must mean the same thing next month against different data, which a frozen
-- list of ids cannot do.
CREATE TABLE IF NOT EXISTS public.outreach_segments (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name          text NOT NULL UNIQUE,
  description   text,
  include_tags  text[] NOT NULL DEFAULT '{}',   -- must have ALL of these
  any_tags      text[] NOT NULL DEFAULT '{}',   -- must have AT LEAST ONE of these
  exclude_tags  text[] NOT NULL DEFAULT '{}',   -- must have NONE of these
  org_kinds     text[] NOT NULL DEFAULT '{}',   -- empty = any
  states        text[] NOT NULL DEFAULT '{}',   -- empty = any
  list_names    text[] NOT NULL DEFAULT '{}',   -- empty = any
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- Tags on a contact = its own, plus its organisation's. A segment should not
-- need to know which level a fact was recorded at.
CREATE OR REPLACE VIEW public.outreach_contact_all_tags AS
SELECT c.id AS contact_id, t.tag
  FROM public.outreach_contacts c
  JOIN public.outreach_contact_tags t ON t.contact_id = c.id
UNION
SELECT c.id, ot.tag
  FROM public.outreach_contacts c
  JOIN public.outreach_org_tags ot ON ot.domain = c.domain;

-- Who is in a segment AND may be written to right now. Built on
-- outreach_next_per_org, so a segment queue is still one person per
-- organisation - the pacing rule is not something a segment can opt out of.
CREATE OR REPLACE FUNCTION public.outreach_segment_queue(p_segment text)
RETURNS TABLE (id bigint, email text, first_name_clean text, domain text,
               kind text, website text, state text)
LANGUAGE sql STABLE AS $$
  WITH s AS (SELECT * FROM public.outreach_segments WHERE name = p_segment)
  SELECT q.id, q.email, q.first_name_clean, q.domain, q.kind, q.website, o.state
    FROM public.outreach_next_per_org q
    JOIN public.outreach_orgs o ON o.domain = q.domain
    CROSS JOIN s
   WHERE (cardinality(s.org_kinds) = 0 OR q.kind = ANY (s.org_kinds))
     AND (cardinality(s.states)    = 0 OR o.state = ANY (s.states))
     AND (cardinality(s.list_names) = 0 OR EXISTS (
           SELECT 1 FROM public.outreach_list_members lm
             JOIN public.outreach_lists l ON l.id = lm.list_id
            WHERE lm.contact_id = q.id AND l.name = ANY (s.list_names)))
     AND (cardinality(s.include_tags) = 0 OR NOT EXISTS (
           SELECT 1 FROM unnest(s.include_tags) needed
            WHERE needed NOT IN (SELECT tag FROM public.outreach_contact_all_tags
                                  WHERE contact_id = q.id)))
     AND (cardinality(s.any_tags) = 0 OR EXISTS (
           SELECT 1 FROM public.outreach_contact_all_tags
            WHERE contact_id = q.id AND tag = ANY (s.any_tags)))
     AND NOT EXISTS (
           SELECT 1 FROM public.outreach_contact_all_tags
            WHERE contact_id = q.id AND tag = ANY (s.exclude_tags));
$$;

-- ── The vocabulary ───────────────────────────────────────────────────
INSERT INTO public.outreach_tags (slug, label, kind, colour, description, protected) VALUES
  -- progress, written by the engine
  ('researched',     'Researched',        'auto','slate', 'Their website has been read and produced something specific.', true),
  ('research-thin',  'Nothing to say',    'auto','amber', 'The site gave Emma nothing specific. Held back rather than sent generically.', true),
  ('emailed',        'Emailed',           'auto','blue',  'Has had at least one message.', true),
  ('opened',         'Opened',            'auto','blue',  'Opened at least one.', true),
  ('replied',        'Replied',           'auto','green', 'Wrote back. All sequences stop.', true),
  ('bounced',        'Bounced',           'auto','red',   'Address rejected the message.', true),
  ('unsubscribed',   'Unsubscribed',      'auto','red',   'Asked to stop. Permanent.', true),
  ('converted',      'Started a trial',   'auto','lime',  'Signed up. Their organisation closes to cold outreach.', true),
  ('no-response',    'No response',       'auto','slate', 'Finished a full sequence in silence.', true),
  ('resting',        'Resting',           'auto','amber', 'In a cooldown before any further contact.', true),
  -- organisation type, derived at import
  ('gov',            'Government',        'derived','slate','City, county or state (.gov / .us).', false),
  ('edc-nonprofit',  'EDC / chamber',     'derived','slate','Economic development org, chamber or nonprofit (.org).', false),
  ('company',        'Company',           'derived','slate','Private company or consultancy.', false),
  ('university',     'University',        'derived','slate','Higher education (.edu).', false),
  -- Eric's, to start him off
  ('priority',       'Priority',          'manual','lime', 'Worth the effort. Goes first.', false),
  ('warm-intro',     'Warm intro',        'manual','green','Somebody could introduce us.', false),
  ('met-in-person',  'Met in person',     'manual','green','Conference, site visit, or a call.', false),
  ('big-metro',      'Large metro',       'manual','blue', 'Major market.', false),
  ('rural',          'Rural',             'manual','blue', 'Rural community.', false),
  ('not-a-fit',      'Not a fit',         'manual','red',  'Deliberately excluded. Kept, so the reason is not lost.', false),
  ('try-later',      'Try later',         'manual','amber','Asked to be approached another time.', false)
ON CONFLICT (slug) DO NOTHING;

-- Organisation-type tags, from what import already worked out.
INSERT INTO public.outreach_org_tags (domain, tag, added_by)
SELECT o.domain,
       CASE o.kind WHEN 'government' THEN 'gov'
                   WHEN 'edc_nonprofit' THEN 'edc-nonprofit'
                   WHEN 'company' THEN 'company'
                   WHEN 'university' THEN 'university' END,
       'system'
  FROM public.outreach_orgs o
 WHERE o.kind IN ('government','edc_nonprofit','company','university')
ON CONFLICT DO NOTHING;

ALTER TABLE public.outreach_tags         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.outreach_contact_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.outreach_org_tags     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.outreach_segments     ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['outreach_tags','outreach_contact_tags','outreach_org_tags','outreach_segments']
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I_admin ON public.%I', t, t);
    EXECUTE format('CREATE POLICY %I_admin ON public.%I FOR ALL '
                   'USING (public.is_current_user_admin()) '
                   'WITH CHECK (public.is_current_user_admin())', t, t);
    EXECUTE format('REVOKE ALL ON public.%I FROM anon', t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', t);
  END LOOP;
END $$;

COMMIT;
