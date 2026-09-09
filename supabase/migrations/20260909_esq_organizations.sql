-- supabase/migrations/20260909_esq_organizations.sql
--
-- ═══════════════════════════════════════════════════════════════════════
--  ECONSQUAD ORGANISATIONS AND SEATS
-- ═══════════════════════════════════════════════════════════════════════
--
-- ⚠️ THIS DATABASE IS SHARED WITH ANOTHER BUSINESS. PREFIX EVERYTHING.
--
-- The first version of this file used the name public.organizations. That table
-- already exists, belongs to the other business on this Supabase project, has a
-- live row, its own admin_roles_* policies, and foreign keys from more than a
-- dozen tables.
--
-- CREATE TABLE IF NOT EXISTS quietly skipped, and the migration would have gone
-- on to run, against THEIR table:
--
--     REVOKE UPDATE ON public.organizations FROM authenticated;
--     GRANT UPDATE (name, term_start, term_end, updated_at) ... TO authenticated;
--
-- which would have stripped their application's ability to update almost every
-- column of its own core table. It failed before reaching that only because an
-- index hit a column their table does not have. That was luck, not safety.
--
-- So: every object here is prefixed esq_, and the guard below REFUSES TO RUN if
-- any name is already taken by something that is not ours. A migration in a
-- shared database should fail loudly rather than succeed ambiguously.

BEGIN;

-- ── Refuse to collide ────────────────────────────────────────────────
DO $$
DECLARE clash text;
BEGIN
  SELECT string_agg(t, ', ') INTO clash
    FROM unnest(ARRAY['esq_organizations','esq_org_members','esq_org_invites']) AS t
   WHERE EXISTS (
     SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = t
   )
     -- Ours are recognisable by a column no other table here would have.
     AND NOT EXISTS (
       SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = t
          AND column_name IN ('seats_paid','org_id','token')
     );
  IF clash IS NOT NULL THEN
    RAISE EXCEPTION
      'Refusing to run: % already exists and does not look like ours. Nothing has been changed.', clash;
  END IF;
END $$;

