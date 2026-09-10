-- supabase/migrations/20260910_esq_admin_teams.sql
--
-- ═══════════════════════════════════════════════════════════════════════
--  WHAT THE ADMIN TEAMS PAGE NEEDS THAT IT CANNOT DO FROM THE BROWSER
-- ═══════════════════════════════════════════════════════════════════════
--
-- Two operations, and both are blocked for good reasons that do not apply to
-- a site admin.
--
-- ⚠️ 1. SEATS CANNOT BE CHANGED FROM A BROWSER SESSION AT ALL.
--
-- 20260909_esq_organizations.sql revoked UPDATE on esq_organizations and
-- granted it back on four columns only, so that an org owner could not open
-- seats they had not paid for. That is a COLUMN GRANT, and column grants apply
-- to the `authenticated` database role - which Eric is too, when he is signed
-- in to the admin page. The RLS site-admin policy does not help: policies pick
-- rows, grants pick columns, and the grant is checked first.
--
-- So selling somebody three more seats has to go through a definer function.
--
-- ⚠️ 2. OWNERSHIP CANNOT BE TRANSFERRED BY ANYONE, INCLUDING US.
--
-- The privilege guard requires the caller to be the owner, and the one-live-
-- owner index refuses a second - so demote-then-promote has no legal ordering
-- from outside. It has been an open hole since the guard was written. It only
-- matters the first time a director retires, and then it matters a great deal.
--
-- ⚠️ 3. AND A HOLE FOUND WHILE WRITING THIS.
--
-- The seat cap is a trigger on MEMBERS and INVITES. Nothing was watching
-- esq_organizations, so lowering seats_paid below the number of people already
-- seated was possible and silent: a team of six on a plan that now says four,
-- with no error anywhere and the cap only noticed the next time somebody tried
-- to invite. Now the organisation is guarded too.

BEGIN;

DO $$
BEGIN
  IF to_regclass('public.esq_organizations') IS NULL THEN
    RAISE EXCEPTION 'The org tables are not there. Run QUOTE-15 and QUOTE-17 first. Nothing has been changed.';
  END IF;
  -- The list view reports how much of each shared profile is filled in, so it
  -- needs TEAM-26. Say which step is missing rather than failing on a name.
  IF to_regclass('public.esq_org_profile_status') IS NULL THEN
    RAISE EXCEPTION 'esq_org_profile_status is missing. Run TEAM-26 first. Nothing has been changed.';
  END IF;
END $$;

-- ── 3. Seats may not be cut out from under the people using them ─────
CREATE OR REPLACE FUNCTION public.esq_org_seats_not_below_used()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE used integer; total integer;
BEGIN
  total := coalesce(NEW.seats_paid,0) + coalesce(NEW.seats_free,0);
  used  := public.esq_org_seats_used(NEW.id);
  IF used > total THEN
    RAISE EXCEPTION
      'That leaves % people on % seat%. Remove somebody first, or withdraw a pending invitation.',
      used, total, CASE WHEN total = 1 THEN '' ELSE 's' END
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS esq_organizations_seat_floor_trg ON public.esq_organizations;
CREATE CONSTRAINT TRIGGER esq_organizations_seat_floor_trg
  AFTER UPDATE OF seats_paid, seats_free ON public.esq_organizations
  DEFERRABLE INITIALLY IMMEDIATE
  FOR EACH ROW EXECUTE FUNCTION public.esq_org_seats_not_below_used();

-- ── 1. Changing a team, as a site admin ──────────────────────────────
-- NULL means "leave this one alone", so the page sends only what changed.
CREATE OR REPLACE FUNCTION public.esq_admin_org_update(
  p_org        bigint,
  p_name       text    DEFAULT NULL,
  p_seats_paid integer DEFAULT NULL,
  p_seats_free integer DEFAULT NULL,
  p_status     text    DEFAULT NULL,
  p_term_start date    DEFAULT NULL,
  p_term_end   date    DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE o record;
BEGIN
  -- ⚠️ The whole reason this function exists is that it runs as its owner.
  -- So the admin check is the only thing between it and anybody signed in.
  IF NOT public.is_current_user_admin() THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_admin');
  END IF;

  IF p_status IS NOT NULL AND p_status NOT IN ('active','suspended','cancelled') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'bad_status');
  END IF;
  IF (p_seats_paid IS NOT NULL AND p_seats_paid < 0)
     OR (p_seats_free IS NOT NULL AND p_seats_free < 0) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'negative_seats');
  END IF;

  UPDATE public.esq_organizations SET
    name       = coalesce(nullif(btrim(p_name),''), name),
    seats_paid = coalesce(p_seats_paid, seats_paid),
    seats_free = coalesce(p_seats_free, seats_free),
    status     = coalesce(p_status, status),
    term_start = coalesce(p_term_start, term_start),
    term_end   = coalesce(p_term_end, term_end),
    updated_at = now()
  WHERE id = p_org
  RETURNING * INTO o;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'no_such_team');
  END IF;

  RETURN jsonb_build_object('ok', true, 'org_id', o.id, 'name', o.name,
                            'seats_paid', o.seats_paid, 'seats_free', o.seats_free,
                            'status', o.status, 'term_end', o.term_end);
