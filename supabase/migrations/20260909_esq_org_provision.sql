-- supabase/migrations/20260909_esq_org_provision.sql
--
-- ═══════════════════════════════════════════════════════════════════════
--  TURNING A PAID QUOTE INTO A TEAM
-- ═══════════════════════════════════════════════════════════════════════
--
-- Until now the only team in existence was made by hand (TEAM-20). The real
-- path is: a quote is paid, and the buyer becomes the owner of an organisation
-- whose seats are the seats they actually bought.
--
-- Two things have to change in the schema before that can work.
--
-- ⚠️ 1. AN INVITATION MUST BE ABLE TO CARRY THE OWNER'S CHAIR.
--
-- The buyer usually has no account yet - they asked for a quote, they did not
-- sign up. So the owner arrives the same way everyone else does: a link, and a
-- password only they ever see. The role CHECK allowed only admin and member,
-- which would have forced somebody to create the owner's login for them, or to
-- promote them by hand afterwards and remember to.
--
-- The one-live-owner index still stands, so this cannot produce two owners.
--
-- ⚠️ 2. ONE QUOTE MUST NOT BE ABLE TO PRODUCE TWO TEAMS.
--
-- Provisioning is a button, and a button gets pressed twice - by a double
-- click, by a slow response, by somebody checking whether it worked. Two teams
-- from one payment means two sets of seats, two invitations to the same buyer,
-- and a support conversation about which one is real. The database refuses it.

BEGIN;

DO $$
BEGIN
  IF to_regclass('public.esq_org_invites') IS NULL THEN
    RAISE EXCEPTION 'The org tables are not there. Run QUOTE-15 and QUOTE-17 first. Nothing has been changed.';
  END IF;
END $$;

-- ── 1. Invitations may seat an owner ─────────────────────────────────
ALTER TABLE public.esq_org_invites DROP CONSTRAINT IF EXISTS esq_org_invites_role_check;
ALTER TABLE public.esq_org_invites
  ADD CONSTRAINT esq_org_invites_role_check
  CHECK (role IN ('owner','admin','member'));

COMMENT ON COLUMN public.esq_org_invites.role IS
  'owner is reachable only through provisioning: the buyer of a paid quote, who usually has no account yet. The one-live-owner index still prevents a second.';

-- ── 2. One team per quote ────────────────────────────────────────────
-- Partial, so the hand-made teams that have no quote behind them are unaffected.
CREATE UNIQUE INDEX IF NOT EXISTS esq_organizations_one_per_quote_idx
  ON public.esq_organizations (quote_request_id)
  WHERE quote_request_id IS NOT NULL;

-- ── 3. Where a team came from, in one place ──────────────────────────
-- So "has this quote been turned into a team yet" is one question with one
-- answer, rather than something the admin page has to work out by joining.
CREATE OR REPLACE VIEW public.esq_quote_teams AS
SELECT q.id                AS quote_id,
       q.organization      AS quoted_org,
       q.full_name         AS buyer_name,
       coalesce(q.quote_sent_to, q.email) AS buyer_email,
       q.quote_seats,
       q.quote_free_seats,
       q.status,
       q.paid_at,
       o.id                AS org_id,
       o.name              AS team_name,
       o.seats_paid,
       o.seats_free,
       o.status            AS team_status,
       o.term_start,
       o.term_end,
       (SELECT count(*) FROM public.esq_org_members m
         WHERE m.org_id = o.id AND m.revoked_at IS NULL)          AS seats_taken,
       (SELECT count(*) FROM public.esq_org_invites i
         WHERE i.org_id = o.id AND i.accepted_at IS NULL
           AND i.revoked_at IS NULL AND i.expires_at > now())     AS invites_pending
  FROM public.quote_requests q
  LEFT JOIN public.esq_organizations o ON o.quote_request_id = q.id;

ALTER VIEW public.esq_quote_teams SET (security_invoker = true);

REVOKE ALL ON public.esq_quote_teams FROM anon;
GRANT SELECT ON public.esq_quote_teams TO authenticated;

COMMENT ON VIEW public.esq_quote_teams IS
  'Every quote, with the team it produced if it produced one. security_invoker, so the quote_requests admin-only policy still decides who may read it.';

-- ── 4. ⚠️ A SECOND OWNER MUST FAIL POLITELY, NOT EXPLODE ─────────────
--
-- Found by testing it rather than by reading it. esq_org_accept_invite caught
-- check_violation (the seat cap) but nothing else, so accepting a second owner
-- invitation raised unique_violation straight out of the function: PostgREST
-- returns a 500, org-accept turns that into "accept_failed", and the person
-- holding the link is told nothing useful about a situation that is entirely
-- our doing.
--
-- The rollback was always correct - no half-granted seat, the link still
-- pending. Only the message was wrong. Now it comes back as an answer.

CREATE OR REPLACE FUNCTION public.esq_org_accept_invite(
  p_token text,
  p_user  uuid,
  p_email text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $fn$
DECLARE
  i    record;
  m_id bigint;
BEGIN
  IF p_user IS NULL OR coalesce(p_token,'') = '' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'bad_request');
  END IF;

  SELECT * INTO i
    FROM public.esq_org_invites
   WHERE token = p_token
     AND accepted_at IS NULL
     AND revoked_at  IS NULL
     AND expires_at  > now()
   FOR UPDATE;

  IF NOT FOUND THEN
    -- One answer for expired, revoked, already used and never existed. A link
    -- that says which is a link that can be probed.
    RETURN jsonb_build_object('ok', false, 'error', 'not_valid');
  END IF;

  IF lower(i.email) IS DISTINCT FROM lower(coalesce(p_email,'')) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'wrong_email');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.esq_organizations
                  WHERE id = i.org_id AND status = 'active') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'org_inactive');
  END IF;

  IF EXISTS (SELECT 1 FROM public.esq_org_members
              WHERE org_id = i.org_id AND user_id = p_user AND revoked_at IS NULL) THEN
    UPDATE public.esq_org_invites
       SET accepted_at = now(), accepted_by = p_user WHERE id = i.id;
    RETURN jsonb_build_object('ok', true, 'org_id', i.org_id, 'already_member', true);
  END IF;

  -- Accept first, seat second. Both inside this function, so both or neither.
  UPDATE public.esq_org_invites
     SET accepted_at = now(), accepted_by = p_user WHERE id = i.id;

  INSERT INTO public.esq_org_members
    (org_id, user_id, role, can_edit_profile, can_manage_seats, invited_by)
  VALUES
    (i.org_id, p_user, i.role, i.can_edit_profile, i.can_manage_seats, i.invited_by)
  RETURNING id INTO m_id;

  RETURN jsonb_build_object('ok', true, 'org_id', i.org_id, 'member_id', m_id,
                            'role', i.role);

EXCEPTION
  WHEN check_violation THEN
    -- The seat cap. Everything above rolls back, so the link stays usable once
    -- somebody makes room.
    RETURN jsonb_build_object('ok', false, 'error', 'no_seats');
  WHEN unique_violation THEN
    -- A team already has an owner, or the same person is being seated twice.
    RETURN jsonb_build_object('ok', false, 'error',
      CASE WHEN i.role = 'owner' THEN 'already_has_owner' ELSE 'seat_conflict' END);
END $fn$;

COMMIT;
