-- supabase/migrations/20260908_tracking_links.sql
--
-- ═══════════════════════════════════════════════════════════════════════
--  UNIQUE TRACKING LINKS — down to the individual, not just the channel
-- ═══════════════════════════════════════════════════════════════════════
--
-- WHY NOT A LINK SHORTENER
--
-- The obvious build is esq.link/a7f3 redirecting to the site. Three reasons not
-- to: a shortener domain in a cold email is a well-known spam signal and this
-- whole programme depends on inboxing; the redirect is a hop that can fail or
-- be slow; and it needs infrastructure that does not exist, since econsquad.ai
-- is a static site on GitHub Pages with no server to redirect from.
--
-- Instead the link goes straight to econsquad.ai carrying an opaque token:
--
--   https://econsquad.ai/?utm_source=outreach&utm_campaign=ed-list&k=7f3a9c2e
--
-- No hop, no new domain, no deliverability cost. The page already captures the
-- utm_* parameters; `k` adds which PERSON, and that is what turns "outreach
-- produced 6 customers" into "these six, from these six organisations".
--
-- ⚠️ A CLICK IS NOT ALWAYS A PERSON
--
-- Corporate mail security (Proofpoint, Mimecast, Defender) and Gmail's own
-- prefetching open every link in a message before it reaches the inbox, from a
-- datacentre, within seconds of sending. Treating those as interest would
-- inflate click rates enormously and, worse, would make Emma think somebody was
-- engaged when nobody had read a word. So the first click within a short window
-- of the send is recorded but flagged, and the engine reads only human_click.

BEGIN;

-- ── The token that identifies one person in one email ────────────────
-- Opaque and random, never the email address or the row id: these tokens end
-- up in forwarded messages, browser history and corporate proxy logs.
ALTER TABLE public.outreach_contacts
  ADD COLUMN IF NOT EXISTS link_token text;

UPDATE public.outreach_contacts
   SET link_token = substr(replace(gen_random_uuid()::text, '-', ''), 1, 12)
 WHERE link_token IS NULL;

ALTER TABLE public.outreach_contacts ALTER COLUMN link_token SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS outreach_contacts_token_idx
  ON public.outreach_contacts (link_token);

-- New contacts get one automatically, so no import can create a contact that
-- cannot be tracked.
CREATE OR REPLACE FUNCTION public.outreach_new_token()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.link_token IS NULL THEN
    NEW.link_token := substr(replace(gen_random_uuid()::text, '-', ''), 1, 12);
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS outreach_new_token_trg ON public.outreach_contacts;
CREATE TRIGGER outreach_new_token_trg BEFORE INSERT ON public.outreach_contacts
  FOR EACH ROW EXECUTE FUNCTION public.outreach_new_token();

-- ── Clicks ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.outreach_clicks (
  id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  contact_id bigint REFERENCES public.outreach_contacts(id) ON DELETE CASCADE,
  token      text NOT NULL,
  landing    text,
  referrer   text,
  -- No IP address is stored. It would add nothing here that the contact row
  -- does not already say, and it is the one field that turns a click log into
  -- something that needs a retention policy.
  user_agent text,
  -- false = arrived within the scanner window, or from something that
  -- identifies itself as a bot. Recorded, never counted as interest.
  human_click boolean NOT NULL DEFAULT true,
  clicked_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS outreach_clicks_contact_idx ON public.outreach_clicks (contact_id);
CREATE INDEX IF NOT EXISTS outreach_clicks_at_idx      ON public.outreach_clicks (clicked_at DESC);

-- ── Which outreach contact became this customer ──────────────────────
-- The link that makes return on outreach a real number rather than a
-- correlation: this signup is THAT person, from THAT organisation, who got
-- THAT email.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS acq_contact_id bigint;

COMMENT ON COLUMN public.profiles.acq_contact_id IS
  'The outreach contact whose tracking link brought this person in. Set once, at signup, and never overwritten.';

-- The browser knows only the token. It must NOT be able to look up who that is:
-- resolving a token to a person is exactly the enumeration that track-click
-- refuses to do. So the page writes the token it was given, and the database
-- resolves the identity with a trigger — outreach_contacts never becomes
-- readable by an ordinary signed-in user.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS acq_link_token text;

CREATE OR REPLACE FUNCTION public.resolve_acq_contact()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.acq_link_token IS NOT NULL AND NEW.acq_contact_id IS NULL THEN
    SELECT id INTO NEW.acq_contact_id
      FROM public.outreach_contacts
     WHERE link_token = lower(NEW.acq_link_token);
    -- An unrecognised token is simply not resolved. It is left on the row
    -- rather than cleared, because a token that matches nothing is worth
    -- being able to see rather than silently discarding.
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS resolve_acq_contact_trg ON public.profiles;
CREATE TRIGGER resolve_acq_contact_trg
  BEFORE INSERT OR UPDATE OF acq_link_token ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.resolve_acq_contact();

-- ── Reusable tagged links for everything that is not Emma ────────────
-- Google Ads, LinkedIn, a conference QR code, a signature link. Built here so
-- the tagging is consistent: a campaign typed by hand as "Sept-Ads" one day and
-- "sept_ads" the next becomes two channels that never add up.
CREATE TABLE IF NOT EXISTS public.tracking_links (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  label       text NOT NULL,
  destination text NOT NULL DEFAULT 'https://econsquad.ai/',
  source      text NOT NULL,
  medium      text NOT NULL,
  campaign    text,
  content     text,
  term        text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (source, medium, campaign, content, term)
);

-- ── What each outreach contact actually did ──────────────────────────
CREATE OR REPLACE VIEW public.outreach_engagement AS
SELECT c.id, c.email, c.first_name_clean, c.domain, c.status, c.link_token,
       count(k.id) FILTER (WHERE k.human_click)                    AS clicks,
       count(k.id) FILTER (WHERE NOT k.human_click)                AS scanner_hits,
       min(k.clicked_at) FILTER (WHERE k.human_click)              AS first_clicked_at,
       (SELECT count(*) FROM public.profiles p WHERE p.acq_contact_id = c.id) AS signed_up
  FROM public.outreach_contacts c
  LEFT JOIN public.outreach_clicks k ON k.contact_id = c.id
 GROUP BY c.id, c.email, c.first_name_clean, c.domain, c.status, c.link_token;

ALTER TABLE public.outreach_clicks  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tracking_links   ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['outreach_clicks','tracking_links'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I_admin ON public.%I', t, t);
    EXECUTE format('CREATE POLICY %I_admin ON public.%I FOR ALL '
                   'USING (public.is_current_user_admin()) '
                   'WITH CHECK (public.is_current_user_admin())', t, t);
    EXECUTE format('REVOKE ALL ON public.%I FROM anon', t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', t);
  END LOOP;
END $$;

COMMIT;
