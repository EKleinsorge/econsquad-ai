#!/usr/bin/env python3
"""Turn a raw contact CSV into the outreach tables.

Takes: id, created_at, first_name, last_name, email, unsubscribed
(extra columns are ignored; missing optional ones are fine)

Does the four things that have to happen before anybody is written to:

  1. NAME HYGIENE. "Dr. Jeff" -> "Jeff". "Cindy L." -> "Cindy". A blank stays
     blank and the greeting drops the name rather than writing "Hi ,".
  2. ORGANISATION FROM DOMAIN. The list has no company column, but
     bloomingtonedc.com IS the organisation and IS the website. Free-mail
     domains are marked 'personal' - there is nothing there to research, and a
     personalised email with no personalisation is worse than none.
  3. ROLE ADDRESSES OUT. info@, contact@, economicdevelopment@ are inboxes, not
     people. "Hi Info," is the single most obvious tell that a human did not
     write the message.
  4. DEDUPE AND SUPPRESS. One row per person across every list ever imported.
     Anyone already a member, or already unsubscribed, goes to suppression
     rather than being quietly dropped - so the reason survives.
"""
import csv, re, sys, json, collections

FREE = {
    'gmail.com','yahoo.com','hotmail.com','aol.com','outlook.com','icloud.com',
    'comcast.net','msn.com','me.com','live.com','sbcglobal.net','att.net',
    'verizon.net','bellsouth.net','cox.net','earthlink.net','protonmail.com',
    'ymail.com','mac.com','charter.net','roadrunner.com','windstream.net',
}
# An inbox rather than a person. Anything before the @ that is a job or a
# department rather than a name.
ROLE = {
    'info','contact','admin','office','mail','email','hello','team','staff',
    'economicdevelopment','ecodevo','ecodev','edc','development','planning',
    'chamber','clerk','mayor','manager','support','help','general','inquiries',
    'enquiries','webmaster','postmaster','noreply','no-reply','director',
    'frontdesk','reception','main','contactus','information',
}
TITLES = r'^(dr|mr|mrs|ms|miss|hon|honorable|rev|prof|sir|madam)\.?\s+'

def clean_first(name: str) -> str:
    n = (name or '').strip()
    if not n:
        return ''
    n = re.sub(TITLES, '', n, flags=re.I)          # Dr. Jeff -> Jeff
    n = re.sub(r'\s+[A-Za-z]\.?$', '', n)          # Cindy L. -> Cindy
    n = re.sub(r'["\'`]', '', n)
    n = re.sub(r'\s{2,}', ' ', n).strip(' .,')
    # Initials only — "R.T.", "A.B." — are not a name you can greet.
    #
    # The first version of this test was `(?:[A-Za-z]\.?){1,3}` with the dots
    # optional, which also matched Ann, Bob, Sue, Tim, Joe, Kim and every other
    # three-letter first name: 423 people lost their name instead of the 16 who
    # genuinely have none. Requiring the dots is what distinguishes initials
    # from a short name.
    if len(n) < 2 or re.fullmatch(r'(?:[A-Za-z]\.){1,3}[A-Za-z]?\.?', n):
        return ''
    return n

def kind_of(domain: str) -> str:
    d = domain.lower()
    if d in FREE:                       return 'personal'
    if d.endswith('.gov') or d.endswith('.us'): return 'government'
    if d.endswith('.edu'):              return 'university'
    if d.endswith('.org'):              return 'edc_nonprofit'
    return 'company'

def main(path, list_name, members_path=None):
    members = set()
    if members_path:
        members = {l.strip().lower() for l in open(members_path) if l.strip()}

    rows = list(csv.DictReader(open(path, encoding='utf-8-sig')))
    contacts, orgs, suppress = {}, {}, []
    stats = collections.Counter()

    for r in rows:
        email = (r.get('email') or '').strip().lower()
        stats['read'] += 1
        if not re.match(r'^[^@\s]+@[^@\s]+\.[a-z]{2,}$', email):
            stats['dropped_malformed'] += 1
            continue
        local, domain = email.split('@', 1)

        if email in contacts:
            stats['duplicate_in_file'] += 1
            continue

        if str(r.get('unsubscribed','')).lower() in ('true','t','1','yes'):
            suppress.append((email, 'unsubscribed', 'flagged in the source list'))
            stats['suppressed_unsubscribed'] += 1
            continue
        if email in members:
            suppress.append((email, 'is_member', 'already has an EconSquad account'))
            stats['suppressed_member'] += 1
            continue
        if re.sub(r'[^a-z]', '', local) in ROLE:
            suppress.append((email, 'role_address', 'a shared inbox, not a person'))
            stats['suppressed_role'] += 1
            continue

        k = kind_of(domain)
        if domain not in orgs:
            orgs[domain] = {
                'domain': domain, 'kind': k,
                'website': None if k == 'personal' else 'https://' + domain,
            }
        fn = clean_first(r.get('first_name'))
        if not fn: stats['no_usable_first_name'] += 1
        if fn != (r.get('first_name') or '').strip(): stats['name_cleaned'] += 1

        contacts[email] = {
            'email': email, 'first_name': (r.get('first_name') or '').strip() or None,
            'last_name': (r.get('last_name') or '').strip() or None,
            'first_name_clean': fn or None, 'domain': domain,
        }
        stats['imported'] += 1

    per_org = collections.Counter(c['domain'] for c in contacts.values())
    real_orgs = [d for d, o in orgs.items() if o['kind'] != 'personal']

    print("── %s ─────────────────────────────" % list_name)
    for k in ('read','imported','duplicate_in_file','dropped_malformed',
              'suppressed_unsubscribed','suppressed_member','suppressed_role',
              'name_cleaned','no_usable_first_name'):
        if stats[k]: print("  %-26s %5d" % (k.replace('_',' '), stats[k]))
    print("  %-26s %5d" % ('organisations', len(orgs)))
    print("  %-26s %5d" % ('  of those, contactable', len(real_orgs)))
    print("\n  by organisation type:")
    for k, c in collections.Counter(o['kind'] for o in orgs.values()).most_common():
        print("     %-16s %5d orgs" % (k, c))
    print("\n  FIRST TOUCHES AVAILABLE (one person per organisation): %d" % len(real_orgs))
    print("  colleagues held behind them, for later rounds:          %d"
          % (stats['imported'] - len(real_orgs)))
    return contacts, orgs, suppress, stats

if __name__ == '__main__':
    c, o, s, st = main(sys.argv[1], sys.argv[2] if len(sys.argv) > 2 else 'list',
                       sys.argv[3] if len(sys.argv) > 3 else None)
    json.dump({'contacts': list(c.values()), 'orgs': list(o.values()),
               'suppress': s}, open('import.json', 'w'))
    print("\n  -> import.json written (%d contacts, %d orgs, %d suppressions)"
          % (len(c), len(o), len(s)))
