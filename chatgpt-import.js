/* ═══════════════════════════════════════════════════════════════════
   READING A ChatGPT EXPORT, IN THE BROWSER, WITHOUT SENDING IT ANYWHERE
   ═══════════════════════════════════════════════════════════════════

   Eric's customers say they have "built intel into" their ChatGPT. This
   turns that into the file cabinet every specialist already reads.

   ⚠️ THE ZIP IS NEVER UPLOADED. NOT ONCE, NOT ANY PART OF IT.

   A ChatGPT export is the person's entire history with the product -
   their health, their money, their family, their job hunt. EconSquad is
   sold to people whose own work is confidential, on the argument that
   consumer ChatGPT is the wrong place for a prospect's name. Quietly
   hoovering up their whole chat history to fill in a form would be the
   exact hypocrisy that pitch is built against, and it would be the kind
   of thing that ends a company.

   So: the zip is opened here, in their browser. Everything below
   selects a few thousand characters out of what may be tens of
   megabytes, and the caller SHOWS THE PERSON THAT DIGEST before
   anything is sent. Nothing else ever leaves the machine.

   Everything in this file is pure - no network, no DOM, no storage - so
   it can be run in node by tools/test_chatgpt_zip.js and in the page by
   the import panel, and both get the same answers.
   ═══════════════════════════════════════════════════════════════════ */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.ESQImport = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /* What we are looking for. An economic developer's useful messages are
     about their organisation, their region, and the documents they
     produce. Weighted because "PILOT agreement" is a far stronger signal
     of the file cabinet than "county" alone.

     ⚠️ THIS IS A RELEVANCE SCORE, NOT A PRIVACY FILTER. It exists to
     find good material, and a private message could in principle score.
     The privacy guarantee is the person seeing the digest before it is
     sent - never this list. Do not let anyone reason "the keywords keep
     personal things out", because they do not. */
  var STRONG = [
    'economic development', 'edc', 'ida ', 'industrial development',
    'site selection', 'site selector', 'pilot agreement', 'tax abatement',
    'tax increment', 'tif ', 'opportunity zone', 'foreign trade zone',
    'revolving loan', 'incentive', 'workforce development', 'bre ',
    'business retention', 'rfi', 'rfp', 'prospect', 'boilerplate',
    'press release', 'chamber of commerce', 'port authority',
    'comprehensive plan', 'strategic plan', 'grant application',
  ];
  var WEAK = [
    'county', 'municipal', 'city of', 'township', 'region', 'msa',
    'our organization', 'our organisation', 'our agency', 'our office',
    'we are a', 'our mission', 'our board', 'about us', 'letterhead',
    'employer', 'manufacturing', 'logistics', 'workforce', 'labor shed',
    'labour shed', 'interstate', 'rail', 'airport', 'acreage',
    'megasite', 'shovel ready', 'tagline', 'stakeholder',
  ];

  /* Chatter. A message that is only this is never worth a slot. */
  var NOISE = /^(thanks?|thank you|ok(ay)?|yes|no|sure|great|perfect|got it|nice|cool|continue|go on|more|again|hi|hello|hey)[\s!.,]*$/i;

  function norm(s) { return String(s == null ? '' : s).replace(/\s+/g, ' ').trim(); }

  /* ── Pulling text out of one message node ───────────────────────
     ⚠️ `parts` is NOT always an array of strings. Images, audio and
     tool results put objects in there, and String(obj) yields
     "[object Object]", which would sail into the digest looking like
     content. Strings only, everything else dropped. */
  function partsToText(content) {
    if (!content) return '';
    if (typeof content === 'string') return content;
    var out = [];
    if (Array.isArray(content.parts)) {
      for (var i = 0; i < content.parts.length; i++) {
        var p = content.parts[i];
        if (typeof p === 'string' && p.trim()) out.push(p);
      }
    }
    if (typeof content.text === 'string' && content.text.trim()) out.push(content.text);
    return out.join('\n');
  }

  /* ── The custom instructions ────────────────────────────────────
     !! THERE IS NO SINGLE DOCUMENTED PLACE FOR THESE, AND THE SHAPE HAS
     CHANGED BETWEEN EXPORTS. Rather than guess one location and quietly
     return nothing when it moves, this looks in every shape seen in the
     wild AND reports which one matched, so a future export that fits
     none of them produces a visible "could not find" rather than a
     silently empty result.

       a) a system node whose content_type is 'user_editable_context',
          carrying user_profile / user_instructions
       b) metadata.user_context_message_data with
          about_user_message / about_model_message
       c) a system message flagged metadata.is_user_system_message

     Returns { about, instructions, foundVia } - foundVia is the caller's
     evidence that this worked, and the UI prints it. */
  function readCustomInstructions(conversations) {
    var about = '', instructions = '', via = null;

    function take(a, b, how) {
      a = norm(a); b = norm(b);
      if (!a && !b) return;
      if (a && a.length > about.length) about = a;
      if (b && b.length > instructions.length) instructions = b;
      if (!via) via = how;
    }

    for (var ci = 0; ci < conversations.length; ci++) {
      var mapping = conversations[ci] && conversations[ci].mapping;
      if (!mapping) continue;
      for (var k in mapping) {
        if (!Object.prototype.hasOwnProperty.call(mapping, k)) continue;
        var m = mapping[k] && mapping[k].message;
        if (!m) continue;
        var c = m.content || {};
        var meta = m.metadata || {};

        if (c.content_type === 'user_editable_context') {
          take(c.user_profile, c.user_instructions, 'user_editable_context');
        }
        var ucm = meta.user_context_message_data;
        if (ucm) take(ucm.about_user_message, ucm.about_model_message,
                      'user_context_message_data');
        if (meta.is_user_system_message && c.content_type !== 'user_editable_context') {
          take(partsToText(c), '', 'is_user_system_message');
        }
      }
    }
    return { about: about, instructions: instructions, foundVia: via };
  }

  /* ── Every message the PERSON wrote ─────────────────────────────
     ⚠️ USER MESSAGES ONLY, DELIBERATELY. The assistant's replies are
     model output - fluent, plentiful, and not evidence of anything the
     customer knows. Feeding them back in would let one model's
     invention become a "fact" in the file cabinet, which is precisely
     the failure specialist-context.md warns about: a profile of
     confidently wrong facts is worse than an empty one. */
  function collectUserMessages(conversations) {
    var out = [];
    var seenConversations = 0, seenMessages = 0;

    for (var ci = 0; ci < conversations.length; ci++) {
      var conv = conversations[ci];
      if (!conv || !conv.mapping) continue;
      seenConversations++;
      var title = norm(conv.title);
      for (var k in conv.mapping) {
        if (!Object.prototype.hasOwnProperty.call(conv.mapping, k)) continue;
        var m = conv.mapping[k] && conv.mapping[k].message;
        if (!m) continue;
        seenMessages++;
        var role = m.author && m.author.role;
        if (role !== 'user') continue;
        var c = m.content || {};
        /* The custom-instructions node is authored 'user' in some
           exports. It is handled separately; including it here would
           duplicate it into the digest. */
        if (c.content_type === 'user_editable_context') continue;
        var text = norm(partsToText(c));
        if (!text || NOISE.test(text)) continue;
        out.push({
          title: title,
          when: typeof m.create_time === 'number' ? m.create_time : 0,
          text: text,
        });
      }
    }
    return { messages: out, conversations: seenConversations, messagesSeen: seenMessages };
  }

  function scoreOf(msg) {
    var hay = (msg.title + ' ' + msg.text).toLowerCase();
    var s = 0, i;
    for (i = 0; i < STRONG.length; i++) if (hay.indexOf(STRONG[i]) !== -1) s += 3;
    for (i = 0; i < WEAK.length; i++)   if (hay.indexOf(WEAK[i]) !== -1)   s += 1;
    /* A one-liner rarely describes an organisation; a wall of text often
       is a pasted document. Neither is decisive, both nudge. */
    if (msg.text.length > 400) s += 1;
    if (msg.text.length > 2000) s += 1;
    if (msg.text.length < 80) s -= 1;
    return s;
  }

  /* ── Choosing what to send ──────────────────────────────────────
     Highest scoring first, ties broken by recency, and hard-capped on
     total characters. The cap is the real control: it is what keeps
     "tens of megabytes on disk" from becoming "tens of megabytes sent",
     and it is why a long export costs the same as a short one.

     ⚠️ A MESSAGE THAT SCORES ZERO IS NEVER SENT, even if there is room.
     Filling the remaining budget with whatever happened to be lying
     around is how a grocery list ends up in a request to a model. */
  function select(messages, opts) {
    opts = opts || {};
    var maxChars = opts.maxChars || 60000;
    var maxMessages = opts.maxMessages || 120;
    var perMessage = opts.perMessage || 4000;
    var minScore = opts.minScore == null ? 1 : opts.minScore;

    var scored = [];
    for (var i = 0; i < messages.length; i++) {
      var s = scoreOf(messages[i]);
      if (s < minScore) continue;
      scored.push({ m: messages[i], s: s });
    }
    scored.sort(function (a, b) {
      if (b.s !== a.s) return b.s - a.s;
      return (b.m.when || 0) - (a.m.when || 0);
    });

    var chosen = [], used = 0;
    for (var j = 0; j < scored.length && chosen.length < maxMessages; j++) {
      var text = scored[j].m.text;
      if (text.length > perMessage) text = text.slice(0, perMessage) + ' […]';
      if (used + text.length > maxChars) continue;   /* skip, do not stop:
            a single huge message must not block every smaller one after it */
      used += text.length;
      chosen.push({ title: scored[j].m.title, when: scored[j].m.when,
                    score: scored[j].s, text: text });
    }
    /* Read back in time order: a digest that jumps about reads as
       fragments, and the most recent description of an organisation is
       usually the current one. */
    chosen.sort(function (a, b) { return (a.when || 0) - (b.when || 0); });
    return { chosen: chosen, chars: used, considered: scored.length };
  }

  /* ── The digest, which is the only thing that ever leaves ───────── */
  function buildDigest(custom, selection) {
    var lines = [];
    if (custom && (custom.about || custom.instructions)) {
      lines.push('=== CUSTOM INSTRUCTIONS ===');
      if (custom.about) lines.push('What they told ChatGPT about themselves:\n' + custom.about);
      if (custom.instructions) lines.push('How they asked it to respond:\n' + custom.instructions);
      lines.push('');
    }
    if (selection.chosen.length) {
      lines.push('=== THINGS THEY HAVE WRITTEN ===');
      for (var i = 0; i < selection.chosen.length; i++) {
        var c = selection.chosen[i];
        lines.push('--- ' + (c.title || 'untitled') + ' ---');
        lines.push(c.text);
        lines.push('');
      }
    }
    return lines.join('\n').trim();
  }

  /* ── The whole job ──────────────────────────────────────────────
     Takes the PARSED conversations.json (the caller unzips; this file
     stays pure). Returns the digest plus every number the UI needs to
     tell the person the truth about what is about to happen.

     ⚠️ ALWAYS RETURNS A `notes` LIST, AND IT IS NOT DECORATION. An
     export that yields nothing must say which of the possible reasons
     applies - no conversations, no user messages, nothing relevant -
     because "0 fields found" with no explanation is the kind of silent
     result this project keeps having to go back and fix. */
  function fromConversations(conversations, opts) {
    var notes = [];
    if (!Array.isArray(conversations)) {
      return {
        ok: false, digest: '', notes: ['conversations.json was not a list of '
          + 'conversations. This may not be a ChatGPT export, or the format '
          + 'has changed.'],
        stats: { conversations: 0, messagesSeen: 0, userMessages: 0,
                 considered: 0, selected: 0, chars: 0 },
        custom: { about: '', instructions: '', foundVia: null },
      };
    }

    var custom = readCustomInstructions(conversations);
    var got = collectUserMessages(conversations);
    var sel = select(got.messages, opts);
    var digest = buildDigest(custom, sel);

    if (!got.conversations) notes.push('No conversations were found in the file.');
    else if (!got.messages.length) notes.push('Conversations were found, but none '
      + 'of them contain messages you wrote.');
    if (!custom.foundVia) notes.push('No custom instructions were found. Newer '
      + 'exports do not always include them - paste them in instead if you '
      + 'have some.');
    else notes.push('Custom instructions found (' + custom.foundVia + ').');
    if (got.messages.length && !sel.chosen.length) notes.push('Nothing in your '
      + 'history looked like it was about your organisation, so nothing has '
      + 'been selected. Paste something in instead.');
    if (sel.considered > sel.chosen.length) notes.push((sel.considered - sel.chosen.length)
      + ' relevant message(s) did not fit in the size limit and were left out.');

    return {
      ok: !!digest,
      digest: digest,
      notes: notes,
      custom: custom,
      selected: sel.chosen,
      stats: {
        conversations: got.conversations,
        messagesSeen: got.messagesSeen,
        userMessages: got.messages.length,
        considered: sel.considered,
        selected: sel.chosen.length,
        chars: digest.length,
      },
    };
  }

  /* Finding conversations.json inside the zip is the caller's job (it
     needs a zip library and this file has no dependencies), but WHICH
     entry to use is a decision worth keeping here and testing. Exports
     have nested it under a folder before now. */
  function pickConversationsEntry(names) {
    var exact = null, nested = null;
    for (var i = 0; i < names.length; i++) {
      var n = names[i];
      if (n === 'conversations.json') exact = n;
      else if (/(^|\/)conversations\.json$/.test(n) && !/__MACOSX/.test(n)) {
        if (!nested || n.length < nested.length) nested = n;
      }
    }
    return exact || nested || null;
  }

  /* ═══════════════════════════════════════════════════════════════
     WHERE EACH ACCEPTED FIELD ACTUALLY GOES

     ⚠️ MOST PEOPLE IMPORTING THIS HAVE NO ORGANISATION. Teams are the
     paid tier; a trial user is one person with a community_profiles
     row and nothing else. But fourteen of the fields the reader
     proposes - entity_type, address, incentive_programs, mission,
     style_notes and the rest - are columns on esq_org_profiles ONLY.
     Written naively, a solo user would tick fourteen boxes, press
     Save, and have most of it land nowhere at all. PostgREST would
     return no error, because an update naming a column that is not in
     the payload is simply an update of the columns that are.

     So a solo user's unhoused fields are written into
     community_profiles.notes under their own headings. That is not a
     consolation prize: buildContext() already reads notes and puts it
     in front of every specialist as "Other notes", so the incentive
     programs they imported do reach the work. The UI says this is
     happening rather than letting them assume a tidy row somewhere.

     Returns { org, personal, notes, homeless } - and `homeless` is
     always empty by construction. It exists so the test can prove it:
     if a field is ever added with no home in either table and no
     notes fallback, that list stops being empty and the test fails. */
  var PERSONAL_MAP = {
    legal_name: 'org_name',
    short_name: 'org_short_name',
    website: 'website',
    region_label: 'region',
    county: 'county',
    state: 'state',
    key_industries: 'key_industries',
    target_sectors: 'target_sectors',
    boilerplate: 'boilerplate',
    contact_name: 'contact_name',
    contact_title: 'contact_title',
    contact_phone: 'contact_phone',
    contact_email: 'contact_email',
  };

  /* Columns that exist on esq_org_profiles. Anything org-scoped and not
     in PERSONAL_MAP has to go to notes when there is no organisation. */
  var ORG_COLUMNS = ['legal_name','short_name','entity_type','address','phone',
    'general_email','website','governing_body','municipalities','region_label',
    'access_notes','top_employers','incentive_programs','mission','tagline',
    'boilerplate','self_reference','style_notes','footer_notice'];

  function planSave(accepted, hasOrg) {
    var org = {}, personal = {}, notes = [], homeless = [];

    for (var i = 0; i < accepted.length; i++) {
      var f = accepted[i];
      var key = f.key, value = f.value, scope = f.scope || 'org';

      /* ⚠️ NEVER, UNDER ANY CIRCUMSTANCE, ONTO THE ORGANISATION.
         Share a signature block and every cover letter Clara writes
         for five people gets signed by the sixth. */
      if (scope === 'personal') {
        if (PERSONAL_MAP[key]) personal[PERSONAL_MAP[key]] = value;
        else homeless.push(key);
        continue;
      }

      if (hasOrg && ORG_COLUMNS.indexOf(key) !== -1) { org[key] = value; continue; }
      if (PERSONAL_MAP[key]) { personal[PERSONAL_MAP[key]] = value; continue; }
      notes.push({ key: key, label: f.label || key, value: value });
    }

    if (notes.length) {
      personal.notes = notes.map(function (n) {
        return n.label + ': ' + n.value;
      }).join('\n');
    }
    return { org: org, personal: personal, notes: notes, homeless: homeless };
  }

  return {
    fromConversations: fromConversations,
    pickConversationsEntry: pickConversationsEntry,
    planSave: planSave,
    PERSONAL_MAP: PERSONAL_MAP,
    ORG_COLUMNS: ORG_COLUMNS,
    /* exported for the tests, which check them directly */
    _readCustomInstructions: readCustomInstructions,
    _collectUserMessages: collectUserMessages,
    _select: select,
    _scoreOf: scoreOf,
    _partsToText: partsToText,
  };
});