EXCEPTION
  WHEN check_violation THEN
    -- The seat floor above. Say what it said rather than "something failed".
    RETURN jsonb_build_object('ok', false, 'error', 'below_used', 'message', SQLERRM);
END $$;

-- ── 2. Handing a team to somebody else ───────────────────────────────
CREATE OR REPLACE FUNCTION public.esq_admin_transfer_owner(
  p_org      bigint,
  p_new_user uuid
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE old_owner uuid; n integer;
BEGIN
  IF NOT public.is_current_user_admin() THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_admin');
  END IF;

  -- The new owner must already hold a live seat. Transferring to somebody who
  -- is not on the team would either need a seat they may not have, or create
  -- an owner who cannot see the thing they own.
  SELECT count(*) INTO n FROM public.esq_org_members
   WHERE org_id = p_org AND user_id = p_new_user AND revoked_at IS NULL;
  IF n = 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_a_member');
  END IF;

  SELECT user_id INTO old_owner FROM public.esq_org_members
   WHERE org_id = p_org AND role = 'owner' AND revoked_at IS NULL;

  IF old_owner = p_new_user THEN
    RETURN jsonb_build_object('ok', true, 'unchanged', true);
  END IF;

  -- Demote first. The one-live-owner index is not deferrable, so there has to
  -- be a moment with no owner - which is fine inside one transaction and
  -- impossible across two REST calls. That is why this is a function.
  IF old_owner IS NOT NULL THEN
    UPDATE public.esq_org_members
       SET role = 'admin', can_edit_profile = true, can_manage_seats = true
     WHERE org_id = p_org AND user_id = old_owner AND revoked_at IS NULL;
  END IF;

  UPDATE public.esq_org_members
     SET role = 'owner', can_edit_profile = true, can_manage_seats = true
   WHERE org_id = p_org AND user_id = p_new_user AND revoked_at IS NULL;

  RETURN jsonb_build_object('ok', true, 'org_id', p_org,
                            'from', old_owner, 'to', p_new_user);
END $$;

-- Signed-in customers must not be able to call either of these. The admin
-- check inside is the real gate; this is the second lock on the same door.
REVOKE ALL ON FUNCTION public.esq_admin_org_update(bigint, text, integer, integer, text, date, date) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.esq_admin_transfer_owner(bigint, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.esq_admin_org_update(bigint, text, integer, integer, text, date, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.esq_admin_transfer_owner(bigint, uuid) TO authenticated;

-- ── What the page lists ──────────────────────────────────────────────
CREATE OR REPLACE VIEW public.esq_admin_teams AS
SELECT o.id,
       o.name,
       o.status,
       o.plan_tier,
       o.seats_paid,
       o.seats_free,
       (coalesce(o.seats_paid,0) + coalesce(o.seats_free,0)) AS seats_total,
       public.esq_org_seats_used(o.id) AS seats_used,
       o.term_start,
       o.term_end,
       (o.term_end IS NOT NULL AND o.term_end <= (current_date + 60)) AS renewal_soon,
       o.quote_request_id,
       q.organization AS quoted_org,
       q.quote_total,
       q.paid_at,
       (SELECT p.email FROM public.esq_org_members m
          LEFT JOIN public.profiles p ON p.id = m.user_id
         WHERE m.org_id = o.id AND m.role = 'owner' AND m.revoked_at IS NULL
         LIMIT 1) AS owner_email,
       (SELECT count(*) FROM public.esq_org_members m
         WHERE m.org_id = o.id AND m.revoked_at IS NULL) AS members,
       (SELECT count(*) FROM public.esq_org_invites i
         WHERE i.org_id = o.id AND i.accepted_at IS NULL
           AND i.revoked_at IS NULL AND i.expires_at > now()) AS invites_pending,
       coalesce((SELECT s.filled FROM public.esq_org_profile_status s WHERE s.org_id = o.id), 0) AS profile_filled,
       o.created_at
  FROM public.esq_organizations o
  LEFT JOIN public.quote_requests q ON q.id = o.quote_request_id;

ALTER VIEW public.esq_admin_teams SET (security_invoker = true);
REVOKE ALL ON public.esq_admin_teams FROM anon;
GRANT SELECT ON public.esq_admin_teams TO authenticated;

COMMENT ON VIEW public.esq_admin_teams IS
  'One row per team for the admin page. security_invoker, so the site-admin policy on esq_organizations is what decides who may read it - an ordinary customer sees only their own team here, not everybody''s.';

COMMIT;