-- ── The organisation ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.esq_organizations (
  id                bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name              text NOT NULL,

  -- Where the seats came from, so "how many are they allowed" always traces
  -- back to a real payment.
  quote_request_id  bigint REFERENCES public.quote_requests(id) ON DELETE SET NULL,

  -- ⚠️ The allowance, opened by what they paid for. seats_free is the included
  -- 6th; both count towards the cap, because a customer counts named users
  -- rather than line items.
  seats_paid        integer NOT NULL DEFAULT 0 CHECK (seats_paid >= 0 AND seats_paid <= 5000),
  seats_free        integer NOT NULL DEFAULT 0 CHECK (seats_free >= 0 AND seats_free <= 5000),

  plan_tier         text NOT NULL DEFAULT 'pro' CHECK (plan_tier IN ('starter','pro')),
  term_start        date,
  term_end          date,

  status            text NOT NULL DEFAULT 'active'
                    CHECK (status IN ('active','suspended','cancelled')),
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS esq_organizations_quote_idx ON public.esq_organizations (quote_request_id);

COMMENT ON TABLE public.esq_organizations IS
  'EconSquad Team-plan organisations. Deliberately NOT public.organizations, which belongs to the other business sharing this project.';

-- ── Who holds a seat ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.esq_org_members (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  org_id      bigint NOT NULL REFERENCES public.esq_organizations(id) ON DELETE CASCADE,
  user_id     uuid NOT NULL,

  -- owner  : the buyer.
  -- admin  : can invite and revoke. The "special class", scoped to THIS
  --          organisation and no further - it is not public.admins, which
  --          opens every customer record in the product.
  -- member : holds a seat, manages nobody.
  role        text NOT NULL DEFAULT 'member' CHECK (role IN ('owner','admin','member')),

  invited_by  uuid,
  granted_at  timestamptz NOT NULL DEFAULT now(),

  -- Removal is revocation, never deletion. The account belongs to the person;
  -- the seat belongs to the organisation.
  revoked_at  timestamptz,
  revoked_by  uuid
);

CREATE UNIQUE INDEX IF NOT EXISTS esq_org_members_live_idx
  ON public.esq_org_members (org_id, user_id) WHERE revoked_at IS NULL;
CREATE INDEX IF NOT EXISTS esq_org_members_user_idx
  ON public.esq_org_members (user_id) WHERE revoked_at IS NULL;

-- ── Invitations ──────────────────────────────────────────────────────
-- ⚠️ A PENDING INVITE HOLDS A SEAT, or six seats could be mailed to twenty
-- people and whoever clicked first would win.
CREATE TABLE IF NOT EXISTS public.esq_org_invites (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  org_id      bigint NOT NULL REFERENCES public.esq_organizations(id) ON DELETE CASCADE,

  email       text NOT NULL,
  first_name  text,
  last_name   text,
  role        text NOT NULL DEFAULT 'member' CHECK (role IN ('admin','member')),

  -- Opaque, and the only thing that travels. These end up in forwarded mail and
  -- corporate proxy logs, so never the address and never the row id.
  token       text NOT NULL,

  invited_by  uuid,
  created_at  timestamptz NOT NULL DEFAULT now(),
  expires_at  timestamptz NOT NULL DEFAULT (now() + interval '14 days'),
  accepted_at timestamptz,
  accepted_by uuid,
  revoked_at  timestamptz
);

CREATE UNIQUE INDEX IF NOT EXISTS esq_org_invites_token_idx ON public.esq_org_invites (token);
CREATE UNIQUE INDEX IF NOT EXISTS esq_org_invites_live_idx
  ON public.esq_org_invites (org_id, lower(email))
  WHERE accepted_at IS NULL AND revoked_at IS NULL;

CREATE OR REPLACE FUNCTION public.esq_org_invite_token()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.token IS NULL OR NEW.token = '' THEN
    -- gen_random_uuid is core. gen_random_bytes is pgcrypto, which lives in the
    -- extensions schema and will not resolve unqualified.
    NEW.token := replace(gen_random_uuid()::text, '-', '') ||
                 substr(replace(gen_random_uuid()::text, '-', ''), 1, 8);
  END IF;
  NEW.email := lower(trim(NEW.email));
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS esq_org_invite_token_trg ON public.esq_org_invites;
CREATE TRIGGER esq_org_invite_token_trg BEFORE INSERT ON public.esq_org_invites
  FOR EACH ROW EXECUTE FUNCTION public.esq_org_invite_token();

-- ── Seat accounting ──────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.esq_org_seats_used(p_org bigint)
RETURNS integer LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT (SELECT count(*) FROM public.esq_org_members
           WHERE org_id = p_org AND revoked_at IS NULL)
       + (SELECT count(*) FROM public.esq_org_invites
           WHERE org_id = p_org AND accepted_at IS NULL AND revoked_at IS NULL
             AND expires_at > now())
$$;

CREATE OR REPLACE FUNCTION public.esq_org_seats_total(p_org bigint)
RETURNS integer LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT coalesce(seats_paid, 0) + coalesce(seats_free, 0)
    FROM public.esq_organizations WHERE id = p_org
$$;

-- ⚠️ Enforced in the DATABASE. A seat cap that lives only in the page is a cap
-- a second browser tab walks straight past.
CREATE OR REPLACE FUNCTION public.esq_org_enforce_seat_cap()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE used integer; total integer;
BEGIN
  total := public.esq_org_seats_total(NEW.org_id);
  used  := public.esq_org_seats_used(NEW.org_id);
  IF used > total THEN
    RAISE EXCEPTION 'That would use % of % seats. Revoke a seat or add more to the plan.', used, total
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;

-- AFTER, so the new row is already counted. A BEFORE trigger compares against
-- the state before the insert and always allows one too many.
DROP TRIGGER IF EXISTS esq_org_members_cap_trg ON public.esq_org_members;
CREATE CONSTRAINT TRIGGER esq_org_members_cap_trg
  AFTER INSERT OR UPDATE OF revoked_at, org_id ON public.esq_org_members
  DEFERRABLE INITIALLY IMMEDIATE
  FOR EACH ROW EXECUTE FUNCTION public.esq_org_enforce_seat_cap();

DROP TRIGGER IF EXISTS esq_org_invites_cap_trg ON public.esq_org_invites;
CREATE CONSTRAINT TRIGGER esq_org_invites_cap_trg
  AFTER INSERT OR UPDATE OF accepted_at, revoked_at, org_id ON public.esq_org_invites
  DEFERRABLE INITIALLY IMMEDIATE
  FOR EACH ROW EXECUTE FUNCTION public.esq_org_enforce_seat_cap();

-- ── Who am I, in org terms ───────────────────────────────────────────
-- SECURITY DEFINER on purpose: a policy on esq_org_members that itself queries
-- esq_org_members recurses forever.
CREATE OR REPLACE FUNCTION public.esq_my_org_ids()
RETURNS SETOF bigint LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT org_id FROM public.esq_org_members
   WHERE user_id = auth.uid() AND revoked_at IS NULL
$$;

CREATE OR REPLACE FUNCTION public.esq_is_org_admin(p_org bigint)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.esq_org_members
     WHERE org_id = p_org AND user_id = auth.uid()
       AND revoked_at IS NULL AND role IN ('owner','admin')
  )
$$;

