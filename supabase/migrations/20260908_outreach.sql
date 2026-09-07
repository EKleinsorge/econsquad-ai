-- supabase/migrations/20260908_outreach.sql
--
-- ═══════════════════════════════════════════════════════════════════════
--  EMMA — outbound outreach. Foundation: lists, organisations, contacts.
-- ═══════════════════════════════════════════════════════════════════════
--
-- Eric has ~4,433 economic development professionals from GSLI business
-- relationships. The file carries six columns: id, created_at, first_name,
-- last_name, email, unsubscribed. No organisation, no title, no website.
--
-- THE EMAIL DOMAIN IS THE ORGANISATION, AND ALSO THE WEBSITE.
-- bloomingtonedc.com, chathamcountync.gov, hceda.org. That single fact is what
-- makes research possible without Eric supplying a company column, and it is
-- why organisations are first-class here rather than a text field on a contact.
--
-- THE NUMBER THAT SHAPES THIS DESIGN
--
--   4,433 people  ->  2,843 organisations
--   2,024 organisations have exactly one contact
--     819 organisations have two or more  (2,160 people)
--         Empire State Development has 22. Virginia's VEDP has 12.
--
-- Three people at the same agency receiving "I had a look at your website" on
-- the same morning will forward them to each other by lunchtime, and the whole
-- thing reads as a mail merge - the one impression that cannot be recovered in
-- a professional community this small.
--
-- So the organisation is a PACING UNIT, NOT A LIMIT. Everyone can eventually be
-- written to. What is forbidden is two colleagues in flight at once. After a
-- sequence ends without success, the organisation rests, and then a different
-- person there may be approached with a different angle. When somebody at the
-- organisation actually subscribes, cold outreach to their colleagues stops for
-- good - the right move then is asking the customer to bring them in, not
-- cold-pitching the person sitting ten feet away from them.
--
-- LISTS ARE NAMED AND MANY. Eric intends to build more targeted lists. A
-- contact belongs to any number of them; the contact row is unique by email
-- across all of them, so importing an overlapping list can never create a
-- second copy of a person and never double-sends.

BEGIN;

-- ── Lists ────────────────────────────────────────────────────────────
-- Consent basis is recorded per list, not assumed. If a future list has a
-- weaker basis than this one, that has to be visible at the point of sending
-- rather than remembered.
CREATE TABLE IF NOT EXISTS public.outreach_lists (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name          text NOT NULL UNIQUE,
  source        text,
  consent_basis text NOT NULL DEFAULT 'business_relationship'
                CHECK (consent_basis IN ('business_relationship','signup','event','other')),
  notes         text,
  imported_at   timestamptz NOT NULL DEFAULT now(),
  row_count     integer NOT NULL DEFAULT 0
);

-- ── Organisations ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.outreach_orgs (
  domain      text PRIMARY KEY,
  name        text,
  website     text,
  -- Derived from the TLD at import; corrected by research later.
  kind        text NOT NULL DEFAULT 'unknown'
              CHECK (kind IN ('government','edc_nonprofit','company','university','personal','unknown')),
  state       text,

  -- What Emma learned by reading their website. research_ok is the gate that
  -- matters: an email that claims to be personal but had nothing to personalise
  -- with is worse than sending nothing, so a failed or thin research pass must
  -- block the send rather than fall back to a generic template.
  research      jsonb,
  researched_at timestamptz,
  research_ok   boolean,

  -- Pacing. Never two colleagues at once.
  active_contact_id      bigint,
  last_sequence_ended_at timestamptz,
  colleague_cooldown_days integer NOT NULL DEFAULT 45,

  -- Set when anyone here subscribes. Cold outreach to colleagues stops.
  has_customer boolean NOT NULL DEFAULT false,

  do_not_contact boolean NOT NULL DEFAULT false,
  dnc_reason     text,
  created_at     timestamptz NOT NULL DEFAULT now()
);

-- ── Contacts ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.outreach_contacts (
  id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  email      text NOT NULL,
  first_name text,
  last_name  text,
  -- 'Dr. Jeff' -> 'Jeff'; 'Cindy L.' -> 'Cindy'. 39 rows in the first list
  -- needed this, and 16 have no usable first name at all - those get a
  -- greeting without a name rather than "Hi ,".
  first_name_clean text,
  domain     text NOT NULL REFERENCES public.outreach_orgs(domain) ON UPDATE CASCADE,

  status text NOT NULL DEFAULT 'new'
         CHECK (status IN ('new','queued','researching','drafted','approved',
                           'sending','in_sequence','done','replied','converted','suppressed')),
  suppressed_reason text,

  sequence_step   integer NOT NULL DEFAULT 0,
  last_touch_at   timestamptz,
  cooldown_until  timestamptz,
  attempt_round   integer NOT NULL DEFAULT 0,   -- how many full sequences they have had

  created_at timestamptz NOT NULL DEFAULT now()
);

-- One row per person, whatever they are spelled like and however many lists
-- they arrive on. This is what makes re-importing an overlapping list safe.
CREATE UNIQUE INDEX IF NOT EXISTS outreach_contacts_email_key
  ON public.outreach_contacts (lower(email));
CREATE INDEX IF NOT EXISTS outreach_contacts_domain_idx ON public.outreach_contacts (domain);
CREATE INDEX IF NOT EXISTS outreach_contacts_status_idx ON public.outreach_contacts (status);

ALTER TABLE public.outreach_orgs
  DROP CONSTRAINT IF EXISTS outreach_orgs_active_contact_fk;
