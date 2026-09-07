-- Economic Developers Verified — load 4 of 4.  Run IN ORDER, after 20260908_outreach.sql.
-- Safe to re-run: every statement ignores rows that already exist.
BEGIN;
INSERT INTO public.outreach_suppression (email, reason, detail) VALUES
  ('economicdevelopment@titusville.com','role_address','a shared inbox, not a person'),
  ('edc@jcacc.org','role_address','a shared inbox, not a person'),
  ('edc@hamiltontx.com','role_address','a shared inbox, not a person'),
  ('edc@newtown.org','role_address','a shared inbox, not a person'),
  ('edc@wolfforthtx.us','role_address','a shared inbox, not a person'),
  ('economicdevelopment@charlottenc.gov','role_address','a shared inbox, not a person'),
  ('edc@lyfordtx.us','role_address','a shared inbox, not a person'),
  ('ecodev@wrangell.com','role_address','a shared inbox, not a person'),
  ('edc@cityoflajoya.com','role_address','a shared inbox, not a person'),
  ('edc@cityofquanah.com','role_address','a shared inbox, not a person'),
  ('ecodev@englewoodco.gov','role_address','a shared inbox, not a person'),
  ('edc@cityofcolemantx.us','role_address','a shared inbox, not a person'),
  ('edc@hico-tx.com','role_address','a shared inbox, not a person'),
  ('economicdevelopment@pge.com','role_address','a shared inbox, not a person'),
  ('economicdevelopment@chaplinct.org','role_address','a shared inbox, not a person'),
  ('ecodevo@edwardscountyks.com','role_address','a shared inbox, not a person'),
  ('edc@wallingfordct.gov','role_address','a shared inbox, not a person'),
  ('economic.development@sanjoseca.gov','role_address','a shared inbox, not a person'),
  ('ecodev@ded.mo.gov','role_address','a shared inbox, not a person'),
  ('economic_development@meridiancity.org','role_address','a shared inbox, not a person')
ON CONFLICT (email) DO NOTHING;

INSERT INTO public.outreach_list_members (list_id, contact_id)
SELECT l.id, c.id FROM public.outreach_lists l, public.outreach_contacts c
WHERE l.name='Economic Developers Verified' ON CONFLICT DO NOTHING;

-- Never cold-pitch somebody who already pays you. profiles is in this same
-- database, so this is a join rather than a CSV you have to remember to export.
INSERT INTO public.outreach_suppression (email, reason, detail)
SELECT lower(p.email),'is_member','has an EconSquad account'
  FROM public.profiles p JOIN public.outreach_contacts c ON lower(c.email)=lower(p.email)
 WHERE p.email IS NOT NULL ON CONFLICT (email) DO NOTHING;

-- Any organisation where somebody already subscribed closes to cold outreach:
-- their colleagues are the customer's to introduce.
UPDATE public.outreach_orgs o SET has_customer=true
 WHERE EXISTS (SELECT 1 FROM public.profiles p WHERE p.email IS NOT NULL
                AND lower(split_part(p.email,'@',2))=o.domain);
COMMIT;

SELECT (SELECT count(*) FROM outreach_contacts)                AS contacts,
       (SELECT count(*) FROM outreach_orgs)                    AS organisations,
       (SELECT count(*) FROM outreach_suppression)             AS suppressed,
       (SELECT count(*) FROM outreach_orgs WHERE has_customer) AS orgs_with_a_customer,
       (SELECT count(*) FROM outreach_next_per_org)            AS ready_to_write_to;
