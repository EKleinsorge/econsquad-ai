-- supabase/migrations/20260909_esq_org_accept.sql
--
-- ═══════════════════════════════════════════════════════════════════════
--  ACCEPTING AN INVITATION, ATOMICALLY
-- ═══════════════════════════════════════════════════════════════════════
--
-- ⚠️ WHY THIS IS A DATABASE FUNCTION AND NOT TWO CALLS FROM THE EDGE FUNCTION
--
-- A pending invitation HOLDS A SEAT - that is what stops six seats being mailed
-- to twenty people. So accepting is two writes that must happen together:
--
--     mark the invitation accepted        (releases the seat it was holding)
--     insert the membership               (takes the seat properly)
--
-- In the other order, the cap counts the same person twice and the last seat on
-- a full plan cannot be accepted at all. In either order as two separate REST
-- calls, a failure between them either burns a seat forever or consumes the
-- invitation without granting anything - and the person is left holding a link
-- that now says "expired". PostgREST cannot wrap two calls in a transaction.
-- A function can, and does: if the membership insert trips the cap, the accept
-- rolls back with it and the link still works.
--
-- FOR UPDATE because two clicks on the same link, or a double-submitted form,
-- must not both get through.
--
-- Service role only. The person accepting has no account yet, and therefore no
-- session, so this cannot be gated by RLS - it is gated by nobody else being
-- able to execute it.

BEGIN;

DO $$
BEGIN
  IF to_regclass('public.esq_org_invites') IS NULL THEN
    RAISE EXCEPTION 'esq_org_invites does not exist. Run QUOTE-15 then QUOTE-17 first. Nothing has been changed.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_schema='public' AND table_name='esq_org_invites'
                    AND column_name='can_edit_profile') THEN
    RAISE EXCEPTION 'The permission columns are not there. Run QUOTE-17 first. Nothing has been changed.';
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.esq_org_accept_invite(
  p_token text,
  p_user  uuid,
  p_email text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
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
    -- Deliberately one answer for expired, revoked, already used and never
    -- existed. A link that says which is a link that can be probed.
    RETURN jsonb_build_object('ok', false, 'error', 'not_valid');
  END IF;

  -- The invitation belongs to an address, not to whoever holds the link.
  IF lower(i.email) IS DISTINCT FROM lower(coalesce(p_email,'')) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'wrong_email');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.esq_organizations
                  WHERE id = i.org_id AND status = 'active') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'org_inactive');
  END IF;

  -- Already seated: consume the invitation and say so, rather than failing on
  -- the one-live-seat index and looking broken.
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

  RETURN jsonb_build_object('ok', true, 'org_id', i.org_id, 'member_id', m_id);

EXCEPTION
  WHEN check_violation THEN
    -- The seat cap. Everything above is rolled back, so the link stays usable
    -- once somebody makes room.
    RETURN jsonb_build_object('ok', false, 'error', 'no_seats');
END $$;

-- Nobody but the service role. A signed-in customer must not be able to call
-- this with a token they found.
REVOKE ALL ON FUNCTION public.esq_org_accept_invite(text, uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.esq_org_accept_invite(text, uuid, text) FROM anon, authenticated;

COMMENT ON FUNCTION public.esq_org_accept_invite(text, uuid, text) IS
  'Accepts an invitation and grants the seat in one transaction, because a pending invite holds a seat and the two writes cannot be allowed to come apart. Service role only.';

COMMIT;
