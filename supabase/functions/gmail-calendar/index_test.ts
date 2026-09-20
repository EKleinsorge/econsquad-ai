/* ============================================================
   WHAT THE OFFICE LISTS, AND WHAT IT MUST NOT

   !! THIS TEST DOES NOT ASSERT ON THE TEXT OF THE QUERY. Checking that
   the string contains "in:inbox" would have passed on any query that
   merely mentioned it, and this project has twice shipped a defect
   behind a test that asked whether a string appeared rather than
   whether the thing worked.

   So instead: a small model of how Gmail matches a search against a
   message's labels, and then real messages put through it. The
   question each case asks is the one that matters - "would this
   message appear in the office?" - not "is the query spelled the way I
   expected".

   !! AND THE MODEL IS A MODEL. It is not Gmail. It encodes the three
   rules this fix depends on and nothing more:
       in:X       the message carries label X
       -in:X      it does not
       is:read    / is:unread
   If a query ever needs syntax beyond that, the model has to grow with
   it or the test quietly stops covering the real thing. That is the
   standing risk of testing against a stand-in, and it is written here
   so nobody has to rediscover it.

   Run:  deno test --allow-all index_test.ts
   ============================================================ */

import { gmailListQuery } from './index.ts'

let passed = 0, failed = 0
function ok(name: string, cond: boolean) {
  if (cond) { passed++; console.log('  ok   ' + name) }
  else      { failed++; console.log('  FAIL ' + name) }
}

/* ---- the model ------------------------------------------------- */

type Msg = { name: string; labels: string[]; read: boolean }

function matches(query: string, m: Msg): boolean {
  // The query goes into a URL with '+' for spaces; undo that first.
  const terms = query.split('+').filter(Boolean)
  return terms.every((t) => {
    if (t.startsWith('-in:')) return !m.labels.includes(t.slice(4).toUpperCase())
    if (t.startsWith('in:'))  return  m.labels.includes(t.slice(3).toUpperCase())
    if (t === 'is:read')      return  m.read
    if (t === 'is:unread')    return !m.read
    if (t.startsWith('newer_than:')) return true   // every fixture is recent
    throw new Error('the model does not understand this term: ' + t)
  })
}

/* ---- the messages ---------------------------------------------- */
// Labels as Gmail applies them. The two that carry BOTH are the
// interesting ones and they are why this fix is `in:inbox` and not
// `-in:sent`.

const RECEIVED_READ:   Msg = { name: 'a DMARC report he has opened',
                               labels: ['INBOX'], read: true }
const RECEIVED_UNREAD: Msg = { name: 'a new email from a customer',
                               labels: ['INBOX'], read: false }
const HIS_REPLY:       Msg = { name: 'a reply HE sent',
                               labels: ['SENT'], read: true }
const SELF_TEST:       Msg = { name: 'an email he sent to himself',
                               labels: ['INBOX', 'SENT'], read: true }
const ARCHIVED:        Msg = { name: 'something he archived in the office',
                               labels: [], read: true }
const TRASHED:         Msg = { name: 'something he binned',
                               labels: ['TRASH'], read: true }
const DRAFT:           Msg = { name: 'his own half-written draft',
                               labels: ['DRAFT'], read: false }

const READ   = gmailListQuery('read', '30d')
const UNREAD = gmailListQuery('unread', '7d')
const SENT   = gmailListQuery('sent', '30d')

console.log('\nTHE READ LIST SHOWS MAIL THAT ARRIVED, AND ONLY THAT')
ok('a read email he received is listed',      matches(READ, RECEIVED_READ))
ok('!! HIS OWN SENT REPLY IS NOT LISTED',    !matches(READ, HIS_REPLY))
ok('an email he sent to himself IS listed',   matches(READ, SELF_TEST))
ok('archiving removes it from the list',     !matches(READ, ARCHIVED))
ok('a binned message is not listed',         !matches(READ, TRASHED))
ok('a draft of his own is not listed',       !matches(READ, DRAFT))
ok('an unread email is not in the read list',!matches(READ, RECEIVED_UNREAD))

console.log('\nTHE UNREAD LIST IS NEW MAIL, NOT HIS OWN WORK IN PROGRESS')
ok('a new customer email is listed',          matches(UNREAD, RECEIVED_UNREAD))
ok('!! A DRAFT IS NOT LISTED',               !matches(UNREAD, DRAFT))
ok('an archived unread message is not listed',
   !matches(UNREAD, { name: 'archived unread', labels: [], read: false }))
ok('a read email is not listed',             !matches(UNREAD, RECEIVED_READ))

console.log('\nTHE SENT LIST IS THE ONE PLACE HIS OWN MAIL BELONGS')
ok('his reply is listed',                     matches(SENT, HIS_REPLY))
ok('an email he sent to himself is listed',   matches(SENT, SELF_TEST))
ok('mail he only received is not listed',    !matches(SENT, RECEIVED_READ))

console.log('\nTHE DATE WINDOW')
ok('a period becomes newer_than',             READ.includes('newer_than:30d'))
ok('a different period is carried through',   UNREAD.includes('newer_than:7d'))
ok('no period means no date term',           !gmailListQuery('read', null).includes('newer_than'))
ok('null period still filters the inbox',     gmailListQuery('read', null).includes('in:inbox'))

console.log('\nIT GOES INTO A URL')
ok('no literal spaces in any query',
   [READ, UNREAD, SENT].every((q) => !q.includes(' ')))

/* ---- the failing direction ------------------------------------- */
// The point of the change, stated as the behaviour that used to be
// wrong. If these ever pass, the old query is back.

console.log('\nWHAT THE OLD QUERIES DID')
const OLD_READ   = 'is:read+-in:trash+newer_than:30d'
const OLD_UNREAD = 'is:unread+newer_than:7d'
ok('the old read query DID list his own sent reply',
   matches(OLD_READ, HIS_REPLY))
ok('the old read query DID survive archiving',
   matches(OLD_READ, ARCHIVED))
ok('the old unread query DID list a draft',
   matches(OLD_UNREAD, DRAFT))
ok('...and the new ones do none of those three',
   !matches(READ, HIS_REPLY) && !matches(READ, ARCHIVED) && !matches(UNREAD, DRAFT))

/* ---- the model itself must be able to fail --------------------- */
// A test harness that says yes to everything is worse than no harness.

console.log('\nTHE MODEL CAN SAY NO')
ok('in: can fail',    !matches('in:inbox', HIS_REPLY))
ok('-in: can fail',   !matches('-in:sent', HIS_REPLY))
ok('is:read can fail',!matches('is:read', RECEIVED_UNREAD))
let threw = false
try { matches('has:attachment', RECEIVED_READ) } catch (_e) { threw = true }
ok('an unmodelled term throws rather than passing silently', threw)

console.log('\n' + (passed + failed) + ' checks, ' + passed + ' passed, ' + failed + ' failed')
if (failed) { console.log('FAILED'); Deno.exit(1) }
