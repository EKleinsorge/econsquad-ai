
/* EconSquad App Extensions v05.07.1755 */
(function() {
  var TRASH_KEY = 'esq_trash_log';
  var TRASH_EMAILS_KEY = 'esq_trash_emails';

  function getTrashLog() {
    try { return JSON.parse(localStorage.getItem(TRASH_KEY) || '{}'); } catch(e) { return {}; }
  }
  function setTrashLog(l) {
    try { localStorage.setItem(TRASH_KEY, JSON.stringify(l)); } catch(e) {}
  }
  function getTrashEmails() {
    try { return JSON.parse(localStorage.getItem(TRASH_EMAILS_KEY) || '{}'); } catch(e) { return {}; }
  }
  function setTrashEmails(d) {
    try { localStorage.setItem(TRASH_EMAILS_KEY, JSON.stringify(d)); } catch(e) {}
  }
  var PERM_DELETED_KEY = 'esq_perm_deleted';
  function getPermDeleted() {
    try { return JSON.parse(localStorage.getItem(PERM_DELETED_KEY) || '{}'); } catch(e) { return {}; }
  }
  function setPermDeleted(d) {
    try { localStorage.setItem(PERM_DELETED_KEY, JSON.stringify(d)); } catch(e) {}
  }
  function getGmailSync() {
    try { return localStorage.getItem('econsquad_gmail_sync') !== '0'; } catch(e) { return true; }
  }
  var PIN_KEY = 'esq_pinned';
  function getPinned() {
    try { return JSON.parse(localStorage.getItem(PIN_KEY) || '{}'); } catch(e) { return {}; }
  }
  function setPinned(d) {
    try { localStorage.setItem(PIN_KEY, JSON.stringify(d)); } catch(e) {}
  }
  var TAG_OVERRIDE_KEY = 'esq_tag_overrides';
  function getTagOverrides() {
    try { return JSON.parse(localStorage.getItem(TAG_OVERRIDE_KEY) || '{}'); } catch(e) { return {}; }
  }
  function setTagOverrides(d) {
    try { localStorage.setItem(TAG_OVERRIDE_KEY, JSON.stringify(d)); } catch(e) {}
  }
  var SNOOZE_KEY = 'esq_snoozed';
  function getSnoozed() {
    try { return JSON.parse(localStorage.getItem(SNOOZE_KEY) || '{}'); } catch(e) { return {}; }
  }
  function setSnoozed(d) {
    try { localStorage.setItem(SNOOZE_KEY, JSON.stringify(d)); } catch(e) {}
  }
  var CUSTOM_TAGS_KEY = 'esq_custom_tags';
  var DISABLED_BUILTINS_KEY = 'esq_disabled_builtins';
  var PINNED_TAGS_KEY = 'esq_pinned_tags';
  function getCustomTags() { try { return JSON.parse(localStorage.getItem(CUSTOM_TAGS_KEY) || '[]'); } catch(e) { return []; } }
  function setCustomTags(d) { try { localStorage.setItem(CUSTOM_TAGS_KEY, JSON.stringify(d)); } catch(e) {} }
  function getDisabledBuiltins() { try { return JSON.parse(localStorage.getItem(DISABLED_BUILTINS_KEY) || '[]'); } catch(e) { return []; } }
  function setDisabledBuiltins(d) { try { localStorage.setItem(DISABLED_BUILTINS_KEY, JSON.stringify(d)); } catch(e) {} }
  function getPinnedTags() { try { return JSON.parse(localStorage.getItem(PINNED_TAGS_KEY) || '[]'); } catch(e) { return []; } }
  function setPinnedTags(d) { try { localStorage.setItem(PINNED_TAGS_KEY, JSON.stringify(d)); } catch(e) {} }

  window.toggleTagPin = function(label) {
    var pt = getPinnedTags();
    var idx = pt.indexOf(label);
    if (idx === -1) pt.push(label); else pt.splice(idx, 1);
    setPinnedTags(pt);
    var nowPinned = pt.indexOf(label) !== -1;
    // Update any visible pin buttons for this label without rebuilding the whole list
    document.querySelectorAll('[data-tagpin="' + label + '"]').forEach(function(btn) {
      btn.textContent = nowPinned ? '📌' : '⬜';
      btn.title = nowPinned ? 'Unpin from top' : 'Pin to top';
      btn.style.background = nowPinned ? 'rgba(170,255,62,0.12)' : 'rgba(255,255,255,0.04)';
      btn.style.color = nowPinned ? '#aaff3e' : '#4a5568';
      btn.style.borderColor = nowPinned ? 'rgba(170,255,62,0.3)' : 'rgba(255,255,255,0.08)';
    });
    _renderList(window._lastEmails || []);
  };

  var ALL_TAGS = [
    { label: 'RFI',       color: '#64afff', bg: 'rgba(100,175,255,0.15)', border: 'rgba(100,175,255,0.35)', icon: '&#128205;', priority: true },
    { label: 'GRANT',     color: '#f5c542', bg: 'rgba(245,197,66,0.15)',  border: 'rgba(245,197,66,0.35)',  icon: '&#128176;', priority: true },
    { label: 'BRE',       color: '#32e1c8', bg: 'rgba(50,225,200,0.15)',  border: 'rgba(50,225,200,0.35)',  icon: '&#129309;', priority: true },
    { label: 'INCENTIVE', color: '#c88cff', bg: 'rgba(200,140,255,0.15)', border: 'rgba(200,140,255,0.35)', icon: '&#128142;', priority: true },
    { label: 'WORKFORCE', color: '#aaff3e', bg: 'rgba(170,255,62,0.15)',  border: 'rgba(170,255,62,0.35)',  icon: '&#128119;', priority: true },
    { label: 'PROSPECT',  color: '#ff9b41', bg: 'rgba(255,155,65,0.15)',  border: 'rgba(255,155,65,0.35)',  icon: '&#127919;', priority: true },
    { label: 'ALERT',     color: '#82dcff', bg: 'rgba(130,220,255,0.12)', border: 'rgba(130,220,255,0.5)',  icon: '&#128276;' },
    { label: 'PROMO',     color: '#b8930a', bg: 'rgba(255,220,100,0.08)', border: 'rgba(255,220,100,0.4)',  icon: '&#127991;' },
    { label: 'SUPPORT',   color: '#6b7a96', bg: 'rgba(255,255,255,0.06)', border: 'rgba(255,255,255,0.2)',  icon: '&#128295;' },
    { label: 'EMAIL',     color: '#4a5568', bg: 'rgba(255,255,255,0.04)', border: 'rgba(255,255,255,0.12)', icon: '&#9993;'   },
  ];
  function escH(s) {
    return (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function eid(id) { return document.getElementById(id); }
  function cel(tag, cls, html) {
    var el = document.createElement(tag);
    if (cls) el.className = cls;
    if (html !== undefined) el.innerHTML = html;
    return el;
  }

  /* ── REPORT A PROBLEM ── */
  function injectReportBtn() {
    if (eid('esq-report-btn')) return;
    var btn = cel('button', 'report-btn-float', '&#9888;&#65039; Report a problem');
    btn.id = 'esq-report-btn';
    btn.addEventListener('click', openReport);
    document.body.appendChild(btn);
  }

  function openReport() {
    var old = eid('esq-report-ol'); if (old) old.remove();
    var ol = cel('div', 'report-overlay');
    ol.id = 'esq-report-ol';
    var box = cel('div', 'report-box');
    var xBtn = cel('button', 'report-x-btn', '&#x2715;');
    xBtn.addEventListener('click', function() { ol.remove(); });
    var ta = cel('textarea', 'report-ta');
    ta.id = 'esq-rta';
    ta.placeholder = 'Describe what happened and any steps to reproduce...';
    var meta = cel('div', 'report-meta-txt');
    meta.textContent = 'Version: v05.04.1720 | ' + window.location.href.slice(0, 80);
    var sendBtn = cel('button', 'report-send-btn', 'Send Report &#8599;');
    sendBtn.addEventListener('click', submitReport);
    var h3 = cel('h3', '', 'Report a Problem');
    var p = cel('p', '', 'Tell us what went wrong and we will look into it right away.');
    box.appendChild(xBtn);
    box.appendChild(h3);
    box.appendChild(p);
    box.appendChild(ta);
    box.appendChild(meta);
    box.appendChild(sendBtn);
    ol.appendChild(box);
    ol.addEventListener('click', function(e) { if (e.target === ol) ol.remove(); });
    document.body.appendChild(ol);
    setTimeout(function() { var t = eid('esq-rta'); if (t) t.focus(); }, 100);
  }

  function submitReport() {
    var ta = eid('esq-rta');
    var text = ta ? ta.value.trim() : '';
    if (!text) { alert('Please describe the problem first.'); return; }
    var payload = {
      problem: text,
      version: 'v05.04.1720',
      url: window.location.href,
      userAgent: navigator.userAgent,
      timestamp: new Date().toISOString(),
      user: (window.currentUser && window.currentUser.email) || 'anonymous'
    };
    console.log('Problem report:', payload);
    if (window.supabase) {
      window.supabase.from('problem_reports').insert([payload])
        .then(function() { showReportOK(); }).catch(function() { showReportOK(); });
    } else {
      setTimeout(showReportOK, 600);
    }
  }

  function showReportOK() {
    var box = document.querySelector('#esq-report-ol .report-box');
    if (!box) return;
    box.innerHTML = '<div class="report-ok"><div class="big">&#x2705;</div><h4>Report Sent!</h4><p>Thanks. We will investigate and fix it fast.</p></div>';
    setTimeout(function() { var ol = eid('esq-report-ol'); if (ol) ol.remove(); }, 2500);
  }

  /* ── HOME CHAT ── */
  var chatHistory = [];

  function initHomeChat() {
    var sendBtn = eid('home-chat-send');
    var input = eid('home-chat-input');
    if (!sendBtn || !input) return;
    sendBtn.addEventListener('click', function() { doSend(); });
    input.addEventListener('keydown', function(e) { if (e.key === 'Enter') doSend(); });
    var starters = ['What can EconSquad do?', 'How does grant writing work?', 'What is Riley?', 'Pricing?'];
    ['hcs1','hcs2','hcs3','hcs4'].forEach(function(id, i) {
      var btn = eid(id);
      if (btn) btn.addEventListener('click', function() { doSend(starters[i]); });
    });
  }

  function doSend(preset) {
    var input = eid('home-chat-input');
    var msg = preset || (input ? input.value.trim() : '');
    if (!msg) return;
    if (input) input.value = '';
    var sendBtn = eid('home-chat-send');
    if (sendBtn) sendBtn.disabled = true;
    addMsg('user', msg, false);
    addMsg('aria', '...', true);
    chatHistory.push({ role: 'user', content: msg });
    fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 400,
        system: 'You are ARIA, the AI assistant for EconSquad, a platform built exclusively for economic developers. EconSquad gives economic developers AI specialists for grants, RFIs, BRE surveys, incentive modeling, workforce analysis, and more. It includes an AI inbox organizer, calendar, specialist deployment, and XP leveling system. Answer questions warmly and concisely in under 3 sentences. Never make up specific pricing numbers.',
        messages: chatHistory
      })
    })
    .then(function(r) { return r.json(); })
    .then(function(d) {
      var reply = (d.content && d.content[0] && d.content[0].text) || 'Not sure about that one — reach out to our team!';
      chatHistory.push({ role: 'assistant', content: reply });
      updateLastMsg(reply);
      if (sendBtn) sendBtn.disabled = false;
    })
    .catch(function() {
      updateLastMsg('Having trouble connecting right now. Try again in a moment!');
      if (sendBtn) sendBtn.disabled = false;
    });
  }

  function addMsg(role, text, typing) {
    var c = eid('home-chat-messages'); if (!c) return;
    var div = cel('div', 'hcm' + (role === 'user' ? ' u' : ''));
    var av = cel('div', 'hcav ' + (role === 'user' ? 'u' : 'aria'), role === 'user' ? 'E' : 'A');
    var bub = cel('div', 'hcbub' + (typing ? ' typing' : ''), typing ? '&bull;&bull;&bull;' : escH(text));
    div.appendChild(av);
    div.appendChild(bub);
    c.appendChild(div);
    c.scrollTop = c.scrollHeight;
  }

  function updateLastMsg(text) {
    var c = eid('home-chat-messages'); if (!c) return;
    var bs = c.querySelectorAll('.hcm:not(.u) .hcbub');
    var last = bs[bs.length - 1];
    if (last) { last.textContent = text; last.classList.remove('typing'); }
    c.scrollTop = c.scrollHeight;
  }

  /* ── EMAIL TAGGING ── */
  var BUILTIN_RULES = [
    { label: 'RFI',      color: '#64afff', bg: 'rgba(100,175,255,0.15)', border: 'rgba(100,175,255,0.35)', icon: '&#128205;', priority: true,  re: /\brfi\b|request for information|site selection/ },
    { label: 'GRANT',    color: '#f5c542', bg: 'rgba(245,197,66,0.15)',  border: 'rgba(245,197,66,0.35)',  icon: '&#128176;', priority: true,  re: /\bgrant\b|cdbg|eda|usda|funding|weda/ },
    { label: 'BRE',      color: '#32e1c8', bg: 'rgba(50,225,200,0.15)',  border: 'rgba(50,225,200,0.35)',  icon: '&#129309;', priority: true,  re: /\bbre\b|business retention/ },
    { label: 'INCENTIVE',color: '#c88cff', bg: 'rgba(200,140,255,0.15)', border: 'rgba(200,140,255,0.35)', icon: '&#128142;', priority: true,  re: /incentive|tax credit|abatement|opportunity zone/ },
    { label: 'WORKFORCE',color: '#aaff3e', bg: 'rgba(170,255,62,0.15)',  border: 'rgba(170,255,62,0.35)',  icon: '&#128119;', priority: true,  re: /workforce|labor|talent|training/ },
    { label: 'PROSPECT', color: '#ff9b41', bg: 'rgba(255,155,65,0.15)',  border: 'rgba(255,155,65,0.35)',  icon: '&#127919;', priority: true,  re: /prospect|generate leads|attendee/ },
    { label: 'BOUNCE',   color: '#ff8080', bg: 'rgba(255,80,80,0.12)',   border: 'rgba(255,80,80,0.7)',    icon: '&#9888;',   bounce: true,    re: /undeliverable|bounced|could not be delivered/ },
    { label: 'APPT',     color: '#aaff3e', bg: 'rgba(170,255,62,0.12)',  border: 'rgba(170,255,62,0.6)',   icon: '&#128197;',                  re: /appointment|notif.*appoint/ },
    { label: 'CAL',      color: '#64afff', bg: 'rgba(100,175,255,0.12)', border: 'rgba(100,175,255,0.5)',  icon: '&#128467;',                  re: /calendar|no events scheduled/ },
    { label: 'SITE',     color: '#64afff', bg: 'rgba(100,175,255,0.12)', border: 'rgba(100,175,255,0.5)',  icon: '&#127962;',                  re: /loopnet|costar|listing|property/ },
    { label: 'SYSTEM',   color: '#6b7a96', bg: 'rgba(165,185,210,0.10)', border: 'rgba(165,185,210,0.4)',  icon: '&#9881;',   fsOnly: true,    re: /github|gitlab|jira/ },
    { label: 'MARKET',   color: '#ff9b41', bg: 'rgba(255,155,65,0.10)',  border: 'rgba(255,155,65,0.5)',   icon: '&#128722;',                  re: /ebay|marketplace|bid|auction/ },
    { label: 'TRAVEL',   color: '#82dcff', bg: 'rgba(130,220,255,0.12)', border: 'rgba(130,220,255,0.5)',  icon: '&#9992;',                    re: /southwest|airline|flight|hotel|travel/ },
    { label: 'SUBSCR',   color: '#c88cff', bg: 'rgba(200,140,255,0.10)', border: 'rgba(200,140,255,0.5)',  icon: '&#128250;',                  re: /netflix|hulu|disney|spotify|membership|subscription/ },
    { label: 'HEALTH',   color: '#32e1c8', bg: 'rgba(50,225,200,0.10)',  border: 'rgba(50,225,200,0.5)',   icon: '&#128138;',                  re: /walgreens|cvs|pharmacy|health|medical/ },
    { label: 'SURVEY',   color: '#a5b9d2', bg: 'rgba(165,185,210,0.10)', border: 'rgba(165,185,210,0.4)',  icon: '&#11088;',                   re: /survey|feedback|how.*doing|recommend/ },
    { label: 'ALERT',    color: '#82dcff', bg: 'rgba(130,220,255,0.12)', border: 'rgba(130,220,255,0.5)',  icon: '&#128276;',                  re: /newsletter|digest|alert|notification/ },
    { label: 'PROMO',    color: '#b8930a', bg: 'rgba(255,220,100,0.08)', border: 'rgba(255,220,100,0.4)',  icon: '&#127991;',                  re: /sale|promo|discount|credit|deal|coupon/ },
    { label: 'SUPPORT',  color: '#6b7a96', bg: 'rgba(255,255,255,0.06)', border: 'rgba(255,255,255,0.2)',  icon: '&#128295;',                  re: /support|ticket|re:|fwd:|help/ },
  ];

  var TAG_COLORS = [
    { hex: '#64afff', bg: 'rgba(100,175,255,0.15)', border: 'rgba(100,175,255,0.35)' },
    { hex: '#aaff3e', bg: 'rgba(170,255,62,0.15)',  border: 'rgba(170,255,62,0.35)'  },
    { hex: '#f5c542', bg: 'rgba(245,197,66,0.15)',  border: 'rgba(245,197,66,0.35)'  },
    { hex: '#32e1c8', bg: 'rgba(50,225,200,0.15)',  border: 'rgba(50,225,200,0.35)'  },
    { hex: '#c88cff', bg: 'rgba(200,140,255,0.15)', border: 'rgba(200,140,255,0.35)' },
    { hex: '#ff9b41', bg: 'rgba(255,155,65,0.15)',  border: 'rgba(255,155,65,0.35)'  },
    { hex: '#ff80b5', bg: 'rgba(255,128,181,0.15)', border: 'rgba(255,128,181,0.35)' },
    { hex: '#ff8080', bg: 'rgba(255,80,80,0.15)',   border: 'rgba(255,80,80,0.35)'   },
  ];
  var TAG_ICON_OPTIONS = ['🎯','💼','⭐','🏆','📋','🔔','💡','🌐','🤝','📊','🏗️','🔑','📢','🗂️','🧩','📌'];

  function findTag(label) {
    var ct = getCustomTags().filter(function(t) { return t.label === label; })[0];
    if (ct) return ct;
    var bt = BUILTIN_RULES.filter(function(t) { return t.label === label; })[0];
    if (bt) return bt;
    return ALL_TAGS.filter(function(t) { return t.label === label; })[0] || null;
  }

  function getTag(from, subject, snippet) {
    var f = (from || '').toLowerCase(), s = (subject || '').toLowerCase(), sn = (snippet || '').toLowerCase();
    var all = s + ' ' + sn + ' ' + f;
    var disabled = getDisabledBuiltins();
    // Custom tags checked first
    var custom = getCustomTags();
    for (var i = 0; i < custom.length; i++) {
      var ct = custom[i];
      if (!ct.enabled) continue;
      var kws = ct.keywords || [];
      for (var j = 0; j < kws.length; j++) {
        var kw = (kws[j] || '').trim().toLowerCase();
        if (kw && all.indexOf(kw) !== -1) {
          return { label: ct.label, color: ct.color, bg: ct.bg, border: ct.border, icon: ct.icon || '&#127991;', priority: !!ct.priority };
        }
      }
    }
    // Built-in rules (skip disabled)
    for (var i = 0; i < BUILTIN_RULES.length; i++) {
      var r = BUILTIN_RULES[i];
      if (disabled.indexOf(r.label) !== -1) continue;
      var hay = r.fsOnly ? (f + s) : all;
      if (r.re.test(hay)) return { label: r.label, color: r.color, bg: r.bg, border: r.border, icon: r.icon, priority: !!r.priority, bounce: !!r.bounce };
    }
    return { label: 'EMAIL', color: '#4a5568', bg: 'rgba(255,255,255,0.04)', border: 'rgba(255,255,255,0.12)', icon: '&#9993;' };
  }

  function avatarColor(n) {
    var c = ['linear-gradient(135deg,#aaff3e,#5a9900)', 'linear-gradient(135deg,#64afff,#1e40af)', 'linear-gradient(135deg,#f5c542,#a06800)', 'linear-gradient(135deg,#32e1c8,#065f5b)', 'linear-gradient(135deg,#c88cff,#4a1d96)', 'linear-gradient(135deg,#ff9b41,#7c2d12)'];
    var h = 0; for (var i = 0; i < n.length; i++) h = n.charCodeAt(i) + ((h << 5) - h);
    return c[Math.abs(h) % c.length];
  }

  function initials(f) {
    var n = (f || '').replace(/<[^>]*>/g, '').replace(/[<>]/g, '').trim() || '?';
    var p = n.split(/\s+/).filter(Boolean);
    if (p.length >= 2) return (p[0][0] + (p[p.length - 1][0] || '')).toUpperCase();
    return (n[0] || '?').toUpperCase() + (n[1] || '').toUpperCase();
  }

  function senderName(f) {
    f = f || '';
    var m = f.match(/^"?([^"<]+)"?\s*</);
    if (m && m[1].trim()) return m[1].trim();
    var a = f.replace(/<[^>]*>/g, '').trim();
    return a || f.split('@')[0] || 'Unknown';
  }

  /* ── EMAIL DETAIL MODAL ── */
  window.openEmailDetail = function(email) {
    var old = eid('esq-ed'); if (old) old.remove();
    var tag = getTag(email.from || '', email.subject || '', email.snippet || '');
    var name = senderName(email.from || '');
    var d = new Date(email.date);
    var dateStr = isNaN(d) ? '' : d.toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    var ol = cel('div', 'email-detail-overlay');
    ol.id = 'esq-ed';
    var modal = cel('div', 'email-detail-modal');
    modal.style.cssText = 'max-width:720px;width:96%;max-height:88vh;display:flex;flex-direction:column;padding:0;overflow:hidden;';
    var handle = cel('div', 'email-detail-handle');

    // Header
    var hdr = document.createElement('div');
    hdr.style.cssText = 'padding:16px 20px 12px;flex-shrink:0;border-bottom:1px solid rgba(255,255,255,0.07);position:relative;';
    var xBtn = cel('button', 'email-detail-close', '&#x2715;');
    xBtn.style.cssText = 'position:absolute;top:12px;right:14px;';
    xBtn.addEventListener('click', function() { ol.remove(); });
    var tagEl = cel('span', 'email-type-tag');
    tagEl.style.cssText = 'background:' + tag.bg + ';color:' + tag.color + ';border:1px solid ' + tag.border + ';margin-bottom:8px;display:inline-block;';
    tagEl.innerHTML = tag.icon + ' ' + tag.label;
    var fromEl = cel('div', 'email-detail-from', escH(name) + ' &bull; ' + dateStr);
    var subEl = cel('div', 'email-detail-subject', escH(email.subject || '(no subject)'));
    hdr.appendChild(handle); hdr.appendChild(xBtn); hdr.appendChild(tagEl); hdr.appendChild(fromEl); hdr.appendChild(subEl);

    // Body area — scrollable
    var bodyWrap = document.createElement('div');
    bodyWrap.style.cssText = 'flex:1;overflow-y:auto;min-height:0;';
    var bodyEl = document.createElement('div');
    bodyEl.style.cssText = 'padding:16px 20px;font-size:13px;color:#b8c8e0;line-height:1.7;';
    bodyEl.innerHTML = '<span style="color:#4a5568;font-style:italic;">Loading full email…</span>';
    bodyWrap.appendChild(bodyEl);

    // Actions
    var actRow = cel('div', 'email-detail-actions');
    actRow.style.cssText = 'flex-shrink:0;border-top:1px solid rgba(255,255,255,0.07);padding:12px 20px;';
    if (tag.label === 'RFI') {
      var rfiBtn = cel('button', 'email-action-btn primary', 'Deploy Riley &#8599;');
      rfiBtn.addEventListener('click', function() { if (typeof deploy === 'function') deploy(21); ol.remove(); });
      actRow.appendChild(rfiBtn);
    } else if (tag.label === 'GRANT') {
      var gBtn = cel('button', 'email-action-btn primary', 'Grant Writer &#8599;');
      gBtn.addEventListener('click', function() { if (typeof deploy === 'function') deploy(1); ol.remove(); });
      actRow.appendChild(gBtn);
    }
    var closeBtn = cel('button', 'email-action-btn', 'Close');
    closeBtn.addEventListener('click', function() { ol.remove(); });
    var replyDetBtn = cel('button', 'email-action-btn', '&#9993; Reply');
    replyDetBtn.addEventListener('click', function() { ol.remove(); window.openReplyCompose(email); });
    var trashBtn = cel('button', 'email-action-btn danger', '&#128465; Trash');
    trashBtn.addEventListener('click', function() { window.trashEmailCard(email.id || '', null, email); ol.remove(); });
    actRow.appendChild(closeBtn); actRow.appendChild(replyDetBtn); actRow.appendChild(trashBtn);

    modal.appendChild(hdr); modal.appendChild(bodyWrap); modal.appendChild(actRow);
    ol.appendChild(modal);
    ol.addEventListener('click', function(e) { if (e.target === ol) ol.remove(); });
    document.body.appendChild(ol);

    // Fetch full body
    if (email.id && window.SUPA_KEY && window.providerToken) {
      fetch('https://kbwcsmctwtgrjtjcghkt.supabase.co/functions/v1/gmail-calendar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'apikey': window.SUPA_KEY, 'Authorization': 'Bearer ' + window.SUPA_KEY },
        body: JSON.stringify({ action: 'gmail_message', provider_token: window.providerToken, messageId: email.id })
      })
      .then(function(r) { return r.json(); })
      .then(function(data) {
        if (!data.body) { bodyEl.innerHTML = '<span style="color:#4a5568;font-style:italic;">Could not load email body.</span>'; return; }
        if (data.isHtml) {
          var iframe = document.createElement('iframe');
          iframe.sandbox = 'allow-same-origin';
          iframe.style.cssText = 'width:100%;border:none;background:#fff;border-radius:6px;min-height:300px;';
          bodyEl.innerHTML = '';
          bodyEl.appendChild(iframe);
          iframe.srcdoc = data.body;
          iframe.onload = function() {
            var h = iframe.contentDocument && iframe.contentDocument.body ? iframe.contentDocument.body.scrollHeight : 400;
            iframe.style.height = Math.min(Math.max(h + 32, 200), 520) + 'px';
          };
        } else {
          bodyEl.style.whiteSpace = 'pre-wrap';
          bodyEl.textContent = data.body;
        }
      })
      .catch(function() { bodyEl.innerHTML = escH(email.snippet || 'Preview only.'); });
    } else {
      bodyEl.innerHTML = escH(email.snippet || 'Preview only.');
    }
  };

  /* ── TAG MANAGER ── */
  window.openTagManager = function() {
    var old = eid('esq-tm-ol'); if (old) old.remove();
    var ol = cel('div', 'email-detail-overlay'); ol.id = 'esq-tm-ol';
    var modal = cel('div', 'email-detail-modal');
    modal.style.cssText = 'max-width:620px;width:94%;max-height:88vh;overflow-y:auto;';

    var xBtn = cel('button', 'email-detail-close', '&#x2715;');
    xBtn.addEventListener('click', function() { ol.remove(); });
    var title = cel('div', '');
    title.style.cssText = 'font-size:16px;font-weight:700;color:#eef3fc;margin-bottom:4px;';
    title.textContent = 'Tag Rules';
    var sub = cel('div', '');
    sub.style.cssText = 'font-size:12px;color:#6b7a96;margin-bottom:20px;';
    sub.textContent = 'Custom tags run first. Keywords match anywhere in From, Subject, or message.';

    // ---- Custom tags section ----
    var custHdr = cel('div', '');
    custHdr.style.cssText = 'display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;';
    var custLbl = cel('div', '', 'MY CUSTOM TAGS');
    custLbl.style.cssText = 'font-size:11px;font-weight:700;color:#6b7a96;letter-spacing:.08em;';
    var addBtn = cel('button', 'email-action-btn', '+ New Tag');
    addBtn.style.cssText = 'font-size:11px;padding:4px 12px;background:rgba(170,255,62,0.1);border-color:rgba(170,255,62,0.3);color:#aaff3e;';
    custHdr.appendChild(custLbl); custHdr.appendChild(addBtn);

    var custList = cel('div', '');
    custList.style.cssText = 'margin-bottom:20px;';

    // Form for add/edit (hidden initially)
    var formWrap = cel('div', '');
    formWrap.style.cssText = 'display:none;background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.08);border-radius:10px;padding:14px;margin-bottom:16px;';
    var editingId = null;

    function buildTagRow(ct, idx) {
      var row = cel('div', '');
      row.style.cssText = 'display:flex;align-items:center;gap:10px;padding:8px 10px;border-radius:8px;background:rgba(255,255,255,0.03);margin-bottom:6px;';
      var badge = cel('span', '');
      badge.style.cssText = 'font-size:10px;font-weight:700;padding:2px 8px;border-radius:10px;background:' + ct.bg + ';color:' + ct.color + ';border:1px solid ' + ct.border + ';flex-shrink:0;';
      badge.textContent = (ct.icon || '') + ' ' + ct.label;
      var kwPrev = cel('div', '');
      kwPrev.style.cssText = 'flex:1;font-size:11px;color:#6b7a96;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;';
      kwPrev.textContent = (ct.keywords || []).join(', ') || 'No keywords';
      var editRowBtn = cel('button', 'email-action-btn', 'Edit');
      editRowBtn.style.cssText = 'font-size:11px;padding:3px 10px;';
      var delBtn = cel('button', 'email-action-btn danger', '&#x2715;');
      delBtn.style.cssText = 'font-size:11px;padding:3px 8px;';
      editRowBtn.addEventListener('click', function() { openForm(ct); });
      delBtn.addEventListener('click', function() {
        var tags = getCustomTags(); tags.splice(idx, 1); setCustomTags(tags);
        rebuildCustomList();
        _renderList(window._lastEmails || []);
      });
      row.appendChild(badge); row.appendChild(kwPrev); row.appendChild(editRowBtn); row.appendChild(delBtn);
      return row;
    }

    function rebuildCustomList() {
      custList.innerHTML = '';
      var tags = getCustomTags();
      if (tags.length === 0) {
        var emp = cel('div', '', 'No custom tags yet. Click + New Tag to create one.');
        emp.style.cssText = 'font-size:12px;color:#6b7a96;padding:10px;text-align:center;';
        custList.appendChild(emp);
      }
      tags.forEach(function(ct, i) { custList.appendChild(buildTagRow(ct, i)); });
    }

    var selectedColorIdx = 0;
    function openForm(existing) {
      editingId = existing ? existing.id : null;
      formWrap.style.display = 'block';
      formWrap.innerHTML = '';
      var fTitle = cel('div', '', editingId ? 'Edit Tag' : 'New Tag');
      fTitle.style.cssText = 'font-size:13px;font-weight:700;color:#eef3fc;margin-bottom:12px;';
      formWrap.appendChild(fTitle);

      // Label
      var lRow = cel('div', ''); lRow.style.cssText = 'margin-bottom:10px;';
      var lLbl = cel('div', '', 'Label'); lLbl.style.cssText = 'font-size:11px;color:#6b7a96;margin-bottom:3px;font-weight:600;text-transform:uppercase;letter-spacing:.05em;';
      var lInp = document.createElement('input'); lInp.type = 'text'; lInp.maxLength = 12;
      lInp.placeholder = 'e.g. PARTNER';
      lInp.value = existing ? existing.label : '';
      lInp.style.cssText = 'width:160px;background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.12);border-radius:7px;padding:6px 10px;font-size:13px;color:#eef3fc;outline:none;font-family:inherit;text-transform:uppercase;';
      lInp.addEventListener('input', function() { lInp.value = lInp.value.toUpperCase().replace(/[^A-Z0-9]/g,''); });
      lRow.appendChild(lLbl); lRow.appendChild(lInp); formWrap.appendChild(lRow);

      // Color
      var cRow = cel('div', ''); cRow.style.cssText = 'margin-bottom:10px;';
      var cLbl = cel('div', '', 'Color'); cLbl.style.cssText = 'font-size:11px;color:#6b7a96;margin-bottom:6px;font-weight:600;text-transform:uppercase;letter-spacing:.05em;';
      var cSwatches = cel('div', ''); cSwatches.style.cssText = 'display:flex;gap:8px;flex-wrap:wrap;';
      var initColorIdx = existing ? TAG_COLORS.findIndex(function(c) { return c.hex === existing.color; }) : 0;
      if (initColorIdx < 0) initColorIdx = 0;
      selectedColorIdx = initColorIdx;
      TAG_COLORS.forEach(function(c, i) {
        var sw = cel('div', '');
        sw.style.cssText = 'width:22px;height:22px;border-radius:50%;background:' + c.hex + ';cursor:pointer;border:2px solid ' + (i === selectedColorIdx ? '#fff' : 'transparent') + ';transition:border .1s;';
        sw.dataset.idx = i;
        sw.addEventListener('click', function() {
          selectedColorIdx = i;
          cSwatches.querySelectorAll('div').forEach(function(s, j) { s.style.border = '2px solid ' + (j === i ? '#fff' : 'transparent'); });
        });
        cSwatches.appendChild(sw);
      });
      cRow.appendChild(cLbl); cRow.appendChild(cSwatches); formWrap.appendChild(cRow);

      // Icon
      var iRow = cel('div', ''); iRow.style.cssText = 'margin-bottom:10px;';
      var iLbl = cel('div', '', 'Icon'); iLbl.style.cssText = 'font-size:11px;color:#6b7a96;margin-bottom:6px;font-weight:600;text-transform:uppercase;letter-spacing:.05em;';
      var iGrid = cel('div', ''); iGrid.style.cssText = 'display:flex;flex-wrap:wrap;gap:6px;';
      var selectedIcon = existing ? existing.icon : TAG_ICON_OPTIONS[0];
      TAG_ICON_OPTIONS.forEach(function(ic) {
        var ib = cel('button', '');
        ib.textContent = ic;
        ib.style.cssText = 'width:32px;height:32px;background:' + (ic === selectedIcon ? 'rgba(170,255,62,0.15)' : 'rgba(255,255,255,0.05)') + ';border:1px solid ' + (ic === selectedIcon ? 'rgba(170,255,62,0.4)' : 'rgba(255,255,255,0.1)') + ';border-radius:6px;cursor:pointer;font-size:15px;';
        ib.addEventListener('click', function(e) { e.preventDefault();
          selectedIcon = ic;
          iGrid.querySelectorAll('button').forEach(function(b) { b.style.background = 'rgba(255,255,255,0.05)'; b.style.borderColor = 'rgba(255,255,255,0.1)'; });
          ib.style.background = 'rgba(170,255,62,0.15)'; ib.style.borderColor = 'rgba(170,255,62,0.4)';
        });
        iGrid.appendChild(ib);
      });
      iRow.appendChild(iLbl); iRow.appendChild(iGrid); formWrap.appendChild(iRow);

      // Keywords
      var kRow = cel('div', ''); kRow.style.cssText = 'margin-bottom:10px;';
      var kLbl = cel('div', '', 'Keywords (one per line — matches From, Subject, or message body)');
      kLbl.style.cssText = 'font-size:11px;color:#6b7a96;margin-bottom:4px;font-weight:600;';
      var kTa = document.createElement('textarea'); kTa.rows = 4;
      kTa.placeholder = 'e.g.\ncity council\nmayor\ncouncilmember';
      kTa.value = existing ? (existing.keywords || []).join('\n') : '';
      kTa.style.cssText = 'width:100%;box-sizing:border-box;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.1);border-radius:8px;padding:8px 10px;font-size:13px;color:#eef3fc;outline:none;font-family:inherit;resize:vertical;';
      kTa.addEventListener('focus', function() { kTa.style.borderColor = 'rgba(170,255,62,0.4)'; });
      kTa.addEventListener('blur', function() { kTa.style.borderColor = 'rgba(255,255,255,0.1)'; });
      kRow.appendChild(kLbl); kRow.appendChild(kTa); formWrap.appendChild(kRow);

      // Priority
      var pRow = cel('div', ''); pRow.style.cssText = 'display:flex;align-items:center;gap:10px;margin-bottom:14px;';
      var pChk = document.createElement('input'); pChk.type = 'checkbox';
      pChk.checked = existing ? !!existing.priority : false;
      pChk.style.cssText = 'width:16px;height:16px;accent-color:#aaff3e;cursor:pointer;';
      var pLbl2 = cel('label', '', 'Mark as priority (appears at top of inbox)');
      pLbl2.style.cssText = 'font-size:12px;color:#b0bfd8;cursor:pointer;';
      pLbl2.addEventListener('click', function() { pChk.checked = !pChk.checked; });
      pRow.appendChild(pChk); pRow.appendChild(pLbl2); formWrap.appendChild(pRow);

      // Save / Cancel
      var fAct = cel('div', ''); fAct.style.cssText = 'display:flex;gap:8px;';
      var saveBtn = cel('button', 'email-action-btn primary', 'Save Tag');
      var cancelFBtn = cel('button', 'email-action-btn', 'Cancel');
      saveBtn.addEventListener('click', function() {
        var lbl = lInp.value.trim();
        if (!lbl) { lInp.style.borderColor = 'rgba(255,80,80,0.6)'; return; }
        var kws = kTa.value.split('\n').map(function(k) { return k.trim(); }).filter(Boolean);
        if (kws.length === 0) { kTa.style.borderColor = 'rgba(255,80,80,0.6)'; return; }
        var col = TAG_COLORS[selectedColorIdx];
        var tag = { id: editingId || ('ct_' + Date.now()), label: lbl, color: col.hex, bg: col.bg, border: col.border, icon: selectedIcon, keywords: kws, priority: pChk.checked, enabled: true };
        var tags = getCustomTags();
        if (editingId) { var idx = tags.findIndex(function(t) { return t.id === editingId; }); if (idx >= 0) tags[idx] = tag; else tags.push(tag); }
        else { tags.push(tag); }
        setCustomTags(tags);
        formWrap.style.display = 'none';
        editingId = null;
        rebuildCustomList();
        _renderList(window._lastEmails || []);
      });
      cancelFBtn.addEventListener('click', function() { formWrap.style.display = 'none'; editingId = null; });
      fAct.appendChild(saveBtn); fAct.appendChild(cancelFBtn); formWrap.appendChild(fAct);
      modal.scrollTop = formWrap.offsetTop;
    }

    addBtn.addEventListener('click', function() { openForm(null); });
    rebuildCustomList();

    // ---- Built-in tags section ----
    var builtinHdr = cel('div', '', 'BUILT-IN TAGS');
    builtinHdr.style.cssText = 'font-size:11px;font-weight:700;color:#6b7a96;letter-spacing:.08em;margin-bottom:10px;';
    var builtinSub = cel('div', '', 'Toggle off tags you never use.');
    builtinSub.style.cssText = 'font-size:11px;color:#4a5568;margin-bottom:12px;margin-top:-6px;';
    var builtinGrid = cel('div', '');
    builtinGrid.style.cssText = 'display:flex;flex-direction:column;gap:6px;';

    function rebuildBuiltinList() {
      builtinGrid.innerHTML = '';
      var disabled = getDisabledBuiltins();
      var pinnedTagLabels = getPinnedTags();
      BUILTIN_RULES.forEach(function(r) {
        var row = cel('div', '');
        row.style.cssText = 'display:flex;align-items:center;gap:10px;padding:7px 10px;border-radius:8px;background:rgba(255,255,255,0.02);';
        var isOn = disabled.indexOf(r.label) === -1;
        var isPinned = pinnedTagLabels.indexOf(r.label) !== -1;
        var badge = cel('span', '');
        badge.style.cssText = 'font-size:10px;font-weight:700;padding:2px 8px;border-radius:10px;background:' + (isOn ? r.bg : 'rgba(255,255,255,0.04)') + ';color:' + (isOn ? r.color : '#4a5568') + ';border:1px solid ' + (isOn ? r.border : 'rgba(255,255,255,0.08)') + ';flex-shrink:0;min-width:64px;text-align:center;';
        badge.innerHTML = r.icon + ' ' + r.label;
        var kw = cel('div', '');
        kw.style.cssText = 'flex:1;font-size:11px;color:#4a5568;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;';
        kw.textContent = String(r.re).replace(/^\/|\/$/g,'').replace(/\\/g,'');
        // Pin button
        var pinTagBtn = cel('button', '', isPinned ? '📌' : '⬜');
        pinTagBtn.title = isPinned ? 'Unpin from top' : 'Pin to top';
        pinTagBtn.dataset.tagpin = r.label;
        pinTagBtn.style.cssText = 'background:' + (isPinned ? 'rgba(170,255,62,0.12)' : 'rgba(255,255,255,0.04)') + ';border:1px solid ' + (isPinned ? 'rgba(170,255,62,0.3)' : 'rgba(255,255,255,0.08)') + ';border-radius:6px;padding:3px 7px;cursor:pointer;font-size:12px;color:' + (isPinned ? '#aaff3e' : '#4a5568') + ';';
        pinTagBtn.addEventListener('click', function(e) {
          e.stopPropagation();
          window.toggleTagPin(r.label);
        });
        // Enable toggle
        var tog = cel('div', '');
        tog.style.cssText = 'width:36px;height:20px;border-radius:10px;background:' + (isOn ? 'rgba(170,255,62,0.3)' : 'rgba(255,255,255,0.1)') + ';border:1px solid ' + (isOn ? 'rgba(170,255,62,0.5)' : 'rgba(255,255,255,0.15)') + ';cursor:pointer;position:relative;flex-shrink:0;transition:background .2s;';
        var knob = cel('div', '');
        knob.style.cssText = 'width:14px;height:14px;border-radius:50%;background:' + (isOn ? '#aaff3e' : '#6b7a96') + ';position:absolute;top:2px;left:' + (isOn ? '18px' : '2px') + ';transition:all .2s;';
        tog.appendChild(knob);
        tog.addEventListener('click', function() {
          var d = getDisabledBuiltins();
          var idx = d.indexOf(r.label);
          if (idx === -1) d.push(r.label); else d.splice(idx, 1);
          setDisabledBuiltins(d);
          rebuildBuiltinList();
          _renderList(window._lastEmails || []);
        });
        row.appendChild(badge); row.appendChild(kw); row.appendChild(pinTagBtn); row.appendChild(tog);
        builtinGrid.appendChild(row);
      });
    }
    rebuildBuiltinList();

    modal.appendChild(xBtn); modal.appendChild(title); modal.appendChild(sub);
    modal.appendChild(custHdr); modal.appendChild(formWrap); modal.appendChild(custList);
    modal.appendChild(builtinHdr); modal.appendChild(builtinSub); modal.appendChild(builtinGrid);
    ol.appendChild(modal);
    ol.addEventListener('click', function(e) { if (e.target === ol) ol.remove(); });
    document.body.appendChild(ol);
  };

  /* ── REPLY COMPOSE MODAL ── */
  window.openReplyCompose = function(email) {
    var old = eid('esq-compose-ol'); if (old) old.remove();
    var m = (email.from || '').match(/<([^>]+)>/);
    var toAddr = m ? m[1] : (email.from || '');
    var subj = email._prefillSubject || ('Re: ' + (email.subject || ''));
    var isDraft = !email.from;

    var ol = cel('div', 'email-detail-overlay');
    ol.id = 'esq-compose-ol';
    var modal = cel('div', 'email-detail-modal');
    modal.style.cssText = 'max-width:560px;width:92%;';

    var xBtn = cel('button', 'email-detail-close', '&#x2715;');
    xBtn.addEventListener('click', function() { ol.remove(); });

    var title = cel('div', '', isDraft ? (email._prefillSubject || 'New Email') : 'Reply');
    title.style.cssText = 'font-size:16px;font-weight:700;color:#eef3fc;margin-bottom:14px;';

    var toRow = cel('div', '');
    toRow.style.cssText = 'margin-bottom:10px;';
    var toLbl = cel('div', '', 'To');
    toLbl.style.cssText = 'font-size:11px;color:#6b7a96;margin-bottom:4px;font-weight:600;letter-spacing:0.5px;text-transform:uppercase;';
    var toEl;
    if (isDraft) {
      toEl = document.createElement('input'); toEl.type = 'text';
      toEl.placeholder = 'Recipient email(s), comma-separated…'; toEl.value = email._prefillTo || '';
      toEl.style.cssText = 'width:100%;box-sizing:border-box;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.1);border-radius:8px;padding:8px 12px;font-size:13px;color:#eef3fc;outline:none;font-family:inherit;';
      toEl.addEventListener('focus', function() { toEl.style.borderColor = 'rgba(170,255,62,0.4)'; });
      toEl.addEventListener('blur', function() { toEl.style.borderColor = 'rgba(255,255,255,0.1)'; });
    } else {
      toEl = cel('div', '', escH(email.from || ''));
      toEl.style.cssText = 'background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.1);border-radius:8px;padding:8px 12px;font-size:13px;color:#eef3fc;';
    }
    toRow.appendChild(toLbl); toRow.appendChild(toEl);

    var subRow = cel('div', '');
    subRow.style.cssText = 'margin-bottom:10px;';
    var subLbl = cel('div', '', 'Subject');
    subLbl.style.cssText = 'font-size:11px;color:#6b7a96;margin-bottom:4px;font-weight:600;letter-spacing:0.5px;text-transform:uppercase;';
    var subInp = document.createElement('input');
    subInp.type = 'text'; subInp.value = subj;
    subInp.style.cssText = 'width:100%;box-sizing:border-box;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.1);border-radius:8px;padding:8px 12px;font-size:13px;color:#eef3fc;outline:none;font-family:inherit;';
    subInp.addEventListener('focus', function() { this.style.borderColor = 'rgba(170,255,62,0.4)'; });
    subInp.addEventListener('blur', function() { this.style.borderColor = 'rgba(255,255,255,0.1)'; });
    subRow.appendChild(subLbl); subRow.appendChild(subInp);

    // Original email panel (hidden by default, shown when expanded)
    var emailPanel = cel('div', '');
    emailPanel.style.cssText = 'display:none;width:45%;min-width:0;flex-shrink:0;border-right:1px solid rgba(255,255,255,0.08);padding-right:18px;margin-right:18px;overflow-y:auto;max-height:480px;';
    var epFrom = cel('div', '', escH(email.from || ''));
    epFrom.style.cssText = 'font-size:12px;color:#6b7a96;margin-bottom:6px;';
    var epSubj = cel('div', '', escH(email.subject || '(no subject)'));
    epSubj.style.cssText = 'font-size:14px;font-weight:600;color:#eef3fc;margin-bottom:10px;';
    var epBody = cel('div', '', escH(email.snippet || 'No preview available.'));
    epBody.style.cssText = 'font-size:13px;color:#b0bfd8;line-height:1.7;white-space:pre-wrap;';
    emailPanel.appendChild(epFrom); emailPanel.appendChild(epSubj); emailPanel.appendChild(epBody);

    // Compose side (always visible)
    var composePanel = cel('div', '');
    composePanel.style.cssText = 'flex:1;min-width:0;display:flex;flex-direction:column;';

    // Collapsed quote strip
    var quoteDiv = cel('div', '');
    quoteDiv.style.cssText = 'background:rgba(255,255,255,0.03);border-left:3px solid rgba(170,255,62,0.25);border-radius:0 6px 6px 0;padding:8px 12px;margin-bottom:10px;font-size:12px;color:#6b7a96;line-height:1.5;max-height:60px;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;';
    quoteDiv.textContent = email.snippet || '';

    // Expand toggle button
    var expandBtn = cel('button', 'email-action-btn', '&#x26F6; Expand Email');
    expandBtn.style.cssText = 'font-size:11px;margin-bottom:12px;padding:4px 10px;';
    var expanded = false;
    expandBtn.addEventListener('click', function() {
      expanded = !expanded;
      if (expanded) {
        modal.style.cssText = 'max-width:920px;width:96%;display:flex;flex-direction:column;';
        var inner = eid('esq-compose-inner');
        if (inner) { inner.style.cssText = 'display:flex;flex-direction:row;align-items:flex-start;flex:1;'; }
        emailPanel.style.display = 'block';
        quoteDiv.style.display = 'none';
        expandBtn.innerHTML = '&#x2715; Collapse Email';
      } else {
        modal.style.cssText = 'max-width:560px;width:92%;';
        var inner = eid('esq-compose-inner');
        if (inner) { inner.style.cssText = 'display:block;'; }
        emailPanel.style.display = 'none';
        quoteDiv.style.display = '';
        expandBtn.innerHTML = '&#x26F6; Expand Email';
      }
    });

    var bodyLbl = cel('div', '', 'Your Reply');
    bodyLbl.style.cssText = 'font-size:11px;color:#6b7a96;margin-bottom:4px;font-weight:600;letter-spacing:0.5px;text-transform:uppercase;';
    var textarea = document.createElement('textarea');
    textarea.placeholder = 'Write your reply here...';
    textarea.rows = 6;
    if (email._prefillBody) { textarea.value = email._prefillBody; textarea.rows = 10; }
    textarea.style.cssText = 'width:100%;box-sizing:border-box;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.1);border-radius:8px;padding:10px 12px;font-size:13px;color:#eef3fc;outline:none;font-family:inherit;resize:vertical;margin-bottom:8px;flex:1;';
    textarea.addEventListener('focus', function() { this.style.borderColor = 'rgba(170,255,62,0.4)'; });
    textarea.addEventListener('blur', function() { this.style.borderColor = 'rgba(255,255,255,0.1)'; });

    var ariaBtn = cel('button', 'email-action-btn', '&#x2728; ARIA: Draft Reply');
    ariaBtn.style.cssText = 'background:rgba(170,255,62,0.1);border-color:rgba(170,255,62,0.3);color:#aaff3e;font-size:12px;margin-bottom:14px;';
    ariaBtn.addEventListener('click', function() {
      ariaBtn.disabled = true; ariaBtn.textContent = 'Drafting…';
      var supaUrl = (window.SUPA_URL || 'https://kbwcsmctwtgrjtjcghkt.supabase.co');
      var supaKey = window.SUPA_KEY || '';
      fetch(supaUrl + '/functions/v1/gmail-calendar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'apikey': supaKey, 'Authorization': 'Bearer ' + supaKey },
        body: JSON.stringify({ action: 'aria_reply',
          from: (email._ariaContext || email).from || '',
          subject: (email._ariaContext || email).subject || '',
          snippet: (email._ariaContext || email).snippet || '' })
      })
      .then(function(r) { return r.json(); })
      .then(function(d) {
        var draft = d.draft || '';
        if (draft) { textarea.value = draft; textarea.style.borderColor = 'rgba(170,255,62,0.5)'; setTimeout(function() { textarea.style.borderColor = 'rgba(255,255,255,0.1)'; }, 1800); }
        ariaBtn.disabled = false; ariaBtn.innerHTML = '&#x2728; ARIA: Draft Reply';
      })
      .catch(function() { ariaBtn.disabled = false; ariaBtn.innerHTML = '&#x2728; ARIA: Draft Reply'; });
    });

    var actRow = cel('div', 'email-detail-actions');
    var cancelBtn = cel('button', 'email-action-btn', 'Cancel');
    cancelBtn.addEventListener('click', function() { ol.remove(); });
    var sendBtn2 = cel('button', 'email-action-btn primary', '&#9993; Send');
    sendBtn2.addEventListener('click', function() {
      var body = textarea.value.trim(); if (!body) return;
      var sendTo = isDraft ? (toEl.value || '').trim() : toAddr;
      if (!sendTo) { toEl.style.borderColor = 'rgba(248,113,113,0.6)'; return; }
      sendBtn2.disabled = true; sendBtn2.textContent = 'Sending…';
      fetchToken().then(function(token) {
        if (!token) { sendBtn2.disabled = false; sendBtn2.innerHTML = '&#9993; Send'; return; }
        var rawEmail = ['To: ' + sendTo, 'Subject: ' + subInp.value, 'Content-Type: text/plain; charset=utf-8', '', body].join('\n');
        var encoded = btoa(unescape(encodeURIComponent(rawEmail))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
        fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
          method: 'POST',
          headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
          body: JSON.stringify({ raw: encoded })
        })
        .then(function() { sendBtn2.innerHTML = '&#10003; Sent!'; setTimeout(function() { ol.remove(); }, 900); })
        .catch(function() { sendBtn2.disabled = false; sendBtn2.innerHTML = '&#9993; Send'; });
      });
    });
    actRow.appendChild(cancelBtn); actRow.appendChild(sendBtn2);

    composePanel.appendChild(quoteDiv);
    composePanel.appendChild(expandBtn);
    composePanel.appendChild(bodyLbl);
    composePanel.appendChild(textarea);
    composePanel.appendChild(ariaBtn);
    composePanel.appendChild(actRow);

    // Inner wrapper for flex layout when expanded
    var inner = cel('div', '');
    inner.id = 'esq-compose-inner';
    inner.appendChild(emailPanel);
    inner.appendChild(composePanel);

    modal.appendChild(xBtn); modal.appendChild(title);
    modal.appendChild(toRow); modal.appendChild(subRow);
    modal.appendChild(inner);
    ol.appendChild(modal);
    ol.addEventListener('click', function(e) { if (e.target === ol) ol.remove(); });
    document.body.appendChild(ol);
    textarea.focus();
  };

  /* ── TRASH SYSTEM ── */
  function fetchToken() {
    if (typeof window.getProviderToken === 'function') return window.getProviderToken();
    return Promise.resolve(window.providerToken || null);
  }

  window.trashEmailCard = function(emailId, btn, emailData) {
    var card = btn ? btn.closest('.email-card-v2') : null;
    if (card) card.style.cssText = 'opacity:0.3;transform:translateX(12px);transition:all .35s;';
    var log = getTrashLog(); log[emailId] = Date.now(); setTrashLog(log);
    if (emailData) { var te = getTrashEmails(); te[emailId] = emailData; setTrashEmails(te); }
    setTimeout(function() { if (card) card.remove(); window.showTrashBanner(); }, 400);
    if (getGmailSync()) {
      fetchToken().then(function(token) {
        if (!token) return;
        fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/' + emailId + '/trash', {
          method: 'POST', headers: { 'Authorization': 'Bearer ' + token }
        }).catch(function() {});
      });
    }
  };

  window.showConfirm = function(title, msg, onOk) {
    var old = eid('esq-confirm'); if (old) old.remove();
    var ol = cel('div', 'confirm-overlay');
    ol.id = 'esq-confirm';
    var box = cel('div', 'confirm-modal');
    box.innerHTML = '<h3>' + escH(title) + '</h3><p>' + escH(msg) + '</p>';
    var btns = cel('div', 'confirm-modal-btns');
    var cancel = cel('button', 'confirm-btn-cancel', 'Cancel');
    cancel.addEventListener('click', function() { ol.remove(); });
    var del = cel('button', 'confirm-btn-delete', 'Delete Forever');
    del.addEventListener('click', function() { ol.remove(); onOk(); });
    btns.appendChild(cancel); btns.appendChild(del);
    box.appendChild(btns); ol.appendChild(box);
    document.body.appendChild(ol);
  };

  window.emptyTrashNow = function() {
    var log = getTrashLog(), ids = Object.keys(log);
    if (!ids.length) return;
    window.showConfirm('Empty Trash?', 'Permanently delete all ' + ids.length + ' trashed emails. Cannot be undone.', function() {
      fetchToken().then(function(token) {
        var pd = getPermDeleted();
        ids.forEach(function(id) { pd[id] = Date.now(); });
        setPermDeleted(pd);
        setTrashLog({}); setTrashEmails({});
        var b = eid('esq-trash-banner'); if (b) b.remove();
        var v = eid('esq-trash-view'); if (v) v.remove();
        if (!token) return;
        Promise.all(ids.map(function(id) {
          return fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/' + id, { method: 'DELETE', headers: { 'Authorization': 'Bearer ' + token } }).catch(function() {});
        }));
      });
    });
  };

  window.autoPurgeTrash = function() {
    var log = getTrashLog(), now = Date.now(), cutoff = 30 * 24 * 60 * 60 * 1000;
    var old = Object.keys(log).filter(function(id) { return (now - log[id]) > cutoff; });
    if (!old.length) return;
    fetchToken().then(function(token) {
      if (!token) return;
      Promise.all(old.map(function(id) {
        return fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/' + id, { method: 'DELETE', headers: { 'Authorization': 'Bearer ' + token } })
          .then(function() { delete log[id]; }).catch(function() {});
      })).then(function() { setTrashLog(log); });
    });
  };

  window.showTrashBanner = function() {
    var log = getTrashLog(), ids = Object.keys(log);
    var old = eid('esq-trash-banner'); if (old) old.remove();
    if (!ids.length) { var v = eid('esq-trash-view'); if (v) v.remove(); return; }
    var list = eid('email-list'); if (!list || !list.parentElement) return;
    var b = cel('div', 'trash-banner');
    b.id = 'esq-trash-banner';
    var msg = ids.length + ' email' + (ids.length > 1 ? 's' : '') + ' in trash · Auto-purge after 30 days';
    var txt = cel('span', 'trash-banner-text', '&#128465;&#65039; ' + msg);
    var viewBtn = cel('button', 'trash-banner-btn', 'View Trash');
    viewBtn.addEventListener('click', window.toggleTrashView);
    var emptyBtn = cel('button', 'trash-banner-btn', 'Empty Trash');
    emptyBtn.addEventListener('click', window.emptyTrashNow);
    b.appendChild(txt); b.appendChild(viewBtn); b.appendChild(emptyBtn);
    list.parentElement.insertBefore(b, list);
  };

  window.toggleTrashView = function() {
    var existing = eid('esq-trash-view');
    if (existing) { existing.remove(); return; }
    var log = getTrashLog(), emails = getTrashEmails();
    var ids = Object.keys(log).sort(function(a, b) { return log[b] - log[a]; });
    var banner = eid('esq-trash-banner');
    var list = eid('email-list');
    if (!banner && !list) return;
    var view = cel('div', '');
    view.id = 'esq-trash-view';
    view.style.cssText = 'margin-bottom:12px;';
    var hdr = cel('div', '');
    hdr.style.cssText = 'font-family:Barlow,sans-serif;font-size:11px;font-weight:800;color:#ff8080;text-transform:uppercase;letter-spacing:.08em;padding:8px 0 6px;';
    hdr.textContent = '🗑️ Trash (' + ids.length + ') — Click Restore to move back to inbox';
    view.appendChild(hdr);
    ids.forEach(function(id) {
      var em = emails[id] || {};
      var row = cel('div', '');
      row.style.cssText = 'background:rgba(255,80,80,0.05);border:1px solid rgba(255,80,80,0.15);border-radius:10px;padding:10px 14px;margin-bottom:6px;display:flex;align-items:center;gap:10px;';
      var info = cel('div', '');
      info.style.cssText = 'flex:1;min-width:0;';
      var subj = cel('div', '', escH(em.subject || '(no subject)'));
      subj.style.cssText = 'font-size:13px;font-weight:600;color:#c0cce0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-bottom:2px;';
      var from = cel('div', '', escH(em.from || id));
      from.style.cssText = 'font-size:11px;color:#6b7a96;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;';
      info.appendChild(subj); info.appendChild(from);
      var btns = cel('div', '');
      btns.style.cssText = 'display:flex;gap:6px;flex-shrink:0;';
      var restoreBtn = cel('button', '', '↩ Restore');
      restoreBtn.style.cssText = 'font-size:11px;font-weight:700;padding:4px 10px;border-radius:7px;cursor:pointer;background:rgba(170,255,62,0.1);border:1px solid rgba(170,255,62,0.3);color:#aaff3e;font-family:DM Sans,sans-serif;';
      restoreBtn.addEventListener('click', (function(eid, r) { return function() { window.restoreEmail(eid, r); }; })(id, row));
      var delBtn = cel('button', '', '✕');
      delBtn.title = 'Delete forever';
      delBtn.style.cssText = 'font-size:11px;font-weight:700;padding:4px 9px;border-radius:7px;cursor:pointer;background:rgba(255,80,80,0.1);border:1px solid rgba(255,80,80,0.25);color:#ff8080;font-family:DM Sans,sans-serif;';
      delBtn.addEventListener('click', (function(eid, r) { return function() { window.permanentDeleteEmail(eid, r); }; })(id, row));
      btns.appendChild(restoreBtn); btns.appendChild(delBtn);
      row.appendChild(info); row.appendChild(btns);
      view.appendChild(row);
    });
    if (banner) banner.parentNode.insertBefore(view, banner.nextSibling);
    else list.parentNode.insertBefore(view, list);
  };

  window.restoreEmail = function(emailId, row) {
    if (row) { row.style.opacity = '0.4'; row.style.pointerEvents = 'none'; }
    var log = getTrashLog(); delete log[emailId]; setTrashLog(log);
    var te = getTrashEmails(); delete te[emailId]; setTrashEmails(te);
    setTimeout(function() { if (row) row.remove(); window.showTrashBanner(); }, 350);
    if (getGmailSync()) {
      fetchToken().then(function(token) {
        if (!token) return;
        fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/' + emailId + '/untrash', {
          method: 'POST', headers: { 'Authorization': 'Bearer ' + token }
        }).catch(function() {});
      });
    }
  };

  window.permanentDeleteEmail = function(emailId, row) {
    if (row) { row.style.opacity = '0.4'; row.style.pointerEvents = 'none'; }
    var log = getTrashLog(); delete log[emailId]; setTrashLog(log);
    var te = getTrashEmails(); delete te[emailId]; setTrashEmails(te);
    var pd = getPermDeleted(); pd[emailId] = Date.now(); setPermDeleted(pd);
    setTimeout(function() { if (row) row.remove(); window.showTrashBanner(); }, 350);
    fetchToken().then(function(token) {
      if (!token) return;
      fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/' + emailId, {
        method: 'DELETE', headers: { 'Authorization': 'Bearer ' + token }
      }).catch(function() {});
    });
  };

  function refreshInboxCount() {
    var list = eid('email-list');
    if (!list) return;
    var cards = list.querySelectorAll('.email-card-v2');
    var count = cards.length;
    var priority = 0;
    cards.forEach(function(c) {
      try { var d = JSON.parse(c.dataset.email || '{}'); if (getTag(d.from || '', d.subject || '', d.snippet || '').priority) priority++; } catch(e) {}
    });
    var lbl = eid('unread-count-label');
    if (lbl) lbl.textContent = count + ' unread | ' + priority + ' priority';
    var badge = eid('inbox-badge');
    if (badge) { badge.textContent = count; badge.style.display = count > 0 ? 'inline' : 'none'; }
  }

  /* ── FLY-TO-TRASH ANIMATION ── */
  function animateEmailToTrash(card, onDone) {
    var rect = card.getBoundingClientRect();
    var banner = eid('esq-trash-banner');
    var targetRect = banner ? banner.getBoundingClientRect() : { left: window.innerWidth - 76, top: 80, width: 52, height: 32 };
    var flyW = Math.min(rect.width, 280), flyH = Math.min(rect.height, 80);
    var senderEl = card.querySelector('.email-sender-name');
    var subjectEl = card.querySelector('.email-subject');
    var fly = document.createElement('div');
    fly.style.cssText = 'position:fixed;left:' + rect.left + 'px;top:' + rect.top + 'px;width:' + flyW + 'px;height:' + flyH + 'px;background:rgba(26,26,46,0.97);border:1px solid rgba(255,255,255,0.15);border-radius:12px;z-index:99998;pointer-events:none;opacity:1;box-shadow:0 8px 32px rgba(0,0,0,0.4);overflow:hidden;';
    fly.innerHTML = '<div style="padding:10px 14px;"><div style="font-size:11px;color:#a0aec0;margin-bottom:4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + escH((senderEl ? senderEl.textContent : '') || '') + '</div><div style="font-size:12px;color:#e2e8f0;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + escH((subjectEl ? subjectEl.textContent : '') || '') + '</div></div>';
    document.body.appendChild(fly);
    card.style.opacity = '0';
    var targetX = targetRect.left + targetRect.width / 2 - flyW / 2;
    var targetY = targetRect.top + targetRect.height / 2 - flyH / 2;
    requestAnimationFrame(function() {
      requestAnimationFrame(function() {
        fly.style.transition = 'left .45s cubic-bezier(.4,0,.2,1),top .45s cubic-bezier(.4,0,.2,1),width .35s cubic-bezier(.4,0,.2,1),height .35s cubic-bezier(.4,0,.2,1),opacity .3s .2s,transform .45s cubic-bezier(.4,0,.2,1)';
        fly.style.left = targetX + 'px';
        fly.style.top = targetY + 'px';
        fly.style.width = '40px';
        fly.style.height = '24px';
        fly.style.opacity = '0.1';
        fly.style.transform = 'rotate(8deg) scale(0.2)';
      });
    });
    setTimeout(function() {
      fly.remove();
      if (banner) {
        banner.style.transition = 'transform .12s ease,box-shadow .12s ease';
        banner.style.transform = 'scale(1.06)';
        banner.style.boxShadow = '0 0 0 2px rgba(170,255,62,0.4)';
        setTimeout(function() { banner.style.transform = 'scale(1)'; banner.style.boxShadow = ''; }, 150);
      }
      if (typeof onDone === 'function') onDone();
    }, 480);
  }

  /* ── EMAIL CARD RENDERER ── */
  function renderCard(email) {
    var overriddenLabel = getTagOverrides()[email.id];
    var tag = overriddenLabel ? (findTag(overriddenLabel) || getTag(email.from || '', email.subject || '', email.snippet || '')) : getTag(email.from || '', email.subject || '', email.snippet || '');
    var name = senderName(email.from || '');
    var raw = (email.from || '').match(/<([^>]+)>/);
    var addr = raw ? raw[1] : ((email.from || '').indexOf('@') > -1 ? email.from : '');
    var d = new Date(email.date), now = new Date();
    var t = isNaN(d) ? '' : (d.toDateString() === now.toDateString() ? d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }));
    var tc = tag ? ' tag-' + tag.label.toLowerCase().replace(/[^a-z]/g, '') : '';
    var div = cel('div', 'email-card-v2' + tc);
    div.style.position = 'relative';
    div.dataset.email = JSON.stringify({ id: email.id, from: email.from, subject: email.subject, snippet: email.snippet, date: email.date });
    div.dataset.emailId = email.id;
    var tagHtml = tag ? '<span class="email-type-tag" style="background:' + tag.bg + ';color:' + tag.color + ';border:1px solid ' + tag.border + ';">' + tag.icon + ' ' + tag.label + '</span>' : '';
    var bg = avatarColor(name), fc = bg.indexOf('aaff3e') > -1 ? '#1a3300' : '#fff';
    div.innerHTML =
      '<div class="esq-check" style="display:none;position:absolute;top:14px;left:14px;width:18px;height:18px;border-radius:5px;background:rgba(255,255,255,0.08);border:1.5px solid rgba(255,255,255,0.2);cursor:pointer;align-items:center;justify-content:center;z-index:2;transition:all .15s;"></div>' +
      '<div class="email-card-top">' +
        '<div class="email-avatar-v2" style="background:' + bg + ';color:' + fc + '">' + initials(name) + '</div>' +
        '<div class="email-sender-block"><div class="email-sender-name">' + escH(name) + '</div><div class="email-sender-addr">' + escH(addr) + '</div></div>' +
        '<div class="email-meta-right"><span class="email-time">' + t + '</span>' + tagHtml + '</div>' +
      '</div>' +
      '<div class="email-subject">' + escH(email.subject || '(no subject)') + '</div>' +
      '<div class="email-preview">' + escH(email.snippet || '') + '</div>';
    var cbEl = div.querySelector('.esq-check');
    cbEl.addEventListener('click', function(e) {
      e.stopPropagation();
      window.toggleEmailSelect(email.id, JSON.parse(div.dataset.email), cbEl, div);
    });
    var tagBadge = div.querySelector('.email-type-tag');
    if (tagBadge) {
      tagBadge.style.cursor = 'pointer';
      tagBadge.title = 'Click to change tag';
      tagBadge.addEventListener('click', function(e) { window.showTagPicker(e, email.id); });
    }
    var actRow = cel('div', 'email-footer-actions');
    if (tag && tag.label === 'RFI') {
      var rBtn = cel('button', 'email-action-btn primary', 'Deploy Riley &#8599;');
      rBtn.addEventListener('click', function(e) { e.stopPropagation(); if (typeof deploy === 'function') deploy(21); });
      actRow.appendChild(rBtn);
    } else if (tag && tag.label === 'GRANT') {
      var gBtn = cel('button', 'email-action-btn primary', 'Grant Writer &#8599;');
      gBtn.addEventListener('click', function(e) { e.stopPropagation(); if (typeof deploy === 'function') deploy(1); });
      actRow.appendChild(gBtn);
    }
    var replyBtn = cel('button', 'email-action-btn', 'Reply');
    replyBtn.addEventListener('click', function(e) {
      e.stopPropagation();
      window.openReplyCompose(email);
    });
    var archBtn = cel('button', 'email-action-btn', 'Archive');
    archBtn.addEventListener('click', function(e) {
      e.stopPropagation();
      var card = e.currentTarget.closest('.email-card-v2');
      if (card) { card.style.cssText = 'opacity:0.3;transform:translateX(12px);transition:all .35s;'; setTimeout(function() { card.remove(); }, 380); }
      var emailId = email.id || '';
      fetchToken().then(function(token) {
        if (!token) return;
        fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/' + emailId + '/modify', {
          method: 'POST',
          headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
          body: JSON.stringify({ removeLabelIds: ['INBOX'] })
        }).catch(function() {});
      });
    });
    var trashBtn = cel('button', 'email-action-btn danger', '&#128465; Trash');
    trashBtn.addEventListener('click', function(e) {
      e.stopPropagation();
      var card = e.currentTarget.closest('.email-card-v2');
      var emailId = email.id || '';
      var log = getTrashLog(); log[emailId] = Date.now(); setTrashLog(log);
      var te = getTrashEmails(); te[emailId] = { id: emailId, from: email.from, subject: email.subject, snippet: email.snippet, date: email.date }; setTrashEmails(te);
      if (getGmailSync()) {
        fetchToken().then(function(token) {
          if (!token) return;
          fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/' + emailId + '/trash', {
            method: 'POST', headers: { 'Authorization': 'Bearer ' + token }
          }).catch(function() {});
        });
      }
      window.showTrashBanner();
      if (card) {
        animateEmailToTrash(card, function() { card.remove(); refreshInboxCount(); });
      }
    });
    var isPinned = !!getPinned()[email.id];
    if (isPinned) div.style.borderLeft = '3px solid rgba(170,255,62,0.5)';
    var pinBtn = cel('button', 'email-action-btn', '📌');
    pinBtn.title = isPinned ? 'Unpin' : 'Pin to top';
    if (isPinned) pinBtn.style.color = '#aaff3e';
    pinBtn.addEventListener('click', function(e) {
      e.stopPropagation();
      window.togglePin(email.id, JSON.parse(div.dataset.email));
    });
    var snoozeBtn = cel('button', 'email-action-btn', '💤');
    snoozeBtn.title = 'Snooze';
    snoozeBtn.addEventListener('click', function(e) {
      e.stopPropagation();
      window.showSnoozePicker(e, email.id, JSON.parse(div.dataset.email));
    });
    actRow.appendChild(replyBtn); actRow.appendChild(archBtn); actRow.appendChild(trashBtn); actRow.appendChild(pinBtn); actRow.appendChild(snoozeBtn);
    div.appendChild(actRow);
    return div;
  }

  /* ── BULK SELECT ── */
  var selectMode = false;
  var selectedIds = {};

  function updateBulkBar() {
    var old = eid('esq-bulk-bar'); if (old) old.remove();
    var list = eid('email-list');
    if (!list || !list.parentElement || !selectMode) return;
    var count = Object.keys(selectedIds).length;
    var bar = cel('div', '');
    bar.id = 'esq-bulk-bar';
    bar.style.cssText = 'display:flex;align-items:center;gap:8px;padding:10px 14px;background:rgba(170,255,62,0.06);border:1px solid rgba(170,255,62,0.18);border-radius:10px;margin-bottom:10px;flex-wrap:wrap;';
    var countEl = cel('span', '');
    countEl.style.cssText = 'font-size:12px;font-weight:700;color:#aaff3e;flex:1;min-width:80px;';
    countEl.textContent = count ? count + ' selected' : 'Select emails below';
    bar.appendChild(countEl);
    var selAllBtn = cel('button', '', 'Select All');
    selAllBtn.style.cssText = 'font-size:11px;font-weight:700;padding:5px 12px;border-radius:7px;cursor:pointer;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.15);color:#b8c8e0;font-family:DM Sans,sans-serif;';
    selAllBtn.addEventListener('click', window.selectAllEmails);
    bar.appendChild(selAllBtn);
    if (count > 0) {
      var trashAllBtn = cel('button', '', '🗑 Trash ' + count);
      trashAllBtn.style.cssText = 'font-size:11px;font-weight:700;padding:5px 12px;border-radius:7px;cursor:pointer;background:rgba(255,80,80,0.12);border:1px solid rgba(255,80,80,0.3);color:#ff8080;font-family:DM Sans,sans-serif;';
      trashAllBtn.addEventListener('click', window.bulkTrash);
      bar.appendChild(trashAllBtn);
      var archAllBtn = cel('button', '', '📁 Archive ' + count);
      archAllBtn.style.cssText = 'font-size:11px;font-weight:700;padding:5px 12px;border-radius:7px;cursor:pointer;background:rgba(100,160,255,0.1);border:1px solid rgba(100,160,255,0.25);color:#64a0ff;font-family:DM Sans,sans-serif;';
      archAllBtn.addEventListener('click', window.bulkArchive);
      bar.appendChild(archAllBtn);
    }
    var trashBanner = eid('esq-trash-banner');
    if (trashBanner) list.parentElement.insertBefore(bar, trashBanner);
    else list.parentElement.insertBefore(bar, list);
  }

  window.toggleSelectMode = function() {
    selectMode = !selectMode;
    selectedIds = {};
    var btn = eid('inbox-select-btn');
    if (btn) {
      btn.textContent = selectMode ? 'Cancel' : 'Select';
      btn.style.background = selectMode ? 'rgba(170,255,62,0.15)' : 'rgba(255,255,255,0.06)';
      btn.style.borderColor = selectMode ? 'rgba(170,255,62,0.4)' : 'rgba(255,255,255,0.12)';
      btn.style.color = selectMode ? '#aaff3e' : '#6b7a96';
    }
    var list = eid('email-list');
    if (list) {
      list.querySelectorAll('.esq-check').forEach(function(cb) {
        cb.style.display = selectMode ? 'flex' : 'none';
        cb.style.background = 'rgba(255,255,255,0.08)';
        cb.style.borderColor = 'rgba(255,255,255,0.2)';
        cb.innerHTML = '';
      });
      list.querySelectorAll('.email-card-v2').forEach(function(card) {
        card.style.outline = '';
        card.style.background = '';
      });
    }
    updateBulkBar();
  };

  window.toggleEmailSelect = function(emailId, emailData, cbEl, cardEl) {
    if (selectedIds[emailId]) {
      delete selectedIds[emailId];
      if (cbEl) { cbEl.style.background = 'rgba(255,255,255,0.08)'; cbEl.style.borderColor = 'rgba(255,255,255,0.2)'; cbEl.innerHTML = ''; }
      if (cardEl) { cardEl.style.outline = ''; cardEl.style.background = ''; }
    } else {
      selectedIds[emailId] = emailData;
      if (cbEl) { cbEl.style.background = '#aaff3e'; cbEl.style.borderColor = '#aaff3e'; cbEl.innerHTML = '<svg width="10" height="8" viewBox="0 0 10 8" fill="none"><path d="M1 4L3.5 6.5L9 1" stroke="#0a1a00" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>'; }
      if (cardEl) { cardEl.style.outline = '1px solid rgba(170,255,62,0.3)'; cardEl.style.background = 'rgba(170,255,62,0.04)'; }
    }
    updateBulkBar();
  };

  window.selectAllEmails = function() {
    var list = eid('email-list'); if (!list) return;
    list.querySelectorAll('.email-card-v2').forEach(function(card) {
      var emailId = card.dataset.emailId;
      var emailData = card.dataset.email ? JSON.parse(card.dataset.email) : {};
      var cbEl = card.querySelector('.esq-check');
      if (!selectedIds[emailId]) {
        selectedIds[emailId] = emailData;
        if (cbEl) { cbEl.style.background = '#aaff3e'; cbEl.style.borderColor = '#aaff3e'; cbEl.innerHTML = '<svg width="10" height="8" viewBox="0 0 10 8" fill="none"><path d="M1 4L3.5 6.5L9 1" stroke="#0a1a00" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>'; }
        card.style.outline = '1px solid rgba(170,255,62,0.3)';
        card.style.background = 'rgba(170,255,62,0.04)';
      }
    });
    updateBulkBar();
  };

  window.bulkTrash = function() {
    var ids = Object.keys(selectedIds); if (!ids.length) return;
    var list = eid('email-list');
    ids.forEach(function(emailId) {
      var card = list ? list.querySelector('[data-email-id="' + emailId + '"]') : null;
      var emailData = selectedIds[emailId] || {};
      var log = getTrashLog(); log[emailId] = Date.now(); setTrashLog(log);
      var te = getTrashEmails(); te[emailId] = emailData; setTrashEmails(te);
      if (card) { card.style.cssText = 'position:relative;opacity:0;transform:translateX(16px);transition:all .3s;'; setTimeout(function() { if (card.parentNode) card.remove(); }, 320); }
      if (getGmailSync()) {
        fetchToken().then(function(token) {
          if (!token) return;
          fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/' + emailId + '/trash', {
            method: 'POST', headers: { 'Authorization': 'Bearer ' + token }
          }).catch(function() {});
        });
      }
    });
    selectedIds = {};
    setTimeout(function() { window.toggleSelectMode(); window.showTrashBanner(); refreshInboxCount(); }, 380);
  };

  window.bulkArchive = function() {
    var ids = Object.keys(selectedIds); if (!ids.length) return;
    var list = eid('email-list');
    ids.forEach(function(emailId) {
      var card = list ? list.querySelector('[data-email-id="' + emailId + '"]') : null;
      if (card) { card.style.cssText = 'position:relative;opacity:0;transform:translateX(16px);transition:all .3s;'; setTimeout(function() { if (card.parentNode) card.remove(); }, 320); }
      fetchToken().then(function(token) {
        if (!token) return;
        fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/' + emailId + '/modify', {
          method: 'POST',
          headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
          body: JSON.stringify({ removeLabelIds: ['INBOX'] })
        }).catch(function() {});
      });
    });
    selectedIds = {};
    setTimeout(function() { window.toggleSelectMode(); refreshInboxCount(); }, 380);
  };

  /* ── TAG FILTER + PIN ── */
  var activeTagFilter = null;

  function renderFilterBar(emails) {
    var old = eid('esq-filter-bar'); if (old) old.remove();
    var list = eid('email-list');
    if (!list || !list.parentElement) return;
    var trashLog = getTrashLog(), permDeleted = getPermDeleted();
    var visible = (emails || []).filter(function(e) { return !trashLog[e.id] && !permDeleted[e.id]; });
    var tagMap = {};
    var overrides = getTagOverrides();
    visible.forEach(function(e) {
      var ol = overrides[e.id];
      var t = ol ? (findTag(ol) || getTag(e.from || '', e.subject || '', e.snippet || '')) : getTag(e.from || '', e.subject || '', e.snippet || '');
      if (t && t.label && t.label !== 'EMAIL') tagMap[t.label] = t;
    });
    var labels = Object.keys(tagMap);
    if (!labels.length) return;

    var pinnedTags = getPinnedTags();
    // Pinned tags first, then the rest alphabetically
    var pinned = labels.filter(function(l) { return pinnedTags.indexOf(l) !== -1; });
    var unpinned = labels.filter(function(l) { return pinnedTags.indexOf(l) === -1; });
    var sorted = pinned.concat(unpinned);

    var bar = cel('div', '');
    bar.id = 'esq-filter-bar';
    bar.style.cssText = 'display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-bottom:10px;';

    // "All" pill
    var allBtn = cel('button', '', 'All');
    allBtn.style.cssText = 'font-size:11px;font-weight:700;padding:4px 11px;border-radius:20px;cursor:pointer;font-family:inherit;white-space:nowrap;' +
      (!activeTagFilter ? 'background:rgba(170,255,62,0.2);border:1px solid rgba(170,255,62,0.4);color:#aaff3e;' : 'background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.12);color:#6b7a96;');
    allBtn.addEventListener('click', function() { window.setTagFilter(null); });
    bar.appendChild(allBtn);

    sorted.forEach(function(label) {
      var t = tagMap[label];
      var isPinned = pinnedTags.indexOf(label) !== -1;
      var isActive = activeTagFilter === label;

      var wrap = cel('div', '');
      wrap.style.cssText = 'display:inline-flex;align-items:center;border-radius:20px;overflow:hidden;' +
        (isPinned ? 'box-shadow:0 0 0 1px rgba(170,255,62,0.4);' : '');

      var filterBtn = cel('button', '', t.icon + ' ' + label);
      filterBtn.style.cssText = 'font-size:11px;font-weight:700;padding:4px 8px 4px 11px;border-radius:0;cursor:pointer;font-family:inherit;white-space:nowrap;border:none;' +
        (isActive ? 'background:' + t.bg + ';color:' + t.color + ';' :
         isPinned ? 'background:rgba(170,255,62,0.08);color:' + t.color + ';' :
         'background:rgba(255,255,255,0.06);color:#6b7a96;');
      filterBtn.addEventListener('click', function() { window.setTagFilter(label); });

      var pinBtn = cel('button', '', isPinned ? '📌' : '⬜');
      pinBtn.title = isPinned ? 'Unpin tag' : 'Pin tag to top';
      pinBtn.dataset.tagpin = label;
      pinBtn.style.cssText = 'font-size:10px;padding:4px 7px 4px 4px;border-radius:0;cursor:pointer;border:none;border-left:1px solid rgba(255,255,255,0.08);' +
        (isPinned ? 'background:rgba(170,255,62,0.12);color:#aaff3e;' : 'background:rgba(255,255,255,0.06);color:#4a5568;');
      pinBtn.addEventListener('click', function(e) {
        e.stopPropagation();
        window.toggleTagPin(label);
      });

      wrap.appendChild(filterBtn);
      wrap.appendChild(pinBtn);
      bar.appendChild(wrap);
    });

    // Divider hint if any pinned tags exist and there are unpinned ones too
    if (pinned.length && unpinned.length) {
      var div = bar.querySelector('.esq-fb-div');
      if (!div) {
        var divEl = cel('div', '');
        divEl.className = 'esq-fb-div';
        divEl.style.cssText = 'width:1px;height:18px;background:rgba(255,255,255,0.12);margin:0 2px;align-self:center;';
        // Insert after the last pinned pill
        var pills = bar.querySelectorAll('div');
        if (pills[pinned.length]) bar.insertBefore(divEl, pills[pinned.length]);
      }
    }

    var bulkBar = eid('esq-bulk-bar'), trashBanner = eid('esq-trash-banner');
    list.parentElement.insertBefore(bar, bulkBar || trashBanner || list);
  }

  function _renderList(emails) {
    var list = eid('email-list'); if (!list) return;
    var trashLog = getTrashLog(), permDeleted = getPermDeleted();
    var snoozed = getSnoozed(), now = Date.now();
    // clear expired snoozes
    var changed = false;
    Object.keys(snoozed).forEach(function(id) { if (snoozed[id].until <= now) { delete snoozed[id]; changed = true; } });
    if (changed) setSnoozed(snoozed);
    var visible = (emails || []).filter(function(e) { return !trashLog[e.id] && !permDeleted[e.id] && !(snoozed[e.id] && snoozed[e.id].until > now); });
    var overrides = getTagOverrides();
    function emailTag(e) {
      var ol = overrides[e.id];
      return ol ? (findTag(ol) || getTag(e.from || '', e.subject || '', e.snippet || '')) : getTag(e.from || '', e.subject || '', e.snippet || '');
    }
    var filtered = activeTagFilter ? visible.filter(function(e) {
      var t = emailTag(e);
      return t && t.label === activeTagFilter;
    }) : visible;
    renderFilterBar(emails);
    list.innerHTML = '';
    if (!filtered.length) {
      list.innerHTML = '<div style="text-align:center;padding:60px;color:#4a5568;"><div style="font-size:32px;">&#128235;</div><div style="margin-top:8px;">' + (activeTagFilter ? 'No ' + activeTagFilter + ' emails' : 'No unread emails') + '</div></div>';
      return;
    }
    var pinned = getPinned();
    var pinnedTagLabels = getPinnedTags();
    var pinnedEmails = filtered.filter(function(e) { return pinned[e.id]; });
    var unpinned = filtered.filter(function(e) { return !pinned[e.id]; });
    if (pinnedEmails.length) {
      var pinHdr = cel('div', '');
      pinHdr.style.cssText = 'font-size:10px;font-weight:800;color:#aaff3e;text-transform:uppercase;letter-spacing:.1em;padding:2px 2px 8px;';
      pinHdr.textContent = '📌 Pinned';
      list.appendChild(pinHdr);
      pinnedEmails.forEach(function(e) { list.appendChild(renderCard(e)); });
      if (unpinned.length) {
        var sepDiv = cel('div', '');
        sepDiv.style.cssText = 'height:1px;background:rgba(255,255,255,0.06);margin:8px 0 10px;';
        list.appendChild(sepDiv);
      }
    }
    // Sort unpinned: pinned-tag emails first (in pinned tag order), then priority, then rest
    var tagPinnedEmails = [], priorityEmails = [], restEmails = [];
    unpinned.forEach(function(e) {
      var t = emailTag(e);
      if (pinnedTagLabels.length && t && pinnedTagLabels.indexOf(t.label) !== -1) tagPinnedEmails.push(e);
      else if (t && t.priority) priorityEmails.push(e);
      else restEmails.push(e);
    });
    // Sort tag-pinned emails by pinned tag order
    tagPinnedEmails.sort(function(a, b) {
      return pinnedTagLabels.indexOf(emailTag(a).label) - pinnedTagLabels.indexOf(emailTag(b).label);
    });
    if (tagPinnedEmails.length && !activeTagFilter) {
      var tagHdr = cel('div', '');
      tagHdr.style.cssText = 'font-size:10px;font-weight:800;color:#aaff3e;text-transform:uppercase;letter-spacing:.1em;padding:2px 2px 8px;';
      tagHdr.textContent = '🏷 Pinned Tags';
      list.appendChild(tagHdr);
      tagPinnedEmails.forEach(function(e) { list.appendChild(renderCard(e)); });
      if (priorityEmails.length || restEmails.length) {
        var sep2 = cel('div', '');
        sep2.style.cssText = 'height:1px;background:rgba(255,255,255,0.06);margin:8px 0 10px;';
        list.appendChild(sep2);
      }
    } else {
      tagPinnedEmails.forEach(function(e) { priorityEmails.unshift(e); });
    }
    priorityEmails.concat(restEmails).forEach(function(e) { list.appendChild(renderCard(e)); });
  }

  window.setTagFilter = function(tag) {
    activeTagFilter = tag;
    _renderList(window._lastEmails || []);
  };

  window.togglePin = function(emailId, emailData) {
    var pinned = getPinned();
    if (pinned[emailId]) delete pinned[emailId];
    else pinned[emailId] = emailData;
    setPinned(pinned);
    _renderList(window._lastEmails || []);
  };

  /* ── PICKER UTILITY ── */
  function makePicker(id, rect, buildFn) {
    var old = eid(id); if (old) old.remove();
    var p = cel('div', '');
    p.id = id;
    p.style.cssText = 'position:fixed;z-index:99999;background:rgba(8,12,24,0.98);border:1px solid rgba(255,255,255,0.12);border-radius:10px;padding:6px;min-width:160px;box-shadow:0 8px 32px rgba(0,0,0,0.5);backdrop-filter:blur(20px);';
    p.style.left = Math.min(rect.left, window.innerWidth - 180) + 'px';
    p.style.top = (rect.bottom + 6) + 'px';
    buildFn(p);
    document.body.appendChild(p);
    setTimeout(function() {
      document.addEventListener('click', function dismiss(ev) {
        if (!p.contains(ev.target)) { p.remove(); document.removeEventListener('click', dismiss); }
      });
    }, 0);
  }

  /* ── TAG PICKER ── */
  window.showTagPicker = function(e, emailId) {
    e.stopPropagation();
    var rect = e.currentTarget.getBoundingClientRect();
    makePicker('esq-tag-picker', rect, function(p) {
      var hdr = cel('div', '', 'Change tag');
      hdr.style.cssText = 'font-size:10px;font-weight:800;color:#6b7a96;text-transform:uppercase;letter-spacing:.08em;padding:4px 8px 6px;';
      p.appendChild(hdr);
      var pickerTags = getCustomTags().filter(function(t) { return t.enabled; }).concat(ALL_TAGS);
      pickerTags.forEach(function(t) {
        var row = cel('div', '');
        row.style.cssText = 'display:flex;align-items:center;padding:6px 8px;border-radius:7px;cursor:pointer;';
        row.onmouseover = function() { row.style.background = 'rgba(255,255,255,0.06)'; };
        row.onmouseout = function() { row.style.background = ''; };
        var badge = cel('span', '');
        badge.style.cssText = 'font-size:10px;font-weight:700;padding:2px 8px;border-radius:10px;background:' + t.bg + ';color:' + t.color + ';border:1px solid ' + t.border + ';';
        badge.innerHTML = t.icon + ' ' + t.label;
        row.appendChild(badge);
        row.addEventListener('click', function() {
          var ov = getTagOverrides(); ov[emailId] = t.label; setTagOverrides(ov);
          p.remove();
          _renderList(window._lastEmails || []);
        });
        p.appendChild(row);
      });
    });
  };

  /* ── SNOOZE ── */
  function getSnoozeOptions() {
    var now = new Date(), opts = [];
    opts.push({ label: '⏰ In 3 hours', ts: now.getTime() + 3 * 3600000 });
    var eve = new Date(now); eve.setHours(18, 0, 0, 0);
    if (now.getHours() < 17) opts.push({ label: '🌆 This evening (6 pm)', ts: eve.getTime() });
    var tmrw = new Date(now); tmrw.setDate(tmrw.getDate() + 1); tmrw.setHours(8, 0, 0, 0);
    opts.push({ label: '🌅 Tomorrow morning (8 am)', ts: tmrw.getTime() });
    var mon = new Date(now); mon.setDate(mon.getDate() + ((8 - mon.getDay()) % 7 || 7)); mon.setHours(8, 0, 0, 0);
    opts.push({ label: '📅 Next week (Mon 8 am)', ts: mon.getTime() });
    return opts;
  }

  window.showSnoozePicker = function(e, emailId, emailData) {
    e.stopPropagation();
    var rect = e.currentTarget.getBoundingClientRect();
    makePicker('esq-snooze-picker', rect, function(p) {
      var hdr = cel('div', '', 'Snooze until');
      hdr.style.cssText = 'font-size:10px;font-weight:800;color:#6b7a96;text-transform:uppercase;letter-spacing:.08em;padding:4px 8px 6px;';
      p.appendChild(hdr);
      getSnoozeOptions().forEach(function(opt) {
        var row = cel('div', '', opt.label);
        row.style.cssText = 'padding:7px 10px;border-radius:7px;cursor:pointer;font-size:12px;color:#b8c8e0;';
        row.onmouseover = function() { row.style.background = 'rgba(255,255,255,0.06)'; };
        row.onmouseout = function() { row.style.background = ''; };
        row.addEventListener('click', function() {
          var s = getSnoozed(); s[emailId] = { until: opt.ts, data: emailData }; setSnoozed(s);
          p.remove();
          _renderList(window._lastEmails || []);
          updateSnoozeBanner();
        });
        p.appendChild(row);
      });
    });
  };

  function updateSnoozeBanner() {
    var old = eid('esq-snooze-banner'); if (old) old.remove();
    var sv = eid('esq-snooze-view'); if (sv) sv.remove();
    var s = getSnoozed(), now = Date.now();
    var active = Object.keys(s).filter(function(id) { return s[id].until > now; });
    if (!active.length) return;
    var list = eid('email-list'); if (!list || !list.parentElement) return;
    var b = cel('div', ''); b.id = 'esq-snooze-banner';
    b.style.cssText = 'display:flex;align-items:center;gap:10px;padding:9px 14px;background:rgba(130,220,255,0.06);border:1px solid rgba(130,220,255,0.2);border-radius:10px;margin-bottom:10px;';
    var txt = cel('span', '');
    txt.style.cssText = 'font-size:12px;color:#82dcff;flex:1;';
    txt.textContent = '💤 ' + active.length + ' email' + (active.length > 1 ? 's' : '') + ' snoozed';
    var viewBtn = cel('button', '', 'View');
    viewBtn.style.cssText = 'font-size:11px;font-weight:700;padding:4px 10px;border-radius:7px;cursor:pointer;background:rgba(130,220,255,0.1);border:1px solid rgba(130,220,255,0.25);color:#82dcff;font-family:DM Sans,sans-serif;';
    viewBtn.addEventListener('click', function() {
      var sv2 = eid('esq-snooze-view'); if (sv2) { sv2.remove(); return; }
      var sn = getSnoozed(), n = Date.now();
      var act = Object.keys(sn).filter(function(id) { return sn[id].until > n; });
      var view = cel('div', ''); view.id = 'esq-snooze-view'; view.style.cssText = 'margin-bottom:10px;';
      var vh = cel('div', '', '💤 Snoozed — Wake Up to restore immediately');
      vh.style.cssText = 'font-size:11px;font-weight:800;color:#82dcff;text-transform:uppercase;letter-spacing:.07em;padding:4px 0 8px;';
      view.appendChild(vh);
      act.forEach(function(id) {
        var en = sn[id]; var d = new Date(en.until);
        var ts = d.toLocaleDateString('en-US', { weekday:'short', month:'short', day:'numeric' }) + ' ' + d.toLocaleTimeString('en-US', { hour:'2-digit', minute:'2-digit' });
        var row = cel('div', '');
        row.style.cssText = 'background:rgba(130,220,255,0.05);border:1px solid rgba(130,220,255,0.15);border-radius:10px;padding:10px 14px;margin-bottom:6px;display:flex;align-items:center;gap:10px;';
        var info = cel('div', ''); info.style.cssText = 'flex:1;min-width:0;';
        var subj = cel('div', '', escH((en.data && en.data.subject) || '(no subject)'));
        subj.style.cssText = 'font-size:13px;font-weight:600;color:#c0cce0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-bottom:2px;';
        var meta = cel('div', '', '⏰ ' + escH(ts)); meta.style.cssText = 'font-size:11px;color:#82dcff;';
        info.appendChild(subj); info.appendChild(meta);
        var wb = cel('button', '', '↩ Wake Up');
        wb.style.cssText = 'font-size:11px;font-weight:700;padding:4px 10px;border-radius:7px;cursor:pointer;background:rgba(170,255,62,0.1);border:1px solid rgba(170,255,62,0.3);color:#aaff3e;font-family:DM Sans,sans-serif;';
        wb.addEventListener('click', (function(eid2) { return function() {
          var s2 = getSnoozed(); delete s2[eid2]; setSnoozed(s2);
          row.remove(); updateSnoozeBanner(); _renderList(window._lastEmails || []);
        }; })(id));
        row.appendChild(info); row.appendChild(wb); view.appendChild(row);
      });
      b.insertAdjacentElement('afterend', view);
    });
    b.appendChild(txt); b.appendChild(viewBtn);
    var fb = eid('esq-filter-bar'), bb = eid('esq-bulk-bar'), tb = eid('esq-trash-banner');
    list.parentElement.insertBefore(b, fb || bb || tb || list);
  }

  /* ── INSTALL OVERRIDES ── */
  function install() {
    if (typeof window.showEmailList !== 'function' || typeof window.escHtml !== 'function') {
      setTimeout(install, 300); return;
    }
    window.showEmailList = function(emails) {
      window._lastEmails = emails;
      activeTagFilter = null;
      selectMode = false; selectedIds = {};
      var selBtn = eid('inbox-select-btn');
      if (selBtn) { selBtn.textContent = 'Select'; selBtn.style.background = 'rgba(255,255,255,0.06)'; selBtn.style.borderColor = 'rgba(255,255,255,0.12)'; selBtn.style.color = '#6b7a96'; }
      var oldBar = eid('esq-bulk-bar'); if (oldBar) oldBar.remove();
      var list = eid('email-list'); if (!list) return;
      var trashLog = getTrashLog(), permDeleted = getPermDeleted();
      var visible = (emails || []).filter(function(e) { return !trashLog[e.id] && !permDeleted[e.id]; });
      var lbl = eid('unread-count-label');
      var priorityCount = visible.filter(function(e) { return getTag(e.from || '', e.subject || '', e.snippet || '').priority; }).length;
      if (lbl) lbl.textContent = visible.length + ' unread | ' + priorityCount + ' priority';
      var badge = eid('inbox-badge');
      if (badge && visible.length > 0) { badge.textContent = visible.length; badge.style.display = 'inline'; }
      list.addEventListener('click', function(e) {
        if (e.target.closest('button') || e.target.closest('.esq-check')) return;
        var card = e.target.closest('.email-card-v2');
        if (!card) return;
        if (selectMode) {
          var cbEl = card.querySelector('.esq-check');
          window.toggleEmailSelect(card.dataset.emailId, card.dataset.email ? JSON.parse(card.dataset.email) : {}, cbEl, card);
          return;
        }
        if (!card.dataset.email) return;
        try { window.openEmailDetail(JSON.parse(card.dataset.email)); } catch (err) {}
      });
      _renderList(emails);
      setTimeout(function() { window.autoPurgeTrash(); window.showTrashBanner(); updateSnoozeBanner(); }, 600);

      /* Older emails footer */
      var list2 = eid('email-list'); if (!list2) return;
      var mode    = window._inboxMode  || 'unread';
      var curPer  = mode === 'unread' ? (window._inboxPeriod != null ? window._inboxPeriod : '7d') : (window._readPeriod != null ? window._readPeriod : '30d');
      var perLabels = { '7d':'last 7 days', '30d':'last 30 days', '90d':'last 90 days', '':'all time' };
      var foot = cel('div','');
      foot.style.cssText = 'margin-top:4px;padding:12px 14px;border:1px dashed rgba(255,255,255,0.09);border-radius:10px;display:flex;align-items:center;justify-content:space-between;gap:10px;';
      var footLbl = cel('span','', 'Showing ' + (perLabels[curPer] || curPer));
      footLbl.style.cssText = 'font-size:11px;color:#4a5568;';
      foot.appendChild(footLbl);
      if (curPer !== '') {
        var olderBtn = cel('button','', 'Load older emails →');
        olderBtn.style.cssText = 'background:transparent;border:1px solid rgba(255,255,255,0.1);color:#6b7a96;font-size:11px;font-weight:600;padding:4px 12px;border-radius:7px;cursor:pointer;font-family:inherit;';
        olderBtn.onmouseover = function(){ olderBtn.style.borderColor='rgba(170,255,62,0.3)'; olderBtn.style.color='#aaff3e'; };
        olderBtn.onmouseout  = function(){ olderBtn.style.borderColor='rgba(255,255,255,0.1)'; olderBtn.style.color='#6b7a96'; };
        olderBtn.onclick = function(){ if (typeof window.loadOlderEmails === 'function') window.loadOlderEmails(); };
        foot.appendChild(olderBtn);
      } else {
        var gmailA = document.createElement('a');
        gmailA.href = 'https://mail.google.com'; gmailA.target = '_blank';
        gmailA.textContent = 'Open Gmail for more →';
        gmailA.style.cssText = 'font-size:11px;color:#aaff3e;text-decoration:none;font-weight:600;';
        foot.appendChild(gmailA);
      }
      list2.appendChild(foot);
    };
    window.renderEmailCard = renderCard;
    injectReportBtn();
    initHomeChat();
    injectTagsBtn();
  }

  function injectTagsBtn() {
    if (eid('inbox-tags-btn')) return;
    var selBtn = eid('inbox-select-btn');
    if (!selBtn) return;
    var btn = cel('button', '', '🏷 Tags');
    btn.id = 'inbox-tags-btn';
    btn.style.cssText = 'background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.12);color:#6b7a96;border-radius:8px;padding:5px 12px;font-size:12px;cursor:pointer;font-family:inherit;';
    btn.onmouseover = function() { btn.style.color = '#aaff3e'; btn.style.borderColor = 'rgba(170,255,62,0.3)'; };
    btn.onmouseout = function() { btn.style.color = '#6b7a96'; btn.style.borderColor = 'rgba(255,255,255,0.12)'; };
    btn.addEventListener('click', function() { window.openTagManager(); });
    selBtn.insertAdjacentElement('afterend', btn);
  }

  function injectTriageBtn() {
    if (eid('inbox-triage-btn')) return;
    var tagsBtn = eid('inbox-tags-btn');
    if (!tagsBtn) return;
    var btn = cel('button', '', '✦ Triage');
    btn.id = 'inbox-triage-btn';
    btn.style.cssText = 'background:rgba(170,255,62,0.08);border:1px solid rgba(170,255,62,0.2);color:#aaff3e;border-radius:8px;padding:5px 12px;font-size:12px;cursor:pointer;font-family:inherit;font-weight:700;';
    btn.onmouseover = function() { btn.style.background = 'rgba(170,255,62,0.15)'; };
    btn.onmouseout = function() { btn.style.background = 'rgba(170,255,62,0.08)'; };
    btn.addEventListener('click', function() { runAriaTriage(btn); });
    tagsBtn.insertAdjacentElement('afterend', btn);
  }

  function showTriageLoading() {
    var old = eid('esq-triage-ol'); if (old) old.remove();
    var ol = cel('div', 'email-detail-overlay'); ol.id = 'esq-triage-ol';
    var modal = cel('div', 'email-detail-modal');
    modal.style.cssText = 'max-width:480px;width:94%;padding:0;overflow:hidden;';
    modal.innerHTML = [
      '<div style="padding:32px 28px;display:flex;flex-direction:column;align-items:center;gap:20px;text-align:center;">',
        '<div id="aria-triage-avatar" style="width:64px;height:64px;border-radius:50%;background:linear-gradient(135deg,#8fe620,#ccff7a);display:flex;align-items:center;justify-content:center;font-size:28px;box-shadow:0 0 24px rgba(170,255,62,0.45);animation:ariaTrigPulse 1.6s ease-in-out infinite;">✦</div>',
        '<div>',
          '<div style="font-size:16px;font-weight:700;color:#eef3fc;margin-bottom:8px;">Reviewing your inbox…</div>',
          '<div style="font-size:13px;color:#8a97b5;line-height:1.65;max-width:340px;">',
            'I\'m scanning each email and organizing everything by importance.',
            ' Give me just a moment.',
          '</div>',
        '</div>',
        '<div style="display:flex;gap:7px;align-items:center;margin-top:4px;">',
          '<span style="width:9px;height:9px;border-radius:50%;background:#aaff3e;animation:ariaTrigDot 1.1s ease-in-out infinite;animation-delay:0s;display:inline-block;"></span>',
          '<span style="width:9px;height:9px;border-radius:50%;background:#aaff3e;animation:ariaTrigDot 1.1s ease-in-out infinite;animation-delay:0.2s;display:inline-block;"></span>',
          '<span style="width:9px;height:9px;border-radius:50%;background:#aaff3e;animation:ariaTrigDot 1.1s ease-in-out infinite;animation-delay:0.4s;display:inline-block;"></span>',
        '</div>',
      '</div>'
    ].join('');
    if (!eid('aria-trig-anim-css')) {
      var s = document.createElement('style'); s.id = 'aria-trig-anim-css';
      s.textContent = '@keyframes ariaTrigPulse{0%,100%{box-shadow:0 0 18px rgba(170,255,62,0.4);}50%{box-shadow:0 0 36px rgba(170,255,62,0.75);transform:scale(1.06);}} @keyframes ariaTrigDot{0%,80%,100%{opacity:0.2;transform:scale(0.8);}40%{opacity:1;transform:scale(1.2);}}';
      document.head.appendChild(s);
    }
    ol.appendChild(modal);
    document.body.appendChild(ol);
    return ol;
  }

  function runAriaTriage(btn) {
    var emails = window._lastEmails || [];
    if (!emails.length) return;
    var origText = btn.innerHTML;
    btn.innerHTML = '✦ Triaging…'; btn.disabled = true;
    var loadOl = showTriageLoading();
    var triageEmails = emails.slice(0, 20).map(function(e) {
      return { from: e.from, subject: e.subject, snippet: e.snippet };
    });
    fetch('https://kbwcsmctwtgrjtjcghkt.supabase.co/functions/v1/gmail-calendar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'apikey': window.SUPA_KEY, 'Authorization': 'Bearer ' + window.SUPA_KEY },
      body: JSON.stringify({ action: 'aria_triage', emails: triageEmails })
    })
    .then(function(r) { return r.json(); })
    .then(function(d) {
      btn.innerHTML = origText; btn.disabled = false;
      loadOl.remove();
      showTriageResults(d.triage || [], emails);
    })
    .catch(function() { btn.innerHTML = origText; btn.disabled = false; loadOl.remove(); });
  }

  function showTriageResults(triage, emails) {
    var old = eid('esq-triage-ol'); if (old) old.remove();
    var COLORS = { urgent: '#f87171', today: '#facc15', later: '#4ade80', fyi: '#6b7a96' };
    var LABELS = { urgent: '🔴 Urgent', today: '🟡 Respond Today', later: '🟢 Can Wait', fyi: '⚪ FYI Only' };
    var ol = cel('div', 'email-detail-overlay'); ol.id = 'esq-triage-ol'; ol.style.zIndex = '98000';
    var modal = cel('div', 'email-detail-modal');
    modal.style.cssText = 'max-width:640px;width:96%;max-height:88vh;display:flex;flex-direction:column;padding:0;overflow:hidden;';
    var hdr = document.createElement('div');
    hdr.style.cssText = 'padding:16px 20px;border-bottom:1px solid rgba(255,255,255,0.07);display:flex;align-items:center;justify-content:space-between;flex-shrink:0;';
    hdr.innerHTML = '<div><div style="font-size:15px;font-weight:700;color:#eef3fc;">✦ ARIA Email Triage</div><div style="font-size:11px;color:#4a5568;margin-top:2px;">'+triage.length+' emails analyzed</div></div>';
    var xBtn = cel('button', 'email-detail-close', '&#x2715;');
    xBtn.style.cssText = 'position:relative;top:0;right:0;'; xBtn.onclick = function() { ol.remove(); };
    hdr.appendChild(xBtn);
    var body = document.createElement('div');
    body.style.cssText = 'flex:1;overflow-y:auto;min-height:0;padding:14px 20px;display:flex;flex-direction:column;gap:8px;';
    var groups = { urgent: [], today: [], later: [], fyi: [] };
    triage.forEach(function(t) {
      var email = emails[t.index - 1];
      if (email) groups[t.priority] = (groups[t.priority] || []);
      if (email) groups[t.priority].push({ email: email, reason: t.reason });
    });
    ['urgent','today','later','fyi'].forEach(function(p) {
      var items = groups[p]; if (!items || !items.length) return;
      var sec = document.createElement('div');
      var secHdr = document.createElement('div');
      secHdr.style.cssText = 'font-size:11px;font-weight:700;color:'+(COLORS[p])+';text-transform:uppercase;letter-spacing:.07em;margin-bottom:6px;padding-top:4px;';
      secHdr.textContent = LABELS[p] + ' (' + items.length + ')';
      sec.appendChild(secHdr);
      items.forEach(function(item) {
        var card = document.createElement('div');
        card.style.cssText = 'background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.07);border-left:3px solid '+COLORS[p]+';border-radius:8px;padding:8px 12px;cursor:pointer;';
        card.onmouseover = function() { card.style.background = 'rgba(255,255,255,0.06)'; };
        card.onmouseout = function() { card.style.background = 'rgba(255,255,255,0.03)'; };
        card.innerHTML = '<div style="font-size:12px;font-weight:600;color:#eef3fc;margin-bottom:2px;">'+escH(item.email.subject||'(no subject)')+'</div>'
          + '<div style="font-size:11px;color:#6b7a96;margin-bottom:4px;">'+escH(senderName(item.email.from||''))+'</div>'
          + '<div style="font-size:11px;color:#8a97b5;font-style:italic;">'+escH(item.reason)+'</div>';
        card.addEventListener('click', function() { window.openEmailDetail(item.email); });
        sec.appendChild(card);
      });
      body.appendChild(sec);
    });
    modal.appendChild(hdr); modal.appendChild(body);
    ol.appendChild(modal);
    ol.addEventListener('click', function(e) { if (e.target === ol) ol.remove(); });
    document.body.appendChild(ol);
  }

  install();
  setTimeout(injectReportBtn, 1500);
  setTimeout(initHomeChat, 1500);
  setTimeout(injectTagsBtn, 1500);
  setTimeout(injectTriageBtn, 1600);
})();