ALTER TABLE public.outreach_orgs
  ADD CONSTRAINT outreach_orgs_active_contact_fk
  FOREIGN KEY (active_contact_id) REFERENCES public.outreach_contacts(id) ON DELETE SET NULL;

-- ── Membership ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.outreach_list_members (
  list_id    bigint NOT NULL REFERENCES public.outreach_lists(id) ON DELETE CASCADE,
  contact_id bigint NOT NULL REFERENCES public.outreach_contacts(id) ON DELETE CASCADE,
  added_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (list_id, contact_id)
);

-- ── Suppression ──────────────────────────────────────────────────────
-- Global and permanent, checked at SEND time rather than at queue time. A
-- person can unsubscribe between being queued and being sent to, and the queue
-- is the wrong place to make that decision.
CREATE TABLE IF NOT EXISTS public.outreach_suppression (
  email      text PRIMARY KEY,
  reason     text NOT NULL
             CHECK (reason IN ('unsubscribed','complained','bounced','replied_no',
                               'is_member','manual','role_address')),
  detail     text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ── The pacing rule, enforced by the database ────────────────────────
-- A trigger rather than application code: the rule that two colleagues are
-- never in flight at once is the one guarantee this system makes to Eric's
-- reputation, and it should not depend on every future caller remembering it.
CREATE OR REPLACE FUNCTION public.outreach_claim_org()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  held bigint;
  customer boolean;
  dnc boolean;
BEGIN
  IF NEW.status IN ('queued','researching','drafted','approved','sending','in_sequence')
     AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM NEW.status) THEN

    SELECT active_contact_id, has_customer, do_not_contact
      INTO held, customer, dnc
      FROM public.outreach_orgs WHERE domain = NEW.domain FOR UPDATE;

    IF dnc THEN
      RAISE EXCEPTION 'outreach: % is marked do-not-contact', NEW.domain;
    END IF;
    -- Somebody here already pays. Their colleagues are the customer's to
    -- introduce, not ours to cold-pitch.
    IF customer THEN
      RAISE EXCEPTION 'outreach: % already has a subscriber; ask them to invite colleagues', NEW.domain;
    END IF;
    IF held IS NOT NULL AND held <> NEW.id THEN
      RAISE EXCEPTION 'outreach: % already has contact % in flight', NEW.domain, held;
    END IF;

    UPDATE public.outreach_orgs SET active_contact_id = NEW.id WHERE domain = NEW.domain;

  ELSIF NEW.status IN ('done','replied','converted','suppressed')
        AND (TG_OP = 'UPDATE' AND OLD.status IS DISTINCT FROM NEW.status) THEN
    -- Release the organisation and start the colleague cooldown.
    UPDATE public.outreach_orgs
       SET active_contact_id = NULL,
           last_sequence_ended_at = now(),
           has_customer = (has_customer OR NEW.status = 'converted')
     WHERE domain = NEW.domain AND active_contact_id = NEW.id;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS outreach_claim_org_trg ON public.outreach_contacts;
CREATE TRIGGER outreach_claim_org_trg
  BEFORE INSERT OR UPDATE OF status ON public.outreach_contacts
  FOR EACH ROW EXECUTE FUNCTION public.outreach_claim_org();

-- ── Who may be approached right now ──────────────────────────────────
-- One view, so the queue builder, the admin screen and the dry run can never
-- disagree about who is eligible.
CREATE OR REPLACE VIEW public.outreach_eligible AS
SELECT c.*,
       o.kind, o.website, o.research_ok, o.last_sequence_ended_at,
       o.colleague_cooldown_days
  FROM public.outreach_contacts c
  JOIN public.outreach_orgs o ON o.domain = c.domain
 WHERE c.status = 'new'
   AND NOT o.do_not_contact
   AND NOT o.has_customer
   AND o.kind <> 'personal'                       -- nothing to research
   AND o.active_contact_id IS NULL                -- no colleague in flight
   AND (c.cooldown_until IS NULL OR c.cooldown_until < now())
   AND (o.last_sequence_ended_at IS NULL
        OR o.last_sequence_ended_at < now() - (o.colleague_cooldown_days || ' days')::interval)
   AND NOT EXISTS (SELECT 1 FROM public.outreach_suppression s
                    WHERE lower(s.email) = lower(c.email));

-- ── RLS: admin only, all of it ───────────────────────────────────────
ALTER TABLE public.outreach_lists        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.outreach_orgs         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.outreach_contacts     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.outreach_list_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.outreach_suppression  ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['outreach_lists','outreach_orgs','outreach_contacts',
                           'outreach_list_members','outreach_suppression']
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

-- ── The queue: one person per organisation, best first ───────────────
-- outreach_eligible answers "may this person be written to?" — every colleague
-- at a quiet organisation passes, because nobody is in flight yet. That is
-- correct but it is not a queue, and a caller that took the first 40 rows of it
-- would happily pick four people at the same EDC and only discover the problem
-- when the trigger refused the second one.
--
-- This picks exactly one contact per organisation, so the pacing rule is the
-- shape of the queue rather than an error the queue runs into.
CREATE OR REPLACE VIEW public.outreach_next_per_org AS
SELECT DISTINCT ON (e.domain)
       e.id, e.email, e.first_name_clean, e.domain, e.kind, e.website,
       e.research_ok, e.status
  FROM public.outreach_eligible e
 ORDER BY e.domain,
          -- Prefer somebody we can greet by name; an unnamed greeting is a
          -- worse first impression than waiting for a colleague who has one.
          (e.first_name_clean IS NULL),
          e.id;