-- ── ⚠️ Entitlement, derived and never written ────────────────────────
-- A seat must never overwrite profiles.plan. Somebody who pays for Pro and is
-- also given a seat keeps their own subscription, and revoking the seat must
-- never look like cancelling it.
CREATE OR REPLACE VIEW public.esq_user_entitlement AS
SELECT p.id AS user_id,
       p.email,
       p.plan      AS personal_plan,
       p.plan_tier AS personal_tier,
       o.id        AS org_id,
       o.name      AS org_name,
       m.role      AS org_role,
       (m.id IS NOT NULL AND o.status = 'active') AS has_org_seat,
       CASE WHEN m.id IS NOT NULL AND o.status = 'active'
            THEN o.plan_tier ELSE p.plan_tier END AS effective_tier,
       (m.id IS NOT NULL AND o.status = 'active'
        AND coalesce(p.subscription_status,'') NOT IN ('active','trialing','past_due')) AS covered_by_org
  FROM public.profiles p
  LEFT JOIN public.esq_org_members m ON m.user_id = p.id AND m.revoked_at IS NULL
  LEFT JOIN public.esq_organizations o ON o.id = m.org_id;

ALTER VIEW public.esq_user_entitlement SET (security_invoker = true);

-- ── Access ───────────────────────────────────────────────────────────
ALTER TABLE public.esq_organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.esq_org_members   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.esq_org_invites   ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS esq_organizations_site_admin ON public.esq_organizations;
CREATE POLICY esq_organizations_site_admin ON public.esq_organizations FOR ALL
  USING (public.is_current_user_admin()) WITH CHECK (public.is_current_user_admin());

DROP POLICY IF EXISTS esq_organizations_read ON public.esq_organizations;
CREATE POLICY esq_organizations_read ON public.esq_organizations FOR SELECT
  USING (id IN (SELECT public.esq_my_org_ids()));

DROP POLICY IF EXISTS esq_organizations_admin_update ON public.esq_organizations;
CREATE POLICY esq_organizations_admin_update ON public.esq_organizations FOR UPDATE
  USING (public.esq_is_org_admin(id)) WITH CHECK (public.esq_is_org_admin(id));

DROP POLICY IF EXISTS esq_org_members_site_admin ON public.esq_org_members;
CREATE POLICY esq_org_members_site_admin ON public.esq_org_members FOR ALL
  USING (public.is_current_user_admin()) WITH CHECK (public.is_current_user_admin());

DROP POLICY IF EXISTS esq_org_members_read ON public.esq_org_members;
CREATE POLICY esq_org_members_read ON public.esq_org_members FOR SELECT
  USING (org_id IN (SELECT public.esq_my_org_ids()));

DROP POLICY IF EXISTS esq_org_members_manage ON public.esq_org_members;
CREATE POLICY esq_org_members_manage ON public.esq_org_members FOR ALL
  USING (public.esq_is_org_admin(org_id)) WITH CHECK (public.esq_is_org_admin(org_id));

DROP POLICY IF EXISTS esq_org_invites_site_admin ON public.esq_org_invites;
CREATE POLICY esq_org_invites_site_admin ON public.esq_org_invites FOR ALL
  USING (public.is_current_user_admin()) WITH CHECK (public.is_current_user_admin());

DROP POLICY IF EXISTS esq_org_invites_manage ON public.esq_org_invites;
CREATE POLICY esq_org_invites_manage ON public.esq_org_invites FOR ALL
  USING (public.esq_is_org_admin(org_id)) WITH CHECK (public.esq_is_org_admin(org_id));

-- Nothing for anon. Accepting an invite runs through an edge function with the
-- service role, because the person accepting has no account and so no session.
REVOKE ALL ON public.esq_organizations, public.esq_org_members, public.esq_org_invites FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE
  ON public.esq_organizations, public.esq_org_members, public.esq_org_invites TO authenticated;
GRANT SELECT ON public.esq_user_entitlement TO authenticated;
REVOKE ALL ON public.esq_user_entitlement FROM anon;

-- ⚠️ RLS gates rows, not columns. Without this, the update policy above would
-- let an owner set seats_paid = 500 on their own organisation.
REVOKE UPDATE ON public.esq_organizations FROM authenticated;
GRANT UPDATE (name, term_start, term_end, updated_at) ON public.esq_organizations TO authenticated;

-- ── Work done on a seat belongs to the organisation ──────────────────
-- The Team card promises "the knowledge staying put when people move on". The
-- column exists so history can carry it; populating it at write time is the
-- next step, and until then the promise is only half kept.
ALTER TABLE public.task_history
  ADD COLUMN IF NOT EXISTS esq_org_id bigint REFERENCES public.esq_organizations(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS task_history_esq_org_idx ON public.task_history (esq_org_id);

COMMENT ON COLUMN public.task_history.esq_org_id IS
  'The EconSquad organisation whose seat this work was done on. Set at creation and never cleared when a seat is revoked - that is what keeps the work with the organisation rather than the person.';

COMMIT;
