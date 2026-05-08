
/* EconSquad App Extensions v05.08.1130 */
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
    var fwdDetBtn = cel('button', 'email-action-btn', '&#x27A1; Forward');
    fwdDetBtn.addEventListener('click', function() { ol.remove(); window.openForwardCompose(email); });
    var trashBtn = cel('button', 'email-action-btn danger', '&#128465; Trash');
    trashBtn.addEventListener('click', function() { var eid_ = email.id || ''; window.trashEmailCard(eid_, null, email); ol.remove(); removeFromTriage(eid_); });
    actRow.appendChild(closeBtn); actRow.appendChild(replyDetBtn); actRow.appendChild(fwdDetBtn); actRow.appendChild(trashBtn);

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
          // Resolve any remaining cid: references by fetching attachments directly
          // from Gmail API using the browser's live OAuth token — more reliable than
          // doing it server-side because the token is always fresh here.
          var cidMap  = data.cidMap || {};
          var token   = window.providerToken;
          var msgId   = email.id;

          // Find cid: refs still present in the HTML (not yet resolved server-side)
          var remaining = [];
          var cidRe = /cid:([^"'\s>]+)/gi;
          var m;
          while ((m = cidRe.exec(data.body)) !== null) {
            var cid = m[1];
            if (cidMap[cid] && remaining.indexOf(cid) === -1) remaining.push(cid);
          }

          function renderHtml(html) {
            var iframe = document.createElement('iframe');
            iframe.style.cssText = 'width:100%;border:none;background:#fff;border-radius:6px;min-height:300px;';
            bodyEl.innerHTML = '';
            bodyEl.appendChild(iframe);
            try {
              var blob = new Blob([html], { type: 'text/html; charset=utf-8' });
              var blobUrl = URL.createObjectURL(blob);
              iframe.src = blobUrl;
              iframe.onload = function() {
                try { URL.revokeObjectURL(blobUrl); } catch(e) {}
                var h = iframe.contentDocument && iframe.contentDocument.body ? iframe.contentDocument.body.scrollHeight : 400;
                iframe.style.height = Math.min(Math.max(h + 32, 200), 520) + 'px';
              };
            } catch(e) {
              iframe.srcdoc = html;
              iframe.onload = function() {
                var h = iframe.contentDocument && iframe.contentDocument.body ? iframe.contentDocument.body.scrollHeight : 400;
                iframe.style.height = Math.min(Math.max(h + 32, 200), 520) + 'px';
              };
            }
          }

          if (!remaining.length || !token) {
            renderHtml(data.body);
            return;
          }

          // Fetch each attachment directly from Gmail API
          Promise.all(remaining.map(function(cid) {
            var info = cidMap[cid];
            return fetch(
              'https://gmail.googleapis.com/gmail/v1/users/me/messages/' + msgId + '/attachments/' + info.attachmentId,
              { headers: { 'Authorization': 'Bearer ' + token } }
            )
            .then(function(r) { return r.json(); })
            .then(function(att) {
              if (!att.data) return null;
              var b64 = att.data.replace(/-/g, '+').replace(/_/g, '/');
              return { cid: cid, dataUri: 'data:' + info.mimeType + ';base64,' + b64 };
            })
            .catch(function() { return null; });
          }))
          .then(function(results) {
            var html = data.body;
            results.forEach(function(r) {
              if (!r) return;
              var esc = r.cid.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
              html = html.replace(new RegExp('cid:' + esc, 'gi'), r.dataUri);
            });
            renderHtml(html);
          });
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

    var title = cel('div', '', email._title || (isDraft ? (email._prefillSubject || 'New Email') : 'Reply'));
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

    var bodyLbl = cel('div', '', email._bodyLabel || 'Your Reply');
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

    /* Append Gmail signature if no prefill body */
    if (!email._prefillBody) {
      fetchGmailSignature(function(sig) {
        if (sig && !textarea.value.trim()) {
          textarea.value = '\n\n' + sig;
          textarea.setSelectionRange(0, 0);
          textarea.scrollTop = 0;
        }
      });
    }
  };

  /* ── FORWARD COMPOSE ── */
  window.openForwardCompose = function(email) {
    var fwdHeader = [
      '',
      '',
      '---------- Forwarded Message ----------',
      'From: ' + (email.from || ''),
      'Subject: ' + (email.subject || '(no subject)'),
      '',
      email.snippet || ''
    ].join('\n');

    window.openReplyCompose({
      from: '',                                          // blank → isDraft=true → editable To field
      _title: '&#x27A1; Forward',
      _bodyLabel: 'Your Message',
      _prefillSubject: 'Fwd: ' + (email.subject || ''),
      _prefillTo: '',
      _prefillBody: fwdHeader,
      _ariaContext: email,                              // lets ARIA Draft use original context
      subject: email.subject,
      snippet: email.snippet,
      id: email.id,
    });
  };

  /* ── TRASH SYSTEM ── */
  function fetchToken() {
    if (typeof window.getProviderToken === 'function') return window.getProviderToken();
    return Promise.resolve(window.providerToken || null);
  }

  /* ── Gmail signature fetch (cached) ── */
  var _gmailSigCache = undefined; // undefined = not yet fetched, null = fetched but empty

  function fetchGmailSignature(cb) {
    if (_gmailSigCache !== undefined) { cb(_gmailSigCache || ''); return; }
    fetchToken().then(function(token) {
      if (!token) { _gmailSigCache = null; cb(''); return; }
      fetch('https://gmail.googleapis.com/gmail/v1/users/me/settings/sendAs', {
        headers: { 'Authorization': 'Bearer ' + token }
      })
      .then(function(r) { return r.json(); })
      .then(function(d) {
        var list = d.sendAs || [];
        var primary = null;
        for (var i = 0; i < list.length; i++) { if (list[i].isPrimary) { primary = list[i]; break; } }
        if (!primary && list.length) primary = list[0];
        var sigHtml = (primary && primary.signature) || '';
        /* convert HTML → plain text */
        var plain = sigHtml
          .replace(/<br\s*\/?>/gi, '\n')
          .replace(/<\/p>/gi, '\n')
          .replace(/<\/div>/gi, '\n')
          .replace(/<[^>]+>/g, '')
          .replace(/&nbsp;/g, ' ')
          .replace(/&amp;/g, '&')
          .replace(/&lt;/g, '<')
          .replace(/&gt;/g, '>')
          .replace(/&quot;/g, '"')
          .replace(/&#39;/g, "'")
          .replace(/\n{3,}/g, '\n\n')
          .trim();
        _gmailSigCache = plain || null;
        cb(plain);
      })
      .catch(function() { _gmailSigCache = null; cb(''); });
    });
  }

  /* Pre-warm the cache shortly after load */
  setTimeout(function() { fetchGmailSignature(function(){}); }, 4000);

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
    var rsbBadge = eid('esq-rsb-email-badge');
    if (rsbBadge) { rsbBadge.textContent = count > 99 ? '99+' : count; rsbBadge.style.display = count > 0 ? 'inline-block' : 'none'; }
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
    var fwdBtn = cel('button', 'email-action-btn', '&#x27A1; Forward');
    fwdBtn.addEventListener('click', function(e) {
      e.stopPropagation();
      window.openForwardCompose(email);
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
    actRow.appendChild(replyBtn); actRow.appendChild(fwdBtn); actRow.appendChild(archBtn); actRow.appendChild(trashBtn); actRow.appendChild(pinBtn); actRow.appendChild(snoozeBtn);
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

  /* ── INBOX AUTO-REFRESH ─────────────────────────────────────────── */
  var _inboxLastRefreshed  = 0;
  var _inboxAutoRefreshTmr = null;
  var _inboxStatusInterv   = null;

  /* Re-run current mode/period without resetting anything */
  window._lightRefreshInbox = function() {
    var token = window.providerToken || window._providerToken;
    if (!token || !window.currentUser) {
      if (typeof loadInbox === 'function') loadInbox();
      return;
    }
    var mode = window._inboxMode || 'unread';
    if (mode === 'read' && typeof loadReadEmailList === 'function') {
      loadReadEmailList(token, window._readPeriod != null ? window._readPeriod : '30d');
    } else if (mode === 'sent' && typeof loadSentEmailList === 'function') {
      loadSentEmailList(token, window._sentPeriod != null ? window._sentPeriod : '30d');
    } else if (typeof loadEmailList === 'function') {
      loadEmailList(token, window._inboxPeriod != null ? window._inboxPeriod : '7d');
    }
  };

  function updateInboxStatusEl() {
    var el = eid('esq-inbox-status');
    if (!el) return;
    if (!_inboxLastRefreshed) { el.textContent = ''; return; }
    var sec = Math.floor((Date.now() - _inboxLastRefreshed) / 1000);
    if (sec < 30)        el.textContent = '· updated just now';
    else if (sec < 90)   el.textContent = '· updated < 1 min ago';
    else if (sec < 3540) el.textContent = '· updated ' + Math.floor(sec / 60) + ' min ago';
    else                 el.textContent = '· updated ' + Math.floor(sec / 3600) + 'h ago';
  }

  function injectInboxStatusEl() {
    if (eid('esq-inbox-status')) return;
    var btn = document.querySelector('button[onclick="refreshInbox()"]');
    if (!btn) return;
    var sp = cel('span', '');
    sp.id = 'esq-inbox-status';
    sp.style.cssText = 'font-size:10px;color:#4a5568;margin-left:6px;white-space:nowrap;';
    btn.insertAdjacentElement('afterend', sp);
  }

  function scheduleInboxAutoRefresh() {
    /* Clear any previous timers */
    if (_inboxAutoRefreshTmr) { clearTimeout(_inboxAutoRefreshTmr); _inboxAutoRefreshTmr = null; }
    if (_inboxStatusInterv)   { clearInterval(_inboxStatusInterv);  _inboxStatusInterv = null; }

    /* Update "X ago" label every 30 s */
    _inboxStatusInterv = setInterval(function() {
      var tab = document.getElementById('inbox-tab');
      if (tab && tab.style.display !== 'none') updateInboxStatusEl();
    }, 30000);

    /* Auto-refresh after 2 minutes if inbox tab still visible */
    _inboxAutoRefreshTmr = setTimeout(function() {
      var tab = document.getElementById('inbox-tab');
      if (tab && tab.style.display !== 'none') window._lightRefreshInbox();
    }, 2 * 60 * 1000);
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
      /* sync sidebar email badge */
      var rsbBadge = eid('esq-rsb-email-badge');
      if (rsbBadge) {
        if (visible.length > 0) { rsbBadge.textContent = visible.length > 99 ? '99+' : visible.length; rsbBadge.style.display = 'inline-block'; }
        else { rsbBadge.style.display = 'none'; }
      }
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
      var curPer  = mode === 'unread' ? (window._inboxPeriod != null ? window._inboxPeriod : '7d')
                  : mode === 'sent'   ? (window._sentPeriod  != null ? window._sentPeriod  : '30d')
                  :                     (window._readPeriod  != null ? window._readPeriod  : '30d');
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

      /* ── Auto-refresh tracking ── */
      _inboxLastRefreshed = Date.now();
      injectInboxStatusEl();
      updateInboxStatusEl();
      scheduleInboxAutoRefresh();
    };

    /* Override refreshInbox so it preserves the current period/mode */
    window.refreshInbox = function() {
      window._lightRefreshInbox();
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

  function injectComposeBtn() {
    if (eid('inbox-compose-btn')) return;
    var triageBtn = eid('inbox-triage-btn');
    if (!triageBtn) return;
    var btn = cel('button', '', '✉ Compose');
    btn.id = 'inbox-compose-btn';
    btn.style.cssText = 'background:var(--lime,#aaff3e);border:none;color:#1a3300;border-radius:8px;padding:5px 14px;font-size:12px;cursor:pointer;font-family:inherit;font-weight:800;letter-spacing:0.01em;';
    btn.onmouseover = function() { btn.style.opacity = '0.88'; };
    btn.onmouseout  = function() { btn.style.opacity = '1'; };
    btn.addEventListener('click', function() { window.openNewCompose(); });
    triageBtn.insertAdjacentElement('afterend', btn);
  }

  /* ── NEW EMAIL COMPOSE MODAL ── */
  window.openNewCompose = function(prefill) {
    prefill = prefill || {};
    var old = eid('esq-new-compose-ol'); if (old) old.remove();

    var ol = cel('div', 'email-detail-overlay');
    ol.id = 'esq-new-compose-ol';
    var modal = cel('div', 'email-detail-modal');
    modal.style.cssText = 'max-width:580px;width:92%;';

    var xBtn = cel('button', 'email-detail-close', '&#x2715;');
    xBtn.addEventListener('click', function() { ol.remove(); });

    var title = cel('div', 'email-detail-title', '✉ New Email');
    title.style.cssText = 'font-size:15px;font-weight:800;color:#eef3fc;margin-bottom:16px;';

    // ── To ──
    var toRow = cel('div', '');
    toRow.style.cssText = 'display:flex;align-items:center;gap:8px;margin-bottom:8px;';
    var toLbl = cel('span', '', 'To');
    toLbl.style.cssText = 'font-size:11px;font-weight:700;color:#6b7a96;text-transform:uppercase;letter-spacing:0.5px;width:40px;flex-shrink:0;';
    var toInp = document.createElement('input');
    toInp.type = 'email'; toInp.placeholder = 'recipient@example.com';
    toInp.value = prefill.to || '';
    toInp.style.cssText = 'flex:1;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.1);border-radius:8px;padding:7px 10px;font-size:13px;color:#eef3fc;outline:none;font-family:inherit;';
    toInp.addEventListener('focus', function() { this.style.borderColor = 'rgba(170,255,62,0.4)'; });
    toInp.addEventListener('blur',  function() { this.style.borderColor = 'rgba(255,255,255,0.1)'; });
    toRow.appendChild(toLbl); toRow.appendChild(toInp);

    // ── CC ──
    var ccVisible = !!(prefill.cc);
    var ccRow = cel('div', '');
    ccRow.style.cssText = 'display:' + (ccVisible ? 'flex' : 'none') + ';align-items:center;gap:8px;margin-bottom:8px;';
    var ccLbl = cel('span', '', 'CC');
    ccLbl.style.cssText = 'font-size:11px;font-weight:700;color:#6b7a96;text-transform:uppercase;letter-spacing:0.5px;width:40px;flex-shrink:0;';
    var ccInp = document.createElement('input');
    ccInp.type = 'email'; ccInp.placeholder = 'cc@example.com';
    ccInp.value = prefill.cc || '';
    ccInp.style.cssText = toInp.style.cssText;
    ccInp.addEventListener('focus', function() { this.style.borderColor = 'rgba(170,255,62,0.4)'; });
    ccInp.addEventListener('blur',  function() { this.style.borderColor = 'rgba(255,255,255,0.1)'; });
    ccRow.appendChild(ccLbl); ccRow.appendChild(ccInp);

    // ── Subject ──
    var subjRow = cel('div', '');
    subjRow.style.cssText = 'display:flex;align-items:center;gap:8px;margin-bottom:12px;';
    var subjLbl = cel('span', '', 'Subject');
    subjLbl.style.cssText = 'font-size:11px;font-weight:700;color:#6b7a96;text-transform:uppercase;letter-spacing:0.5px;width:40px;flex-shrink:0;';
    var subjInp = document.createElement('input');
    subjInp.type = 'text'; subjInp.placeholder = 'Email subject';
    subjInp.value = prefill.subject || '';
    subjInp.style.cssText = toInp.style.cssText;
    subjInp.addEventListener('focus', function() { this.style.borderColor = 'rgba(170,255,62,0.4)'; });
    subjInp.addEventListener('blur',  function() { this.style.borderColor = 'rgba(255,255,255,0.1)'; });
    subjRow.appendChild(subjLbl); subjRow.appendChild(subjInp);

    // ── CC toggle ──
    var ccToggle = cel('button', '', '+ CC');
    ccToggle.style.cssText = 'background:transparent;border:none;color:#6b7a96;font-size:11px;font-weight:600;cursor:pointer;padding:0;margin-bottom:10px;text-decoration:underline;font-family:inherit;';
    ccToggle.addEventListener('click', function() {
      ccVisible = !ccVisible;
      ccRow.style.display = ccVisible ? 'flex' : 'none';
      ccToggle.textContent = ccVisible ? '− Remove CC' : '+ CC';
      if (ccVisible) ccInp.focus();
    });

    // ── Body ──
    var bodyLbl = cel('div', '', 'Message');
    bodyLbl.style.cssText = 'font-size:11px;color:#6b7a96;margin-bottom:4px;font-weight:600;letter-spacing:0.5px;text-transform:uppercase;';
    var textarea = document.createElement('textarea');
    textarea.placeholder = 'Write your message here, or let ARIA draft it for you…';
    textarea.rows = 8;
    textarea.value = prefill.body || '';
    textarea.style.cssText = 'width:100%;box-sizing:border-box;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.1);border-radius:8px;padding:10px 12px;font-size:13px;color:#eef3fc;outline:none;font-family:inherit;resize:vertical;margin-bottom:8px;';
    textarea.addEventListener('focus', function() { this.style.borderColor = 'rgba(170,255,62,0.4)'; });
    textarea.addEventListener('blur',  function() { this.style.borderColor = 'rgba(255,255,255,0.1)'; });

    // ── ARIA Draft button ──
    var ariaBtn = cel('button', 'email-action-btn', '✦ ARIA: Draft This Email');
    ariaBtn.style.cssText = 'background:rgba(170,255,62,0.1);border:1px solid rgba(170,255,62,0.3);color:#aaff3e;font-size:12px;margin-bottom:14px;border-radius:8px;padding:7px 14px;cursor:pointer;font-family:inherit;font-weight:700;';
    ariaBtn.addEventListener('click', function() {
      var to      = toInp.value.trim();
      var subject = subjInp.value.trim();
      if (!subject) { subjInp.style.borderColor = 'rgba(248,113,113,0.6)'; subjInp.focus(); return; }
      ariaBtn.disabled = true; ariaBtn.textContent = 'Drafting…';
      var supaUrl = (window.SUPA_URL || 'https://kbwcsmctwtgrjtjcghkt.supabase.co');
      var supaKey = window.SUPA_KEY || '';
      fetch(supaUrl + '/functions/v1/gmail-calendar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'apikey': supaKey, 'Authorization': 'Bearer ' + supaKey },
        body: JSON.stringify({ action: 'aria_compose', to: to, subject: subject, existing: textarea.value.trim() })
      })
      .then(function(r) { return r.json(); })
      .then(function(d) {
        var draft = d.draft || '';
        if (draft) {
          textarea.value = draft;
          textarea.style.borderColor = 'rgba(170,255,62,0.5)';
          setTimeout(function() { textarea.style.borderColor = 'rgba(255,255,255,0.1)'; }, 1800);
        }
        ariaBtn.disabled = false; ariaBtn.innerHTML = '✦ ARIA: Draft This Email';
      })
      .catch(function() { ariaBtn.disabled = false; ariaBtn.innerHTML = '✦ ARIA: Draft This Email'; });
    });

    // ── Action row ──
    var actRow = cel('div', 'email-detail-actions');
    actRow.style.cssText = 'display:flex;align-items:center;justify-content:space-between;gap:8px;margin-top:4px;';

    var leftBtns = cel('div', '');
    leftBtns.style.cssText = 'display:flex;gap:8px;';
    var cancelBtn = cel('button', 'email-action-btn', 'Cancel');
    cancelBtn.addEventListener('click', function() { ol.remove(); });
    leftBtns.appendChild(cancelBtn);

    var sendBtn = cel('button', 'email-action-btn primary', '&#9993; Send');
    sendBtn.style.cssText = 'background:var(--lime,#aaff3e);border:none;color:#1a3300;font-size:13px;font-weight:800;padding:8px 20px;border-radius:8px;cursor:pointer;font-family:inherit;';
    sendBtn.addEventListener('click', function() {
      var to      = toInp.value.trim();
      var subject = subjInp.value.trim();
      var body    = textarea.value.trim();
      var cc      = ccInp.value.trim();
      if (!to)      { toInp.style.borderColor   = 'rgba(248,113,113,0.6)'; toInp.focus();   return; }
      if (!subject) { subjInp.style.borderColor = 'rgba(248,113,113,0.6)'; subjInp.focus(); return; }
      if (!body)    { textarea.style.borderColor = 'rgba(248,113,113,0.6)'; textarea.focus(); return; }

      sendBtn.disabled = true; sendBtn.textContent = 'Sending…';
      fetchToken().then(function(token) {
        if (!token) { sendBtn.disabled = false; sendBtn.innerHTML = '&#9993; Send'; return; }
        var headers = ['To: ' + to, 'Subject: ' + subject, 'Content-Type: text/plain; charset=utf-8'];
        if (cc) headers.push('Cc: ' + cc);
        headers.push('', body);
        var rawEmail = headers.join('\n');
        var encoded  = btoa(unescape(encodeURIComponent(rawEmail))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
        fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
          method: 'POST',
          headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
          body: JSON.stringify({ raw: encoded })
        })
        .then(function() {
          sendBtn.innerHTML = '&#10003; Sent!';
          setTimeout(function() { ol.remove(); }, 900);
        })
        .catch(function() { sendBtn.disabled = false; sendBtn.innerHTML = '&#9993; Send'; });
      });
    });

    actRow.appendChild(leftBtns);
    actRow.appendChild(sendBtn);

    modal.appendChild(xBtn);
    modal.appendChild(title);
    modal.appendChild(toRow);
    modal.appendChild(ccRow);
    modal.appendChild(ccToggle);
    modal.appendChild(subjRow);
    modal.appendChild(bodyLbl);
    modal.appendChild(textarea);
    modal.appendChild(ariaBtn);
    modal.appendChild(actRow);
    ol.appendChild(modal);
    ol.addEventListener('click', function(e) { if (e.target === ol) ol.remove(); });
    document.body.appendChild(ol);
    toInp.focus();

    /* Append Gmail signature if textarea is empty */
    if (!prefill.body) {
      fetchGmailSignature(function(sig) {
        if (sig && !textarea.value.trim()) {
          textarea.value = '\n\n' + sig;
          textarea.setSelectionRange(0, 0);
          textarea.scrollTop = 0;
        }
      });
    }
  };

  /* Remove a single email card from the open triage list (called after trash/delete) */
  function removeFromTriage(emailId) {
    if (!emailId) return;
    var triageOl = eid('esq-triage-ol');
    if (!triageOl) return;
    var card = triageOl.querySelector('[data-email-id="' + emailId + '"]');
    if (!card) return;
    var sec = card.parentElement;
    /* Animate out */
    card.style.opacity = '0';
    card.style.transform = 'translateX(16px)';
    setTimeout(function() {
      card.remove();
      /* If the section has no more cards, remove the whole section */
      if (sec && sec.querySelectorAll('[data-email-id]').length === 0) sec.remove();
      /* Update count in modal header */
      var remaining = triageOl.querySelectorAll('[data-email-id]').length;
      var countEl = eid('esq-triage-count');
      if (countEl) {
        countEl.textContent = remaining > 0
          ? remaining + ' email' + (remaining !== 1 ? 's' : '') + ' remaining'
          : '✅ All triaged!';
        if (remaining === 0) countEl.style.color = '#4ade80';
      }
      /* If list is fully empty, show done state in body */
      if (remaining === 0) {
        var bodyEl = triageOl.querySelector('[style*="overflow-y"]');
        if (bodyEl) {
          bodyEl.innerHTML = '<div style="text-align:center;padding:40px 20px;color:#4ade80;font-size:13px;font-weight:600;">✅ All emails have been triaged!</div>';
        }
      }
    }, 260);
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
    hdr.innerHTML = '<div><div style="font-size:15px;font-weight:700;color:#eef3fc;">✦ ARIA Email Triage</div><div id="esq-triage-count" style="font-size:11px;color:#4a5568;margin-top:2px;">'+triage.length+' emails analyzed</div></div>';
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
        card.dataset.emailId = item.email.id || '';
        card.style.cssText = 'background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.07);border-left:3px solid '+COLORS[p]+';border-radius:8px;padding:8px 12px;cursor:pointer;transition:opacity .25s,transform .25s;';
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

  /* ═══════════════════════════════════════════════════════════════════════
     ✦  ARIA WELCOME SPLASH SCREEN
  ═══════════════════════════════════════════════════════════════════════ */
  window.showWelcomeSplash = function(firstName) {
    /* Only show once per browser session */
    try { if (sessionStorage.getItem('esq_splash_shown')) return; sessionStorage.setItem('esq_splash_shown', '1'); } catch(e) {}

    var hour = new Date().getHours();
    var greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
    var name = firstName ? (', ' + firstName) : '';

    /* ── Web Audio engine — deep & mysterious ─────────────────────────── */
    var _ctx = null; var _humNodes = []; var _dismissed = false;
    function _initAudio() {
      try { _ctx = new (window.AudioContext || window.webkitAudioContext)(); if (_ctx.state === 'suspended') _ctx.resume(); } catch(e) { _ctx = null; }
    }
    /* Master limiter so bass frequencies never clip */
    function _master() {
      if (!_ctx) return null;
      var comp = _ctx.createDynamicsCompressor();
      comp.threshold.value = -3; comp.knee.value = 3;
      comp.ratio.value = 3; comp.attack.value = 0.005; comp.release.value = 0.3;
      comp.connect(_ctx.destination);
      return comp;
    }
    function _playWarmup() {
      if (!_ctx) return;
      var dest = _master();
      var t = _ctx.currentTime;
      /* Sub-bass rumble that wakes up — like a turbine starting deep underground */
      var sub = _ctx.createOscillator(), subG = _ctx.createGain();
      sub.type = 'sine'; sub.frequency.setValueAtTime(32, t); sub.frequency.linearRampToValueAtTime(48, t + 3.0);
      subG.gain.setValueAtTime(0, t); subG.gain.linearRampToValueAtTime(0.7, t + 1.2);
      subG.gain.linearRampToValueAtTime(0.35, t + 3.0); subG.gain.linearRampToValueAtTime(0, t + 4.0);
      sub.connect(subG); subG.connect(dest); sub.start(t); sub.stop(t + 4.1);
      /* Filtered sawtooth body — low and warm, like a reactor spooling */
      var body = _ctx.createOscillator(), bodyG = _ctx.createGain(), bodyF = _ctx.createBiquadFilter();
      bodyF.type = 'lowpass'; bodyF.frequency.setValueAtTime(120, t + 0.8); bodyF.frequency.linearRampToValueAtTime(280, t + 3.2); bodyF.Q.value = 2;
      body.type = 'sawtooth'; body.frequency.setValueAtTime(38, t + 0.6); body.frequency.exponentialRampToValueAtTime(78, t + 3.0);
      bodyG.gain.setValueAtTime(0, t + 0.6); bodyG.gain.linearRampToValueAtTime(0.22, t + 1.4);
      bodyG.gain.linearRampToValueAtTime(0.10, t + 3.0); bodyG.gain.linearRampToValueAtTime(0, t + 3.8);
      body.connect(bodyF); bodyF.connect(bodyG); bodyG.connect(dest); body.start(t + 0.6); body.stop(t + 3.9);
      /* Mysterious resonant tone — low theremin-like bloom */
      var res = _ctx.createOscillator(), resG = _ctx.createGain(), resF = _ctx.createBiquadFilter();
      resF.type = 'bandpass'; resF.Q.value = 5; resF.frequency.setValueAtTime(82, t + 1.5); resF.frequency.linearRampToValueAtTime(146, t + 3.5);
      res.type = 'sine'; res.frequency.setValueAtTime(82, t + 1.5); res.frequency.linearRampToValueAtTime(110, t + 3.5);
      resG.gain.setValueAtTime(0, t + 1.5); resG.gain.linearRampToValueAtTime(0.45, t + 2.4);
      resG.gain.linearRampToValueAtTime(0.18, t + 3.5); resG.gain.linearRampToValueAtTime(0, t + 4.2);
      res.connect(resF); resF.connect(resG); resG.connect(dest); res.start(t + 1.5); res.stop(t + 4.3);
      /* Deep arrival bloom — low warm chord (A1 + E2) fades in as warmup completes */
      var ch1 = _ctx.createOscillator(), ch1G = _ctx.createGain();
      ch1.type = 'sine'; ch1.frequency.value = 55; /* A1 */
      ch1G.gain.setValueAtTime(0, t + 2.8); ch1G.gain.linearRampToValueAtTime(0.38, t + 3.6); ch1G.gain.linearRampToValueAtTime(0, t + 5.0);
      ch1.connect(ch1G); ch1G.connect(dest); ch1.start(t + 2.8); ch1.stop(t + 5.1);
      var ch2 = _ctx.createOscillator(), ch2G = _ctx.createGain();
      ch2.type = 'sine'; ch2.frequency.value = 82.4; /* E2 — a fifth up, adds mystery */
      ch2G.gain.setValueAtTime(0, t + 3.0); ch2G.gain.linearRampToValueAtTime(0.22, t + 3.8); ch2G.gain.linearRampToValueAtTime(0, t + 5.0);
      ch2.connect(ch2G); ch2G.connect(dest); ch2.start(t + 3.0); ch2.stop(t + 5.1);
    }
    function _startHum() {
      if (!_ctx) return;
      var dest = _master(); var t = _ctx.currentTime;
      /* Deep bass foundation — 38Hz sub-bass + detuned pair at 55/56.5Hz for warmth + 82Hz fifth */
      var specs = [
        { freq: 38,   type: 'sine', gain: 0.55, rise: 3.5 },
        { freq: 55,   type: 'sine', gain: 0.35, rise: 3.0 },
        { freq: 56.5, type: 'sine', gain: 0.18, rise: 3.0 }, /* slight detune — adds thickness */
        { freq: 82.4, type: 'sine', gain: 0.14, rise: 4.0 }, /* E2 fifth — mysterious color */
      ];
      specs.forEach(function(sp) {
        var o = _ctx.createOscillator(), g = _ctx.createGain();
        o.type = sp.type; o.frequency.value = sp.freq;
        g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(sp.gain, t + sp.rise);
        o.connect(g); g.connect(dest); o.start();
        _humNodes.push({ osc: o, gain: g });
      });
    }
    function _stopHum() {
      if (!_ctx) return;
      var t = _ctx.currentTime;
      _humNodes.forEach(function(n) {
        try { n.gain.gain.linearRampToValueAtTime(0, t + 0.8); n.osc.stop(t + 0.9); } catch(e) {}
      });
      _humNodes = [];
    }
    function _playClick() {
      /* Deep satisfying thok — like a heavy relay closing */
      if (!_ctx) return;
      var dest = _master(); var t = _ctx.currentTime;
      var o = _ctx.createOscillator(), g = _ctx.createGain();
      o.type = 'sine';
      o.frequency.setValueAtTime(160, t); o.frequency.exponentialRampToValueAtTime(55, t + 0.10);
      g.gain.setValueAtTime(0.75, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.14);
      o.connect(g); g.connect(dest); o.start(t); o.stop(t + 0.15);
      /* Low-passed noise transient — gives it body */
      try {
        var buf = _ctx.createBuffer(1, Math.floor(_ctx.sampleRate * 0.07), _ctx.sampleRate);
        var d = buf.getChannelData(0);
        for (var ii = 0; ii < d.length; ii++) d[ii] = (Math.random() * 2 - 1) * Math.pow(1 - ii / d.length, 1.5);
        var src = _ctx.createBufferSource(); src.buffer = buf;
        var flt = _ctx.createBiquadFilter(); flt.type = 'lowpass'; flt.frequency.value = 350;
        var ng = _ctx.createGain(); ng.gain.value = 0.4;
        src.connect(flt); flt.connect(ng); ng.connect(dest); src.start(t);
      } catch(e) {}
    }
    function _playWhoosh() {
      /* Deep descending whoosh + bass thump as she vanishes */
      if (!_ctx) return;
      var dest = _master(); var t = _ctx.currentTime;
      /* Bass thump first */
      var thump = _ctx.createOscillator(), thumpG = _ctx.createGain();
      thump.type = 'sine'; thump.frequency.setValueAtTime(60, t); thump.frequency.exponentialRampToValueAtTime(28, t + 0.35);
      thumpG.gain.setValueAtTime(0.9, t); thumpG.gain.exponentialRampToValueAtTime(0.001, t + 0.4);
      thump.connect(thumpG); thumpG.connect(dest); thump.start(t); thump.stop(t + 0.45);
      /* Filtered noise whoosh — descends from mid to sub */
      try {
        var dur = 1.3;
        var buf = _ctx.createBuffer(1, Math.floor(_ctx.sampleRate * dur), _ctx.sampleRate);
        var d = buf.getChannelData(0);
        for (var ii = 0; ii < d.length; ii++) d[ii] = Math.random() * 2 - 1;
        var src = _ctx.createBufferSource(); src.buffer = buf;
        var flt = _ctx.createBiquadFilter(); flt.type = 'lowpass'; flt.Q.value = 1.2;
        flt.frequency.setValueAtTime(700, t); flt.frequency.exponentialRampToValueAtTime(40, t + dur);
        var g = _ctx.createGain();
        g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.8, t + 0.12);
        g.gain.exponentialRampToValueAtTime(0.001, t + dur);
        src.connect(flt); flt.connect(g); g.connect(dest); src.start(t); src.stop(t + dur + 0.05);
      } catch(e) {}
    }
    _initAudio();

    /* ── Keyframe styles ────────────────────────────────────────────────── */
    if (!document.getElementById('esq-splash-css')) {
      var s = document.createElement('style');
      s.id = 'esq-splash-css';
      s.textContent = [
        '@keyframes ariaSplashFadeUp{from{opacity:0;transform:translateY(14px);}to{opacity:1;transform:translateY(0);}}',
        '@keyframes ariaSplashFloat{0%,100%{transform:translateY(0);}50%{transform:translateY(-10px);}}',
        '@keyframes ariaSplashShrink{0%{opacity:1;transform:scale(1);}60%{opacity:1;transform:scale(0.04) translateY(-100px);}100%{opacity:0;transform:scale(0.01) translateY(-140px);}}',
        '@keyframes ariaSplashOverlayOut{from{opacity:1;}to{opacity:0;}}',
        '@keyframes starTwinkle{0%,100%{opacity:0.1;}50%{opacity:0.6;}}',
        '@keyframes splashOrb{0%,100%{box-shadow:0 0 40px rgba(170,255,62,0.8),0 0 80px rgba(170,255,62,0.4),0 0 140px rgba(170,255,62,0.2);}50%{box-shadow:0 0 70px rgba(170,255,62,1),0 0 130px rgba(170,255,62,0.6),0 0 200px rgba(170,255,62,0.25);}}',
        '@keyframes splashOrbPowerup{0%{opacity:0.05;box-shadow:none;filter:brightness(0.15);}20%{opacity:0.5;filter:brightness(0.4);}40%{opacity:0.25;filter:brightness(0.2);}60%{opacity:0.8;filter:brightness(0.7);}75%{opacity:0.55;filter:brightness(0.45);}90%{opacity:0.95;filter:brightness(0.95);}100%{opacity:1;filter:brightness(1);box-shadow:0 0 40px rgba(170,255,62,0.8),0 0 80px rgba(170,255,62,0.4);}}',
        '@keyframes splashOrbWink{0%{transform:scaleY(1);}30%{transform:scaleY(0.07) scaleX(1.14);}62%{transform:scaleY(0.07) scaleX(1.14);}84%{transform:scaleY(1.09);}100%{transform:scaleY(1);}}',
        '@keyframes splashRing{0%,100%{opacity:0.25;transform:scale(1);}50%{opacity:0.6;transform:scale(1.05);}}',
        '@keyframes splashSwirl1{from{transform:rotate(0deg);}to{transform:rotate(360deg);}}',
        '@keyframes splashSwirl2{from{transform:rotate(0deg);}to{transform:rotate(-360deg);}}',
        '@keyframes splashSwirl3{from{transform:rotate(45deg);}to{transform:rotate(405deg);}}',
        '@keyframes splashSmoke{0%,100%{opacity:0.06;transform:scale(1) rotate(0deg);}33%{opacity:0.14;transform:scale(1.08) rotate(120deg);}66%{opacity:0.08;transform:scale(0.95) rotate(240deg);}}',
        '@keyframes splashCheckPop{0%{transform:scale(0) rotate(-20deg);opacity:0;}70%{transform:scale(1.3) rotate(5deg);}100%{transform:scale(1) rotate(0deg);opacity:1;}}',
        '@keyframes splashStatusIn{from{opacity:0;transform:translateX(-12px);}to{opacity:1;transform:translateX(0);}}',
        '@keyframes splashPulse{0%,100%{opacity:1;}50%{opacity:0.3;}}',
        '@keyframes splashCursorIn{from{opacity:0;transform:scale(0.7);}to{opacity:1;transform:scale(1);}}',
        '@keyframes splashCursorClick{0%{transform:scale(1);}40%{transform:scale(0.78);}100%{transform:scale(1);}}',
      ].join('');
      document.head.appendChild(s);
    }

    /* ── Overlay ────────────────────────────────────────────────────────── */
    var overlay = document.createElement('div');
    overlay.id = 'esq-splash-overlay';
    overlay.style.cssText = 'position:fixed;inset:0;z-index:99999;background:radial-gradient(ellipse at 50% 40%,#0a1628 0%,#04050d 70%);display:flex;flex-direction:column;align-items:center;justify-content:center;overflow:hidden;';

    /* Star field */
    var stars = document.createElement('div');
    stars.style.cssText = 'position:absolute;inset:0;pointer-events:none;';
    for (var i = 0; i < 80; i++) {
      var star = document.createElement('div');
      var sz = Math.random() * 2.5 + 0.5, dl = Math.random() * 4, dr = 2 + Math.random() * 3;
      star.style.cssText = 'position:absolute;border-radius:50%;background:#aaff3e;width:'+sz+'px;height:'+sz+'px;left:'+(Math.random()*100)+'%;top:'+(Math.random()*100)+'%;animation:starTwinkle '+dr+'s '+dl+'s ease-in-out infinite;opacity:0.15;';
      stars.appendChild(star);
    }
    overlay.appendChild(stars);

    /* ── Main content ────────────────────────────────────────────────────── */
    var content = document.createElement('div');
    content.id = 'esq-splash-content';
    content.style.cssText = 'display:flex;flex-direction:column;align-items:center;text-align:center;padding:0 24px;max-width:700px;';

    /* ARIA ORB */
    var iconWrap = document.createElement('div');
    iconWrap.style.cssText = 'margin-bottom:28px;animation:ariaSplashFloat 4.5s ease-in-out infinite;position:relative;width:300px;height:300px;display:flex;align-items:center;justify-content:center;flex-shrink:0;';

    function makeRing(size, opacity, delay, dur) {
      var r = document.createElement('div');
      r.style.cssText = 'position:absolute;border-radius:50%;border:1px solid rgba(170,255,62,'+opacity+');width:'+size+'px;height:'+size+'px;animation:splashRing '+(dur||3)+'s ease-in-out infinite '+delay+'s;';
      return r;
    }
    iconWrap.appendChild(makeRing(300, 0.08, 0, 3.8));
    iconWrap.appendChild(makeRing(260, 0.12, 0.4, 3.5));
    iconWrap.appendChild(makeRing(220, 0.16, 0.8, 3.2));
    iconWrap.appendChild(makeRing(178, 0.22, 1.2, 2.9));
    iconWrap.appendChild(makeRing(138, 0.28, 1.6, 2.6));

    /* Swirl containers */
    var swirlWrap1 = document.createElement('div');
    swirlWrap1.style.cssText = 'position:absolute;width:220px;height:220px;border-radius:50%;animation:splashSwirl1 14s linear infinite;';
    var sw1 = document.createElement('div');
    sw1.style.cssText = 'position:absolute;top:-18px;left:50%;transform:translateX(-50%);width:80px;height:40px;border-radius:50%;background:radial-gradient(ellipse,rgba(170,255,62,0.18) 0%,transparent 70%);filter:blur(14px);';
    swirlWrap1.appendChild(sw1);
    var swirlWrap2 = document.createElement('div');
    swirlWrap2.style.cssText = 'position:absolute;width:180px;height:180px;border-radius:50%;animation:splashSwirl2 10s linear infinite;';
    var sw2 = document.createElement('div');
    sw2.style.cssText = 'position:absolute;bottom:-14px;right:-10px;width:60px;height:30px;border-radius:50%;background:radial-gradient(ellipse,rgba(170,255,62,0.15) 0%,transparent 70%);filter:blur(12px);';
    swirlWrap2.appendChild(sw2);
    var swirlWrap3 = document.createElement('div');
    swirlWrap3.style.cssText = 'position:absolute;width:240px;height:100px;border-radius:50%;animation:splashSwirl3 18s linear infinite;';
    var sw3 = document.createElement('div');
    sw3.style.cssText = 'position:absolute;top:0;left:-20px;width:100px;height:36px;border-radius:50%;background:radial-gradient(ellipse,rgba(170,255,62,0.1) 0%,transparent 70%);filter:blur(18px);';
    swirlWrap3.appendChild(sw3);
    var smoke = document.createElement('div');
    smoke.style.cssText = 'position:absolute;width:260px;height:260px;border-radius:50%;background:radial-gradient(circle,rgba(170,255,62,0.07) 0%,transparent 65%);filter:blur(24px);animation:splashSmoke 8s ease-in-out infinite;';
    iconWrap.appendChild(smoke);
    iconWrap.appendChild(swirlWrap1);
    iconWrap.appendChild(swirlWrap2);
    iconWrap.appendChild(swirlWrap3);

    /* Orb — slow power-up flicker then steady glow */
    var orb = document.createElement('div');
    orb.id = 'esq-splash-orb';
    orb.style.cssText = 'position:relative;width:130px;height:130px;border-radius:50%;'
      +'background:radial-gradient(circle at 35% 35%,#d4ff70,#aaff3e 50%,#5a9900);'
      +'animation:splashOrbPowerup 2.2s ease-out forwards, splashOrb 3.5s ease-in-out 2.2s infinite;'
      +'display:flex;align-items:center;justify-content:center;z-index:2;';
    orb.innerHTML = '<svg width="52" height="52" viewBox="0 0 24 24" fill="rgba(0,40,0,0.55)"><path d="M12 2 L13.5 9 L20 12 L13.5 15 L12 22 L10.5 15 L4 12 L10.5 9 Z"/></svg>';
    iconWrap.appendChild(orb);
    content.appendChild(iconWrap);

    /* ARIA name */
    var nameEl = document.createElement('div');
    nameEl.style.cssText = 'font-family:Barlow Condensed,Barlow,sans-serif;font-size:clamp(56px,10vw,100px);font-weight:900;color:#aaff3e;letter-spacing:-.02em;line-height:1;margin-bottom:4px;text-shadow:0 0 60px rgba(170,255,62,0.4);opacity:0;animation:ariaSplashFadeUp .6s .4s ease forwards;';
    nameEl.textContent = 'ARIA';
    content.appendChild(nameEl);

    /* Tagline */
    var tagEl = document.createElement('div');
    tagEl.style.cssText = 'font-family:Barlow,sans-serif;font-size:clamp(11px,1.6vw,14px);font-weight:600;color:#4a5568;letter-spacing:.18em;text-transform:uppercase;margin-bottom:28px;opacity:0;animation:ariaSplashFadeUp .6s .9s ease forwards;';
    tagEl.textContent = 'AI Economic Development Squad';
    content.appendChild(tagEl);

    /* ── Power-up status panel ─────────────────────────────────────────── */
    var statusPanel = document.createElement('div');
    statusPanel.style.cssText = 'width:340px;display:flex;flex-direction:column;margin-bottom:28px;background:rgba(10,22,40,0.75);border:1px solid rgba(170,255,62,0.12);border-radius:14px;overflow:hidden;opacity:0;animation:ariaSplashFadeUp .5s 1.6s ease forwards;';

    var statusHdr = document.createElement('div');
    statusHdr.style.cssText = 'padding:10px 16px 9px;border-bottom:1px solid rgba(170,255,62,0.08);display:flex;align-items:center;gap:8px;';
    var statusDot = document.createElement('div');
    statusDot.style.cssText = 'width:7px;height:7px;border-radius:50%;background:#aaff3e;animation:splashPulse 1.1s ease-in-out infinite;';
    var statusLbl = document.createElement('span');
    statusLbl.style.cssText = 'font-family:Barlow,sans-serif;font-size:10px;font-weight:800;color:#aaff3e;text-transform:uppercase;letter-spacing:.14em;';
    statusLbl.textContent = 'Powering up';
    statusHdr.appendChild(statusDot); statusHdr.appendChild(statusLbl);
    statusPanel.appendChild(statusHdr);

    /* Status items — spaced 1.4s apart, each takes 1.2s to resolve */
    var statusItems = [
      { icon: '📧', label: 'Analyzing your inbox',   doneLabel: 'Emails analyzed',     delay: 2.4 },
      { icon: '📅', label: 'Syncing your calendar',  doneLabel: 'Calendar considered',  delay: 3.8 },
      { icon: '✅', label: 'Reviewing your tasks',   doneLabel: 'Tasks reviewed',       delay: 5.2 },
      { icon: '⚡', label: 'Squad standing by',       doneLabel: 'Squad ready',          delay: 6.5 },
    ];
    var statusEls = [];
    statusItems.forEach(function(item, idx) {
      var row = document.createElement('div');
      row.style.cssText = 'display:flex;align-items:center;gap:10px;padding:10px 16px;border-bottom:1px solid rgba(255,255,255,0.04);opacity:0;animation:splashStatusIn .4s '+item.delay+'s ease forwards;';
      var rowIcon = document.createElement('span');
      rowIcon.style.cssText = 'font-size:14px;width:20px;text-align:center;flex-shrink:0;';
      rowIcon.textContent = item.icon;
      var rowText = document.createElement('span');
      rowText.style.cssText = 'font-family:Barlow,sans-serif;font-size:12px;color:#6b7a96;flex:1;';
      rowText.textContent = item.label + '...';
      var rowCheck = document.createElement('span');
      rowCheck.style.cssText = 'font-size:13px;opacity:0;color:#aaff3e;font-weight:800;flex-shrink:0;';
      rowCheck.textContent = '✓';
      row.appendChild(rowIcon); row.appendChild(rowText); row.appendChild(rowCheck);
      statusPanel.appendChild(row);
      var captured = { row: row, text: rowText, check: rowCheck, item: item, idx: idx };
      statusEls.push(captured);

      /* Appear sound */
      setTimeout(_playClick, item.delay * 1000);

      /* Resolve to done after 1.2s */
      setTimeout(function(el) { return function() {
        el.text.style.cssText = 'font-family:Barlow,sans-serif;font-size:12px;color:#b8c8e0;flex:1;';
        el.text.textContent = el.item.doneLabel;
        el.check.style.animation = 'splashCheckPop .35s ease forwards';
        el.check.style.opacity = '1';
        el.row.style.borderBottomColor = 'rgba(170,255,62,0.05)';
        _playClick();
        /* Last item done → header goes green + solid */
        if (el.idx === 3) {
          statusDot.style.animation = 'none';
          statusDot.style.boxShadow = '0 0 6px #aaff3e';
          statusLbl.textContent = 'Online';
        }
      }; }(captured), (item.delay + 1.2) * 1000);
    });
    content.appendChild(statusPanel);

    /* ── Greeting lines ───────────────────────────────────────────────── */
    var msgWrap = document.createElement('div');
    msgWrap.style.cssText = 'display:flex;flex-direction:column;gap:6px;margin-bottom:36px;text-align:center;';
    var greetDelay = 8.8;
    var msgLines = [
      { text: greeting + name + '.', color: '#eef3fc', size: 'clamp(19px,3vw,26px)', weight: '700', d: greetDelay },
      { text: "I'm here to make your work more efficient", color: '#8a97b5', size: 'clamp(13px,2vw,17px)', weight: '400', d: greetDelay + 0.65 },
      { text: 'and your days less stressful.', color: '#8a97b5', size: 'clamp(13px,2vw,17px)', weight: '400', d: greetDelay + 1.25 },
      { text: "Less work. More impact. Let's make today count.", color: '#aaff3e', size: 'clamp(13px,2vw,16px)', weight: '800', d: greetDelay + 2.0 },
    ];
    msgLines.forEach(function(ml) {
      var p = document.createElement('div');
      p.style.cssText = 'font-family:Barlow,sans-serif;font-size:'+ml.size+';font-weight:'+ml.weight+';color:'+ml.color+';line-height:1.55;opacity:0;animation:ariaSplashFadeUp .65s '+ml.d+'s ease forwards;';
      p.textContent = ml.text;
      msgWrap.appendChild(p);
    });
    content.appendChild(msgWrap);

    /* ── CTA Button ───────────────────────────────────────────────────── */
    var btn = document.createElement('button');
    var btnDelay = greetDelay + 3.2;
    btn.style.cssText = 'font-family:Barlow,sans-serif;font-size:15px;font-weight:800;'
      + 'background:#aaff3e;color:#0a1a00;border:none;padding:14px 48px;border-radius:50px;'
      + 'cursor:pointer;letter-spacing:.04em;opacity:0;'
      + 'animation:ariaSplashFadeUp .6s ' + btnDelay + 's ease forwards;'
      + 'box-shadow:0 0 32px rgba(170,255,62,0.35);transition:transform .15s,box-shadow .15s;';
    btn.textContent = "Let's get started →";
    btn.onmouseover = function() { btn.style.transform='scale(1.05)'; btn.style.boxShadow='0 0 48px rgba(170,255,62,0.55)'; };
    btn.onmouseout  = function() { btn.style.transform=''; btn.style.boxShadow='0 0 32px rgba(170,255,62,0.35)'; };
    content.appendChild(btn);

    /* Skip hint */
    var skip = document.createElement('div');
    skip.style.cssText = 'position:absolute;bottom:24px;right:32px;font-size:11px;color:#2a3448;font-family:Barlow,sans-serif;cursor:pointer;letter-spacing:.06em;text-transform:uppercase;transition:color .2s;';
    skip.textContent = 'Skip';
    skip.onmouseover = function() { skip.style.color='#4a5568'; };
    skip.onmouseout  = function() { skip.style.color='#2a3448'; };
    overlay.appendChild(skip);
    overlay.appendChild(content);
    document.body.appendChild(overlay);

    /* ── Sound schedule ───────────────────────────────────────────────── */
    setTimeout(_playWarmup, 300);
    setTimeout(_startHum, 2800);

    /* ── Dismiss ──────────────────────────────────────────────────────── */
    function dismiss() {
      if (_dismissed) return; _dismissed = true;
      _stopHum();
      _playWhoosh();
      content.style.animation = 'ariaSplashShrink 1.0s cubic-bezier(.4,0,.2,1) forwards';
      setTimeout(function() {
        overlay.style.animation = 'ariaSplashOverlayOut .6s ease forwards';
        setTimeout(function() {
          overlay.remove();
          if (typeof window.showDashTab === 'function') {
            window.showDashTab('inbox-tab', document.getElementById('dash-nav-inbox'));
          }
        }, 600);
      }, 900);
    }
    btn.addEventListener('click', function(e) { e.stopPropagation(); clearTimeout(autoTimer); clearTimeout(cursorTimer); dismiss(); });
    skip.addEventListener('click', function(e) { e.stopPropagation(); clearTimeout(autoTimer); clearTimeout(cursorTimer); dismiss(); });

    /* ── Animated cursor + wink sequence ─────────────────────────────── */
    var cursorTimer = null;
    var cursorEl = null;
    var autoTimer = null;

    /* Cursor glides in from lower-right ~1.8s after button appears */
    cursorTimer = setTimeout(function() {
      cursorEl = document.createElement('div');
      cursorEl.style.cssText = 'position:fixed;pointer-events:none;z-index:100001;animation:splashCursorIn .35s ease forwards;';
      cursorEl.innerHTML = '<svg width="24" height="30" viewBox="0 0 24 30" fill="white" style="filter:drop-shadow(0 2px 6px rgba(0,0,0,0.7))"><path d="M0 0 L0 26 L6 20 L11 29 L14.5 27 L9.5 18 L17 18 Z"/><path d="M0 0 L0 26 L6 20 L11 29 L14.5 27 L9.5 18 L17 18 Z" fill="none" stroke="rgba(170,255,62,0.5)" stroke-width="0.5"/></svg>';

      /* Start position: lower-right of screen */
      var startX = window.innerWidth * 0.82;
      var startY = window.innerHeight * 0.78;
      cursorEl.style.left = startX + 'px';
      cursorEl.style.top  = startY + 'px';
      document.body.appendChild(cursorEl);

      /* After cursor appears, glide to button over 1.4s */
      setTimeout(function() {
        var btnRect = btn.getBoundingClientRect();
        var targetX = btnRect.left + btnRect.width * 0.55;
        var targetY = btnRect.top  + btnRect.height * 0.45;
        cursorEl.style.transition = 'left 1.4s cubic-bezier(0.25,0.8,0.25,1), top 1.4s cubic-bezier(0.25,0.8,0.25,1)';
        cursorEl.style.left = targetX + 'px';
        cursorEl.style.top  = targetY + 'px';

        /* After arriving — pause, then click */
        setTimeout(function() {
          cursorEl.style.animation = 'splashCursorClick .22s ease forwards';
          _playClick();
          btn.style.transform = 'scale(0.94)';
          btn.style.boxShadow = '0 0 60px rgba(170,255,62,0.7)';

          /* Button springs back, orb winks */
          setTimeout(function() {
            btn.style.transform = 'scale(1.06)';
            setTimeout(function() { btn.style.transform = ''; btn.style.boxShadow = '0 0 32px rgba(170,255,62,0.35)'; }, 150);

            /* Wink */
            orb.style.animation = 'splashOrbWink 0.75s ease, splashOrb 3.5s ease-in-out 0.75s infinite';

            /* Cursor fades out */
            setTimeout(function() {
              if (cursorEl) { cursorEl.style.transition += ',opacity .3s'; cursorEl.style.opacity = '0'; }
            }, 250);

            /* Dismiss with whoosh */
            setTimeout(function() {
              if (cursorEl) { try { cursorEl.remove(); } catch(e) {} }
              dismiss();
            }, 700);
          }, 200);
        }, 1550); /* time for cursor to travel + brief hover */
      }, 400); /* initial pause after cursor appears */
    }, (btnDelay + 1.8) * 1000);

    /* Safety net auto-dismiss if anything goes wrong */
    autoTimer = setTimeout(dismiss, (btnDelay + 6.5) * 1000);
  };

  install();
  setTimeout(injectReportBtn, 1500);
  setTimeout(initHomeChat, 1500);
  setTimeout(injectTagsBtn, 1500);
  setTimeout(injectTriageBtn, 1600);
  setTimeout(injectComposeBtn, 1700);

  /* ═══════════════════════════════════════════════════════════════════════
     🔔  NOTIFICATION MODULE
  ═══════════════════════════════════════════════════════════════════════ */
  var _notifPollTimer     = null;
  var _notifMeetTimers    = [];
  var _notifKnownIds      = null;   // null = first run (seed only)
  var NOTIF_KEY           = 'esq_notif_settings';
  var NOTIF_DEFAULTS      = {
    enabled:           false,
    email_enabled:     true,
    email_interval:    10,        // minutes
    email_priority:    true,      // priority emails only
    meeting_enabled:   true,
    meeting_reminder:  10,        // minutes before start
    sound_enabled:     true,
    sound_type:        'chime',   // chime | futuristic | soft | ding | pulse | custom
    sound_custom_url:  null       // base64 data URL for custom sound
  };

  /* ── Sound catalogue ─────────────────────────────────────────────── */
  var SOUND_TYPES = [
    { id: 'chime',      emoji: '🔔', label: 'Classic Chime',  desc: 'Warm ascending 3-note' },
    { id: 'futuristic', emoji: '⚡', label: 'Futuristic',     desc: 'Sci-fi frequency sweep' },
    { id: 'soft',       emoji: '🌙', label: 'Soft & Subtle',  desc: 'Gentle whisper tone' },
    { id: 'ding',       emoji: '✨', label: 'Bright Ding',    desc: 'Crisp single chime' },
    { id: 'pulse',      emoji: '🎵', label: 'Deep Pulse',     desc: 'Low two-beat tone' },
    { id: 'custom',     emoji: '📁', label: 'Custom Sound',   desc: 'Upload your own file' },
  ];

  function getNotifSettings() {
    try { return Object.assign({}, NOTIF_DEFAULTS, JSON.parse(localStorage.getItem(NOTIF_KEY) || '{}')); }
    catch(e) { return Object.assign({}, NOTIF_DEFAULTS); }
  }
  function saveNotifSettings(s) {
    try { localStorage.setItem(NOTIF_KEY, JSON.stringify(s)); } catch(e) {}
  }

  /* ── Sound engine ────────────────────────────────────────────────── */

  /* Classic Chime — warm C5→E5→G5 ascending triplet */
  function synthChime(ctx) {
    [[523.25, 0], [659.25, 0.13], [783.99, 0.26]].forEach(function(pair) {
      var osc = ctx.createOscillator(), gain = ctx.createGain();
      osc.connect(gain); gain.connect(ctx.destination);
      osc.type = 'sine'; osc.frequency.value = pair[0];
      var t = ctx.currentTime + pair[1];
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(0.28, t + 0.025);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.42);
      osc.start(t); osc.stop(t + 0.48);
    });
  }

  /* Futuristic — rising sci-fi sweep with harmonic shimmer */
  function synthFuturistic(ctx) {
    var t0 = ctx.currentTime;
    // Primary: fast rising sweep
    var osc1 = ctx.createOscillator(), g1 = ctx.createGain();
    osc1.connect(g1); g1.connect(ctx.destination);
    osc1.type = 'sawtooth';
    osc1.frequency.setValueAtTime(180, t0);
    osc1.frequency.exponentialRampToValueAtTime(1400, t0 + 0.22);
    osc1.frequency.exponentialRampToValueAtTime(700, t0 + 0.38);
    g1.gain.setValueAtTime(0, t0);
    g1.gain.linearRampToValueAtTime(0.18, t0 + 0.04);
    g1.gain.exponentialRampToValueAtTime(0.001, t0 + 0.55);
    osc1.start(t0); osc1.stop(t0 + 0.6);
    // Shimmer: detuned sine for sparkle
    var osc2 = ctx.createOscillator(), g2 = ctx.createGain();
    osc2.connect(g2); g2.connect(ctx.destination);
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(1400, t0 + 0.22);
    osc2.frequency.exponentialRampToValueAtTime(1800, t0 + 0.45);
    g2.gain.setValueAtTime(0, t0 + 0.20);
    g2.gain.linearRampToValueAtTime(0.12, t0 + 0.26);
    g2.gain.exponentialRampToValueAtTime(0.001, t0 + 0.65);
    osc2.start(t0 + 0.20); osc2.stop(t0 + 0.7);
  }

  /* Soft & Subtle — barely-there whisper chord */
  function synthSoft(ctx) {
    var t0 = ctx.currentTime;
    [[440, 0], [660, 0.06]].forEach(function(pair) {
      var osc = ctx.createOscillator(), gain = ctx.createGain();
      osc.connect(gain); gain.connect(ctx.destination);
      osc.type = 'sine'; osc.frequency.value = pair[0];
      var t = t0 + pair[1];
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(0.09, t + 0.06);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.9);
      osc.start(t); osc.stop(t + 1.0);
    });
  }

  /* Bright Ding — crisp single high chime */
  function synthDing(ctx) {
    var t0 = ctx.currentTime;
    var osc = ctx.createOscillator(), gain = ctx.createGain();
    osc.connect(gain); gain.connect(ctx.destination);
    osc.type = 'sine'; osc.frequency.value = 1318.5; // E6
    gain.gain.setValueAtTime(0, t0);
    gain.gain.linearRampToValueAtTime(0.35, t0 + 0.005);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + 0.55);
    osc.start(t0); osc.stop(t0 + 0.6);
    // Subtle overtone for bell character
    var osc2 = ctx.createOscillator(), g2 = ctx.createGain();
    osc2.connect(g2); g2.connect(ctx.destination);
    osc2.type = 'sine'; osc2.frequency.value = 2637; // E7
    g2.gain.setValueAtTime(0, t0);
    g2.gain.linearRampToValueAtTime(0.07, t0 + 0.004);
    g2.gain.exponentialRampToValueAtTime(0.001, t0 + 0.2);
    osc2.start(t0); osc2.stop(t0 + 0.25);
  }

  /* Deep Pulse — two low bass tones with a beat between them */
  function synthPulse(ctx) {
    var t0 = ctx.currentTime;
    [[130.81, 0], [196.00, 0.2]].forEach(function(pair) { // C3, G3
      var osc = ctx.createOscillator(), gain = ctx.createGain();
      osc.connect(gain); gain.connect(ctx.destination);
      osc.type = 'triangle'; osc.frequency.value = pair[0];
      var t = t0 + pair[1];
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(0.30, t + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.40);
      osc.start(t); osc.stop(t + 0.45);
    });
  }

  /* Dispatch to the right synth, or play custom audio file */
  function playSound(type, customUrl) {
    type = type || 'chime';
    if (type === 'custom' && customUrl) {
      try {
        var audio = new Audio(customUrl);
        audio.volume = 0.7;
        audio.play().catch(function() {});
      } catch(e) {}
      return;
    }
    try {
      var ctx = new (window.AudioContext || window.webkitAudioContext)();
      if      (type === 'futuristic') synthFuturistic(ctx);
      else if (type === 'soft')       synthSoft(ctx);
      else if (type === 'ding')       synthDing(ctx);
      else if (type === 'pulse')      synthPulse(ctx);
      else                            synthChime(ctx);   // default: chime
    } catch(e) {}
  }

  /* Legacy alias kept in case anything still calls playChime() directly */
  function playChime() { playSound('chime'); }

  /* ── Core notification sender ────────────────────────────────────── */
  function notify(title, body, tag, onClick) {
    if (Notification.permission !== 'granted') return;
    var s = getNotifSettings();
    if (!s.enabled) return;
    var n = new Notification(title, {
      body: body,
      tag:  tag || ('esq-' + Date.now()),
      icon: "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'><rect width='32' height='32' rx='7' fill='%2304050d'/><circle cx='16' cy='16' r='11' fill='%23aaff3e' opacity='0.25'/><circle cx='16' cy='16' r='8' fill='%23aaff3e' opacity='0.5'/><circle cx='16' cy='16' r='6' fill='%23aaff3e'/><path d='M16 11 L17.2 14.8 L21 16 L17.2 17.2 L16 21 L14.8 17.2 L11 16 L14.8 14.8 Z' fill='white'/></svg>",
      silent: true   // we handle sound ourselves
    });
    if (s.sound_enabled) playSound(s.sound_type || 'chime', s.sound_custom_url);
    n.onclick = function() {
      try { window.focus(); } catch(e) {}
      n.close();
      if (typeof onClick === 'function') onClick();
    };
    setTimeout(function() { try { n.close(); } catch(e) {} }, 9000);
  }

  /* ── Email polling ───────────────────────────────────────────────── */
  function pollEmails() {
    var s = getNotifSettings();
    if (!s.enabled || !s.email_enabled) return;
    var token  = window.providerToken || window._providerToken;
    var supaUrl = window.SUPA_URL || 'https://kbwcsmctwtgrjtjcghkt.supabase.co';
    var supaKey = window.SUPA_KEY || '';
    if (!token || !window.currentUser) return;

    fetch(supaUrl + '/functions/v1/gmail-calendar', {
      method: 'POST',
      headers: { 'Content-Type':'application/json', 'apikey': supaKey, 'Authorization':'Bearer '+supaKey },
      body: JSON.stringify({ action:'gmail_inbox', provider_token:token, period:'1d' })
    })
    .then(function(r) { return r.json(); })
    .then(function(data) {
      var emails = data.emails || [];

      if (_notifKnownIds === null) {
        // First run — just seed the known IDs, don't fire any notifications
        _notifKnownIds = {};
        emails.forEach(function(e) { if (e.id) _notifKnownIds[e.id] = true; });
        return;
      }

      var fresh = emails.filter(function(e) { return e.id && !_notifKnownIds[e.id]; });
      emails.forEach(function(e) { if (e.id) _notifKnownIds[e.id] = true; });

      if (s.email_priority) {
        fresh = fresh.filter(function(e) {
          if (typeof window.getTag === 'function') {
            var t = window.getTag(e.from||'', e.subject||'', e.snippet||'');
            return t && t.priority;
          }
          return /urgent|grant|deadline|rfp|rfi|award|funded|meeting|today|required/i
                   .test((e.subject||'') + ' ' + (e.snippet||''));
        });
      }

      fresh.slice(0, 3).forEach(function(email, i) {
        setTimeout(function() {
          var from = (email.from || '').replace(/<[^>]+>/, '').trim() || 'New email';
          notify(
            '📧 ' + from,
            email.subject || '(no subject)',
            'email-' + email.id,
            function() {
              var navEl = document.getElementById('dash-nav-inbox');
              if (typeof window.showDashTab === 'function')
                window.showDashTab('inbox-tab', navEl);
              setTimeout(function() {
                if (typeof window.openEmailDetail === 'function') window.openEmailDetail(email);
              }, 500);
            }
          );
        }, i * 1600);
      });
    })
    .catch(function() {});
  }

  /* ── Meeting reminders ───────────────────────────────────────────── */
  function scheduleMeetingReminders() {
    var s = getNotifSettings();
    _notifMeetTimers.forEach(function(t) { clearTimeout(t); });
    _notifMeetTimers = [];
    if (!s.enabled || !s.meeting_enabled) return;

    var events      = window._lastCalEvents || [];
    var aheadMs     = (s.meeting_reminder || 10) * 60 * 1000;
    var now         = Date.now();

    events.forEach(function(evt) {
      if (!evt.start) return;
      var startMs  = new Date(evt.start).getTime();
      var fireAt   = startMs - aheadMs;
      var delay    = fireAt - now;
      if (delay > 0 && delay < 25 * 60 * 60 * 1000) {
        var t = setTimeout(function() {
          var timeStr = new Date(startMs).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'});
          notify(
            '📅 ' + (evt.title || 'Upcoming meeting'),
            'Starting in ' + s.meeting_reminder + ' min · ' + timeStr +
              (evt.location ? ' · ' + evt.location : ''),
            'meet-' + (evt.id || startMs),
            function() {
              var navEl = document.getElementById('dash-nav-fullcal');
              if (typeof window.showDashTab === 'function')
                window.showDashTab('fullcal-tab', navEl);
            }
          );
        }, delay);
        _notifMeetTimers.push(t);
      }
    });
  }

  /* Re-schedule when calendar data refreshes */
  window.refreshMeetingReminders = scheduleMeetingReminders;

  /* ── Start / stop polling ────────────────────────────────────────── */
  function startPolling() {
    if (_notifPollTimer) clearInterval(_notifPollTimer);
    var s = getNotifSettings();
    if (!s.enabled) return;
    var ms = Math.max(5, s.email_interval || 10) * 60 * 1000;
    if (s.email_enabled) {
      setTimeout(pollEmails, 30 * 1000);           // seed after 30s
      _notifPollTimer = setInterval(pollEmails, ms);
    }
    if (s.meeting_enabled) {
      scheduleMeetingReminders();
      setInterval(scheduleMeetingReminders, 60 * 1000); // refresh reminders every minute
    }
  }

  /* ── Settings modal ──────────────────────────────────────────────── */
  window.openNotifSettings = function() {
    var old = eid('esq-notif-ol'); if (old) old.remove();
    var s   = getNotifSettings();

    var ol    = cel('div', 'email-detail-overlay'); ol.id = 'esq-notif-ol';
    var modal = cel('div', 'email-detail-modal');
    modal.style.cssText = 'max-width:460px;width:92%;';

    var xBtn = cel('button', 'email-detail-close', '✕');
    xBtn.addEventListener('click', function() { ol.remove(); });

    var hdr = cel('div', '', '🔔 Notification Settings');
    hdr.style.cssText = 'font-size:15px;font-weight:800;color:#eef3fc;margin-bottom:18px;';

    /* Permission banner */
    if (Notification.permission !== 'granted') {
      var banner = cel('div', '');
      banner.style.cssText = 'background:rgba(245,197,66,0.08);border:1px solid rgba(245,197,66,0.3);border-radius:8px;padding:10px 14px;margin-bottom:14px;display:flex;align-items:center;justify-content:space-between;gap:10px;';
      var bannerMsg = cel('span', '', Notification.permission === 'denied'
        ? '⚠️ Notifications blocked — update your browser settings'
        : '⚡ Allow notifications to enable alerts');
      bannerMsg.style.cssText = 'font-size:12px;color:#f5c542;flex:1;';
      banner.appendChild(bannerMsg);
      if (Notification.permission !== 'denied') {
        var allowBtn = cel('button', '', 'Allow →');
        allowBtn.style.cssText = 'background:rgba(245,197,66,0.15);border:1px solid rgba(245,197,66,0.4);color:#f5c542;font-size:11px;font-weight:700;padding:4px 12px;border-radius:6px;cursor:pointer;font-family:inherit;white-space:nowrap;';
        allowBtn.addEventListener('click', function() {
          Notification.requestPermission().then(function(res) {
            if (res === 'granted') {
              banner.remove();
              var ns = getNotifSettings(); ns.enabled = true; saveNotifSettings(ns);
              masterChk.checked = true;
              updateDot();
              startPolling();
            }
          });
        });
        banner.appendChild(allowBtn);
      }
      modal.appendChild(banner);
    }

    /* Helper builders */
    function row(label, sub) {
      var r = cel('div',''); r.style.cssText='display:flex;align-items:center;justify-content:space-between;padding:11px 0;border-bottom:1px solid rgba(255,255,255,0.05);gap:12px;';
      var lw = cel('div',''); lw.style.cssText='flex:1;min-width:0;';
      var lt = cel('div','',label); lt.style.cssText='font-size:13px;color:#eef3fc;font-weight:600;';
      lw.appendChild(lt);
      if (sub) { var ls=cel('div','',sub); ls.style.cssText='font-size:11px;color:#4a5568;margin-top:2px;'; lw.appendChild(ls); }
      r.appendChild(lw); return r;
    }

    function toggle(checked, cb) {
      var lbl = document.createElement('label');
      lbl.style.cssText = 'position:relative;display:inline-block;width:40px;height:22px;cursor:pointer;flex-shrink:0;';
      var inp = document.createElement('input'); inp.type='checkbox'; inp.checked=checked;
      inp.style.cssText='opacity:0;width:0;height:0;position:absolute;';
      var track = cel('span',''); track.style.cssText='position:absolute;inset:0;border-radius:22px;transition:background .2s;background:'+(checked?'rgba(170,255,62,0.7)':'rgba(255,255,255,0.12)')+';';
      var knob  = cel('span',''); knob.style.cssText='position:absolute;width:16px;height:16px;background:#fff;border-radius:50%;top:3px;left:'+(checked?'21px':'3px')+';transition:left .2s;';
      track.appendChild(knob); lbl.appendChild(inp); lbl.appendChild(track);
      inp.addEventListener('change',function(){
        var on=inp.checked; track.style.background=on?'rgba(170,255,62,0.7)':'rgba(255,255,255,0.12)'; knob.style.left=on?'21px':'3px'; cb(on);
      });
      return lbl;
    }

    function select(opts, val, cb) {
      var el = document.createElement('select');
      el.style.cssText='background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.12);color:#eef3fc;font-size:12px;padding:5px 8px;border-radius:6px;font-family:inherit;cursor:pointer;outline:none;flex-shrink:0;';
      opts.forEach(function(o){var op=document.createElement('option');op.value=o.v;op.textContent=o.l;if(o.v==val)op.selected=true;el.appendChild(op);});
      el.addEventListener('change',function(){cb(el.value);});
      return el;
    }

    function sectionHead(label) {
      var h=cel('div','',label); h.style.cssText='font-size:10px;font-weight:800;color:#4a5568;text-transform:uppercase;letter-spacing:0.07em;padding-top:16px;padding-bottom:2px;'; return h;
    }

    /* ── Master ── */
    var masterRow = row('Enable Notifications','Get alerts for emails and meetings');
    var masterChk = toggle(s.enabled, function(on) {
      var ns=getNotifSettings(); ns.enabled=on; saveNotifSettings(ns);
      updateDot();
      if (on) { if(Notification.permission==='granted') startPolling(); else Notification.requestPermission().then(function(r){if(r==='granted')startPolling();}); }
      else    { if(_notifPollTimer){clearInterval(_notifPollTimer);_notifPollTimer=null;} _notifMeetTimers.forEach(function(t){clearTimeout(t);}); _notifMeetTimers=[]; }
    });
    masterRow.appendChild(masterChk);

    /* ── Email ── */
    var emailRow = row('Notify on new emails','');
    var emailChk = toggle(s.email_enabled, function(on){var ns=getNotifSettings();ns.email_enabled=on;saveNotifSettings(ns);startPolling();});
    emailRow.appendChild(emailChk);

    var freqRow = row('Check frequency','');
    var freqSel = select([{v:5,l:'Every 5 min'},{v:10,l:'Every 10 min'},{v:15,l:'Every 15 min'},{v:30,l:'Every 30 min'}], s.email_interval, function(v){var ns=getNotifSettings();ns.email_interval=parseInt(v);saveNotifSettings(ns);startPolling();});
    freqRow.appendChild(freqSel);

    var priRow = row('Important emails only','Only flag urgent / priority emails');
    var priChk = toggle(s.email_priority, function(on){var ns=getNotifSettings();ns.email_priority=on;saveNotifSettings(ns);});
    priRow.appendChild(priChk);

    /* ── Meetings ── */
    var meetRow = row('Meeting reminders','');
    var meetChk = toggle(s.meeting_enabled, function(on){var ns=getNotifSettings();ns.meeting_enabled=on;saveNotifSettings(ns);if(on)scheduleMeetingReminders();else{_notifMeetTimers.forEach(function(t){clearTimeout(t);});_notifMeetTimers=[];}});
    meetRow.appendChild(meetChk);

    var remRow = row('Remind me before','');
    var remSel = select([{v:5,l:'5 minutes before'},{v:10,l:'10 minutes before'},{v:15,l:'15 minutes before'},{v:30,l:'30 minutes before'}], s.meeting_reminder, function(v){var ns=getNotifSettings();ns.meeting_reminder=parseInt(v);saveNotifSettings(ns);scheduleMeetingReminders();});
    remRow.appendChild(remSel);

    /* ── Sound ── */
    var sndRow = row('Notification sound','');
    var sndChk = toggle(s.sound_enabled, function(on){var ns=getNotifSettings();ns.sound_enabled=on;saveNotifSettings(ns);});
    sndRow.appendChild(sndChk);

    /* Sound picker grid */
    var pickerWrap = cel('div','');
    pickerWrap.style.cssText='padding:10px 0 4px;';

    var grid = cel('div','');
    grid.style.cssText='display:grid;grid-template-columns:1fr 1fr 1fr;gap:7px;margin-bottom:10px;';

    var curType = s.sound_type || 'chime';

    function makeSoundCard(st) {
      var card = cel('div','');
      var isSelected = (st.id === curType);
      card.style.cssText='border:1px solid '+(isSelected?'rgba(170,255,62,0.55)':'rgba(255,255,255,0.09)')+';border-radius:9px;padding:8px 8px 7px;cursor:pointer;background:'+(isSelected?'rgba(170,255,62,0.07)':'rgba(255,255,255,0.02)')+';transition:border .15s,background .15s;position:relative;';
      card.dataset.soundId = st.id;
      var em  = cel('div','', st.emoji); em.style.cssText='font-size:18px;line-height:1;margin-bottom:4px;';
      var lbl = cel('div','', st.label); lbl.style.cssText='font-size:11px;font-weight:700;color:#eef3fc;line-height:1.2;';
      var dsc = cel('div','', st.desc);  dsc.style.cssText='font-size:10px;color:#4a5568;margin-top:2px;line-height:1.3;';
      // Play preview button
      var play = cel('button','','▶');
      play.title = 'Preview';
      play.style.cssText='position:absolute;top:6px;right:6px;background:transparent;border:none;color:#4a5568;font-size:10px;cursor:pointer;padding:2px 4px;border-radius:4px;line-height:1;';
      play.onmouseover=function(){play.style.color='#aaff3e';};
      play.onmouseout=function(){play.style.color='#4a5568';};
      play.addEventListener('click', function(e) {
        e.stopPropagation();
        if (st.id === 'custom') {
          var ns2 = getNotifSettings();
          if (ns2.sound_custom_url) playSound('custom', ns2.sound_custom_url);
        } else {
          playSound(st.id);
        }
        play.textContent='♪'; setTimeout(function(){play.textContent='▶';},700);
      });
      card.appendChild(em); card.appendChild(lbl); card.appendChild(dsc); card.appendChild(play);
      card.addEventListener('click', function() {
        var ns2 = getNotifSettings(); ns2.sound_type = st.id; saveNotifSettings(ns2); curType = st.id;
        // Update all card styles
        grid.querySelectorAll('[data-sound-id]').forEach(function(c) {
          var sel2 = c.dataset.soundId === st.id;
          c.style.borderColor = sel2 ? 'rgba(170,255,62,0.55)' : 'rgba(255,255,255,0.09)';
          c.style.background  = sel2 ? 'rgba(170,255,62,0.07)'  : 'rgba(255,255,255,0.02)';
        });
        // Show/hide custom upload row
        if (customUploadRow) customUploadRow.style.display = st.id === 'custom' ? 'block' : 'none';
        // Auto-preview
        if (st.id !== 'custom') playSound(st.id);
      });
      return card;
    }

    SOUND_TYPES.forEach(function(st) { grid.appendChild(makeSoundCard(st)); });
    pickerWrap.appendChild(grid);

    /* Custom sound upload row */
    var customUploadRow = cel('div','');
    customUploadRow.style.cssText='display:'+(curType==='custom'?'block':'none')+';background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.08);border-radius:9px;padding:12px;margin-bottom:8px;';

    var uploadLabel = cel('div','','Upload a sound file (MP3, WAV, OGG — max 2 MB)');
    uploadLabel.style.cssText='font-size:11px;color:#8a97b5;margin-bottom:8px;';
    var uploadRow2 = cel('div',''); uploadRow2.style.cssText='display:flex;gap:8px;align-items:center;flex-wrap:wrap;';
    var fileInput = document.createElement('input');
    fileInput.type='file'; fileInput.accept='audio/mp3,audio/mpeg,audio/wav,audio/ogg,audio/*';
    fileInput.style.cssText='display:none;';
    var uploadBtn = cel('button','','📂 Choose file');
    uploadBtn.style.cssText='background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.12);color:#eef3fc;font-size:11px;font-weight:600;padding:6px 12px;border-radius:7px;cursor:pointer;font-family:inherit;';
    var uploadStatus = cel('span',''); uploadStatus.style.cssText='font-size:11px;color:#4a5568;';
    var existingUrl = s.sound_custom_url;
    uploadStatus.textContent = existingUrl ? '✅ Custom sound loaded' : 'No file chosen';
    uploadBtn.addEventListener('click', function(){ fileInput.click(); });
    fileInput.addEventListener('change', function() {
      var file = fileInput.files[0];
      if (!file) return;
      if (file.size > 2 * 1024 * 1024) { uploadStatus.textContent='⚠️ File too large (max 2 MB)'; uploadStatus.style.color='#f87171'; return; }
      uploadStatus.textContent='Loading…'; uploadStatus.style.color='#8a97b5';
      var reader = new FileReader();
      reader.onload = function(ev) {
        var dataUrl = ev.target.result;
        var ns2 = getNotifSettings(); ns2.sound_custom_url = dataUrl; saveNotifSettings(ns2);
        uploadStatus.textContent='✅ ' + file.name; uploadStatus.style.color='#4ade80';
        playSound('custom', dataUrl);
      };
      reader.readAsDataURL(file);
    });
    uploadRow2.appendChild(uploadBtn); uploadRow2.appendChild(fileInput); uploadRow2.appendChild(uploadStatus);

    var browseRow = cel('div',''); browseRow.style.cssText='margin-top:10px;display:flex;gap:8px;flex-wrap:wrap;';
    var mixkitBtn = cel('button','','🌐 Browse Mixkit Sounds (free)');
    mixkitBtn.style.cssText='background:rgba(170,255,62,0.06);border:1px solid rgba(170,255,62,0.2);color:#aaff3e;font-size:11px;font-weight:600;padding:6px 12px;border-radius:7px;cursor:pointer;font-family:inherit;';
    mixkitBtn.title='Free notification sounds — no login required';
    mixkitBtn.addEventListener('click', function(){ window.open('https://mixkit.co/free-sound-effects/notification/', '_blank'); });
    var freesoundBtn = cel('button','','🎵 Freesound.org');
    freesoundBtn.style.cssText='background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.1);color:#8a97b5;font-size:11px;font-weight:600;padding:6px 12px;border-radius:7px;cursor:pointer;font-family:inherit;';
    freesoundBtn.addEventListener('click', function(){ window.open('https://freesound.org/search/?q=notification+alert&f=duration%3A%5B0+TO+5%5D&s=score+desc', '_blank'); });
    browseRow.appendChild(mixkitBtn); browseRow.appendChild(freesoundBtn);

    customUploadRow.appendChild(uploadLabel); customUploadRow.appendChild(uploadRow2); customUploadRow.appendChild(browseRow);
    pickerWrap.appendChild(customUploadRow);

    /* Test button */
    var testRow = cel('div',''); testRow.style.cssText='padding:4px 0 4px;display:flex;gap:10px;align-items:center;';
    var testBtn = cel('button','','▶ Test Sound & Alert');
    testBtn.style.cssText='background:rgba(170,255,62,0.08);border:1px solid rgba(170,255,62,0.25);color:#aaff3e;font-size:12px;font-weight:700;padding:7px 16px;border-radius:8px;cursor:pointer;font-family:inherit;';
    testBtn.addEventListener('click', function(){
      var ns2 = getNotifSettings();
      playSound(ns2.sound_type || 'chime', ns2.sound_custom_url);
      if (Notification.permission==='granted') {
        notify('🔔 EconSquad AI', 'Notifications are working! Click to go to your inbox.', 'test-'+Date.now(), function(){
          if(typeof window.showDashTab==='function') window.showDashTab('inbox-tab', document.getElementById('dash-nav-inbox'));
        });
      } else {
        testBtn.textContent='⚠️ Permission needed — click Allow above';
        setTimeout(function(){testBtn.textContent='▶ Test Sound & Alert';},3000);
      }
    });
    testRow.appendChild(testBtn);

    /* Assemble */
    modal.appendChild(xBtn); modal.appendChild(hdr);
    modal.appendChild(masterRow);
    modal.appendChild(sectionHead('📧 Email Alerts'));
    modal.appendChild(emailRow); modal.appendChild(freqRow); modal.appendChild(priRow);
    modal.appendChild(sectionHead('📅 Meeting Reminders'));
    modal.appendChild(meetRow); modal.appendChild(remRow);
    modal.appendChild(sectionHead('🔊 Sound'));
    modal.appendChild(sndRow); modal.appendChild(pickerWrap); modal.appendChild(testRow);

    ol.appendChild(modal);
    ol.addEventListener('click', function(e){ if(e.target===ol) ol.remove(); });
    document.body.appendChild(ol);
  };

  /* ── Bell icon ───────────────────────────────────────────────────── */
  function updateDot() {
    var dot = eid('esq-notif-dot');
    if (!dot) return;
    var s = getNotifSettings();
    dot.style.display = (!s.enabled || Notification.permission !== 'granted') ? 'block' : 'none';
  }

  function injectNotifBell() {
    if (eid('esq-notif-bell')) return;
    var anchor = eid('plan-badge');
    if (!anchor) return;
    var btn = cel('button','');
    btn.id = 'esq-notif-bell';
    btn.title = 'Notification settings';
    btn.style.cssText = 'position:relative;background:transparent;border:1px solid rgba(255,255,255,0.1);color:#6b7a96;border-radius:8px;width:32px;height:32px;display:flex;align-items:center;justify-content:center;cursor:pointer;font-size:14px;transition:all .2s;flex-shrink:0;padding:0;';
    btn.innerHTML = '🔔';
    btn.onmouseover = function(){ btn.style.borderColor='rgba(170,255,62,0.3)'; btn.style.color='#aaff3e'; };
    btn.onmouseout  = function(){ btn.style.borderColor='rgba(255,255,255,0.1)'; btn.style.color='#6b7a96'; };
    btn.addEventListener('click', function(){ window.openNotifSettings(); });

    /* Yellow dot — shows when notifications not configured */
    var dot = cel('span',''); dot.id='esq-notif-dot';
    dot.style.cssText='position:absolute;top:3px;right:3px;width:7px;height:7px;border-radius:50%;background:#f5c542;display:none;pointer-events:none;';
    btn.appendChild(dot);

    anchor.insertAdjacentElement('afterend', btn);
    updateDot();
  }

  /* ── Public init (called from onSignedIn) ────────────────────────── */
  window.initNotifications = function() {
    setTimeout(injectNotifBell, 1800);
    var s = getNotifSettings();
    if (s.enabled && Notification.permission === 'granted') {
      startPolling();
    } else if (Notification.permission !== 'granted') {
      // Show dot — user hasn't set up notifications yet
      updateDot();
    }
  };

  /* ═══════════════════════════════════════════════════════════════════
     TASK MANAGEMENT MODULE
     ═══════════════════════════════════════════════════════════════════ */

  var TASKS_KEY = 'esq_tasks';
  var TASK_CATS_KEY = 'esq_task_cats';
  var TASK_ALERTED_KEY = 'esq_task_alerted';
  var DEFAULT_CATS = ['General','Grants','BRE','Site Selection','Workforce','Marketing','Outreach','Reporting'];
  var _taskFilter = 'pending';
  var _taskSort = 'priority';
  var _taskCatFilter = 'all';
  var _taskAlertTimers = {};

  /* ── Storage ── */
  function getAllTasks() {
    try { return JSON.parse(localStorage.getItem(TASKS_KEY) || '[]'); } catch(e) { return []; }
  }
  function saveAllTasks(tasks) {
    try { localStorage.setItem(TASKS_KEY, JSON.stringify(tasks)); } catch(e) {}
  }
  function getTaskCategories() {
    try {
      var stored = JSON.parse(localStorage.getItem(TASK_CATS_KEY) || 'null');
      return stored || DEFAULT_CATS.slice();
    } catch(e) { return DEFAULT_CATS.slice(); }
  }
  function saveTaskCategories(cats) {
    try { localStorage.setItem(TASK_CATS_KEY, JSON.stringify(cats)); } catch(e) {}
  }
  function getAlerted() {
    try { return JSON.parse(localStorage.getItem(TASK_ALERTED_KEY) || '{}'); } catch(e) { return {}; }
  }
  function setAlerted(d) {
    try { localStorage.setItem(TASK_ALERTED_KEY, JSON.stringify(d)); } catch(e) {}
  }

  function genTaskId() {
    return 'tsk_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
  }

  function createTask(data) {
    var tasks = getAllTasks();
    var now = new Date().toISOString();
    var task = {
      id: genTaskId(),
      title: data.title || 'Untitled Task',
      description: data.description || '',
      category: data.category || 'General',
      priority: data.priority || 'medium',
      status: data.status || 'pending',
      dueDate: data.dueDate || null,
      alertMinBefore: (data.alertMinBefore !== undefined) ? data.alertMinBefore : 30,
      completedAt: null,
      sourceEmailId: data.sourceEmailId || null,
      sourceEmailSubject: data.sourceEmailSubject || null,
      googleTaskId: data.googleTaskId || null,
      createdAt: now,
      updatedAt: now
    };
    tasks.push(task);
    saveAllTasks(tasks);
    updateTasksBadge();
    scheduleTaskAlerts();
    return task;
  }

  function updateTask(id, updates) {
    var tasks = getAllTasks();
    var idx = tasks.findIndex(function(t) { return t.id === id; });
    if (idx === -1) return null;
    Object.assign(tasks[idx], updates, { updatedAt: new Date().toISOString() });
    saveAllTasks(tasks);
    updateTasksBadge();
    scheduleTaskAlerts();
    return tasks[idx];
  }

  function deleteTask(id) {
    var tasks = getAllTasks().filter(function(t) { return t.id !== id; });
    saveAllTasks(tasks);
    updateTasksBadge();
  }

  function completeTask(id) {
    return updateTask(id, { status: 'completed', completedAt: new Date().toISOString() });
  }

  /* ── Priority helpers ── */
  var PRIORITY_ORDER = { urgent: 0, high: 1, medium: 2, low: 3 };
  var PRIORITY_COLORS = { urgent: '#f87171', high: '#fb923c', medium: '#facc15', low: '#4ade80' };
  var PRIORITY_LABELS = { urgent: 'Urgent', high: 'High', medium: 'Medium', low: 'Low' };

  function isOverdue(task) {
    if (!task.dueDate || task.status === 'completed') return false;
    return new Date(task.dueDate) < new Date();
  }
  function isDueToday(task) {
    if (!task.dueDate || task.status === 'completed') return false;
    var d = new Date(task.dueDate);
    var now = new Date();
    return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
  }

  /* ── Badge ── */
  function updateTasksBadge() {
    var tasks = getAllTasks();
    var count = tasks.filter(function(t) {
      return t.status !== 'completed' && (isOverdue(t) || isDueToday(t));
    }).length;
    var badge = eid('tasks-nav-badge');
    if (badge) { badge.textContent = count; badge.style.display = count > 0 ? 'inline' : 'none'; }
    updateSidebarTasksBadge(count);
  }

  function updateSidebarTasksBadge(count) {
    if (count === undefined) {
      var tasks = getAllTasks();
      count = tasks.filter(function(t) {
        return t.status !== 'completed' && (isOverdue(t) || isDueToday(t));
      }).length;
    }
    var b = eid('esq-rsb-tasks-badge');
    if (!b) return;
    if (count > 0) { b.textContent = count > 99 ? '99+' : count; b.style.display = 'inline-block'; }
    else { b.style.display = 'none'; }
  }

  window.updateSidebarCalBadge = function updateSidebarCalBadge() {
    var evts = window._lastCalEvents || [];
    var count = evts.length;
    var label = count > 99 ? '99+' : String(count);
    /* Sidebar icon badge */
    var b = eid('esq-rsb-cal-badge');
    if (b) { if (count > 0) { b.textContent = label; b.style.display = 'inline-block'; } else { b.style.display = 'none'; } }
    /* Top nav badge */
    var nb = eid('cal-nav-badge');
    if (nb) { if (count > 0) { nb.textContent = label; nb.style.display = 'inline-block'; } else { nb.style.display = 'none'; } }
  };

  /* ── Filter / sort helpers ── */
  function filterTasks(tasks, filter, catFilter) {
    var now = new Date();
    var todayEnd = new Date(); todayEnd.setHours(23,59,59,999);
    var result = tasks.filter(function(t) {
      if (catFilter && catFilter !== 'all' && t.category !== catFilter) return false;
      if (filter === 'pending') return t.status === 'pending' || t.status === 'in_progress';
      if (filter === 'today') return isDueToday(t) && t.status !== 'completed';
      if (filter === 'overdue') return isOverdue(t);
      if (filter === 'upcoming') {
        if (!t.dueDate || t.status === 'completed') return false;
        var d = new Date(t.dueDate);
        return d > todayEnd;
      }
      if (filter === 'completed') return t.status === 'completed';
      return true; // 'all'
    });
    return result;
  }

  function sortTasks(tasks, sort) {
    return tasks.slice().sort(function(a, b) {
      if (sort === 'priority') {
        var pd = (PRIORITY_ORDER[a.priority] || 2) - (PRIORITY_ORDER[b.priority] || 2);
        if (pd !== 0) return pd;
        if (a.dueDate && b.dueDate) return new Date(a.dueDate) - new Date(b.dueDate);
        if (a.dueDate) return -1; if (b.dueDate) return 1;
        return 0;
      }
      if (sort === 'due') {
        if (a.dueDate && b.dueDate) return new Date(a.dueDate) - new Date(b.dueDate);
        if (a.dueDate) return -1; if (b.dueDate) return 1;
        return 0;
      }
      // created
      return new Date(b.createdAt) - new Date(a.createdAt);
    });
  }

  /* ── Format due date for display ── */
  function fmtDue(iso) {
    if (!iso) return '';
    var d = new Date(iso);
    if (isNaN(d)) return '';
    var now = new Date();
    var diffMs = d - now;
    var diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    var timeStr = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    if (diffDays < -1) return d.toLocaleDateString([], { month: 'short', day: 'numeric' }) + ' ' + timeStr;
    if (diffDays === -1) return 'Yesterday ' + timeStr;
    if (diffDays === 0) {
      var today = new Date(); today.setHours(0,0,0,0);
      var dDay = new Date(d); dDay.setHours(0,0,0,0);
      if (dDay.getTime() === today.getTime()) return 'Today ' + timeStr;
      return 'Yesterday ' + timeStr;
    }
    if (diffDays === 1) return 'Tomorrow ' + timeStr;
    if (diffDays < 7) return ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][d.getDay()] + ' ' + timeStr;
    return d.toLocaleDateString([], { month: 'short', day: 'numeric' }) + ' ' + timeStr;
  }

  /* ── Render task list ── */
  window.renderTaskList = function() {
    var wrap = eid('tasks-list-wrap');
    if (!wrap) return;
    var tasks = getAllTasks();
    var filtered = filterTasks(tasks, _taskFilter, _taskCatFilter);
    var sorted = sortTasks(filtered, _taskSort);

    if (sorted.length === 0) {
      wrap.innerHTML = '<div style="text-align:center;padding:60px 20px;color:#4a5568;"><div style="font-size:32px;margin-bottom:12px;">📋</div><div style="font-size:14px;font-weight:600;color:#6b7a96;">No tasks</div><div style="font-size:12px;margin-top:6px;">Create a task with the + New Task button above</div></div>';
      return;
    }

    // Group by section
    var overdue = [], today = [], upcoming = [], later = [], completed = [];
    sorted.forEach(function(t) {
      if (t.status === 'completed') { completed.push(t); return; }
      if (isOverdue(t)) { overdue.push(t); return; }
      if (isDueToday(t)) { today.push(t); return; }
      if (t.dueDate) { upcoming.push(t); return; }
      later.push(t);
    });

    var html = '';
    function renderSection(label, arr, color) {
      if (!arr.length) return '';
      var s = '<div style="font-size:10px;font-weight:800;color:' + (color||'#6b7a96') + ';text-transform:uppercase;letter-spacing:.1em;margin:18px 0 8px;padding-bottom:4px;border-bottom:1px solid rgba(255,255,255,0.05);">' + escH(label) + ' <span style="font-weight:400;opacity:.7;">(' + arr.length + ')</span></div>';
      arr.forEach(function(t) { s += renderTaskCard(t); });
      return s;
    }

    if (_taskFilter === 'all' || _taskFilter === 'pending') {
      html += renderSection('⚠ Overdue', overdue, '#f87171');
      html += renderSection('📅 Today', today, '#facc15');
      html += renderSection('🔜 Upcoming', upcoming, '#aaff3e');
      html += renderSection('📌 No Due Date', later, '#6b7a96');
      if (_taskFilter === 'all') html += renderSection('✅ Completed', completed, '#4a5568');
    } else {
      sorted.forEach(function(t) { html += renderTaskCard(t); });
    }

    wrap.innerHTML = html;
  };

  function renderTaskCard(t) {
    var pColor = PRIORITY_COLORS[t.priority] || '#6b7a96';
    var overdueCls = isOverdue(t) ? 'opacity:1;' : '';
    var overdueChip = isOverdue(t) ? '<span style="background:rgba(248,113,113,0.15);border:1px solid rgba(248,113,113,0.3);color:#f87171;font-size:9px;font-weight:800;padding:1px 6px;border-radius:6px;margin-left:4px;">OVERDUE</span>' : '';
    var statusChip = t.status === 'in_progress' ? '<span style="background:rgba(170,255,62,0.1);border:1px solid rgba(170,255,62,0.25);color:#aaff3e;font-size:9px;font-weight:700;padding:1px 6px;border-radius:6px;margin-left:4px;">IN PROGRESS</span>' : '';
    var dueChip = t.dueDate ? '<span style="background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.1);color:#8a97b5;font-size:10px;padding:1px 7px;border-radius:6px;margin-left:4px;">' + escH(fmtDue(t.dueDate)) + '</span>' : '';
    var desc = t.description ? '<div style="font-size:11px;color:#4a5568;margin-top:4px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + escH(t.description.slice(0, 80)) + (t.description.length > 80 ? '…' : '') + '</div>' : '';
    var strikeStyle = t.status === 'completed' ? 'text-decoration:line-through;opacity:.5;' : '';
    var checkIcon = t.status === 'completed' ? '✅' : '⬜';
    return '<div style="display:flex;align-items:flex-start;gap:10px;background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.07);border-left:3px solid ' + pColor + ';border-radius:10px;padding:12px 14px;margin-bottom:8px;' + overdueCls + '">'
      + '<button onclick="window.toggleTaskDone(\'' + escH(t.id) + '\')" style="background:none;border:none;cursor:pointer;font-size:16px;padding:0;margin-top:1px;flex-shrink:0;" title="' + (t.status==='completed'?'Mark pending':'Mark complete') + '">' + checkIcon + '</button>'
      + '<div style="flex:1;min-width:0;">'
      + '<div style="display:flex;flex-wrap:wrap;align-items:center;gap:4px;margin-bottom:4px;">'
      + '<span style="font-size:13px;font-weight:600;color:#eef3fc;' + strikeStyle + '">' + escH(t.title) + '</span>'
      + overdueChip + statusChip
      + '</div>'
      + '<div style="display:flex;flex-wrap:wrap;gap:4px;align-items:center;">'
      + '<span style="background:rgba(170,255,62,0.08);border:1px solid rgba(170,255,62,0.2);color:#aaff3e;font-size:10px;font-weight:700;padding:1px 8px;border-radius:6px;">' + escH(t.category) + '</span>'
      + '<span style="background:rgba(255,255,255,0.05);border:1px solid ' + pColor + '44;color:' + pColor + ';font-size:10px;font-weight:700;padding:1px 8px;border-radius:6px;">' + escH(PRIORITY_LABELS[t.priority] || t.priority) + '</span>'
      + dueChip
      + '</div>'
      + desc
      + '</div>'
      + '<div style="display:flex;gap:6px;flex-shrink:0;">'
      + '<button onclick="window.openEditTask(\'' + escH(t.id) + '\')" style="background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.1);color:#8a97b5;font-size:11px;padding:4px 8px;border-radius:6px;cursor:pointer;" title="Edit">✏️</button>'
      + '<button onclick="window.confirmDeleteTask(\'' + escH(t.id) + '\')" style="background:rgba(248,113,113,0.07);border:1px solid rgba(248,113,113,0.2);color:#f87171;font-size:11px;padding:4px 8px;border-radius:6px;cursor:pointer;" title="Delete">🗑️</button>'
      + '</div>'
      + '</div>';
  }

  window.toggleTaskDone = function(id) {
    var tasks = getAllTasks();
    var t = tasks.find(function(x) { return x.id === id; });
    if (!t) return;
    if (t.status === 'completed') {
      updateTask(id, { status: 'pending', completedAt: null });
    } else {
      completeTask(id);
    }
    window.renderTaskList();
  };

  window.confirmDeleteTask = function(id) {
    var tasks = getAllTasks();
    var t = tasks.find(function(x) { return x.id === id; });
    if (!t) return;
    if (!confirm('Delete task "' + t.title + '"?')) return;
    deleteTask(id);
    window.renderTaskList();
    refreshTaskSummary();
  };

  /* ── Load full tasks page ── */
  window.loadTasks = function() {
    var wrap = eid('tasks-page-content');
    if (!wrap) return;

    var tasks = getAllTasks();
    var overdueCount = tasks.filter(function(t) { return isOverdue(t); }).length;
    var todayCount = tasks.filter(function(t) { return isDueToday(t) && t.status !== 'completed'; }).length;
    var pendingCount = tasks.filter(function(t) { return t.status !== 'completed'; }).length;

    var summaryParts = [];
    if (overdueCount) summaryParts.push('<span style="color:#f87171;">' + overdueCount + ' overdue</span>');
    if (todayCount) summaryParts.push('<span style="color:#facc15;">' + todayCount + ' due today</span>');
    summaryParts.push(tasks.length + ' total');

    var cats = getTaskCategories();
    var catOptions = '<option value="all">All Categories</option>' + cats.map(function(c) { return '<option value="' + escH(c) + '">' + escH(c) + '</option>'; }).join('');

    var filterPills = [
      { id: 'pending', label: 'Pending' },
      { id: 'today', label: 'Today' + (todayCount ? ' <span style="background:#facc15;color:#000;font-size:9px;font-weight:800;padding:0 4px;border-radius:5px;">' + todayCount + '</span>' : '') },
      { id: 'overdue', label: 'Overdue' + (overdueCount ? ' <span style="background:#f87171;color:#fff;font-size:9px;font-weight:800;padding:0 4px;border-radius:5px;">' + overdueCount + '</span>' : '') },
      { id: 'upcoming', label: 'Upcoming' },
      { id: 'completed', label: 'Completed' },
      { id: 'all', label: 'All' }
    ];

    var pillsHtml = filterPills.map(function(p) {
      var active = _taskFilter === p.id;
      return '<button onclick="window.setTaskFilter(\'' + p.id + '\',this)" style="background:' + (active ? 'rgba(170,255,62,0.12)' : 'rgba(255,255,255,0.04)') + ';border:1px solid ' + (active ? 'rgba(170,255,62,0.3)' : 'rgba(255,255,255,0.08)') + ';color:' + (active ? '#aaff3e' : '#6b7a96') + ';font-size:11px;font-weight:700;padding:5px 14px;border-radius:20px;cursor:pointer;font-family:inherit;">' + p.label + '</button>';
    }).join('');

    wrap.innerHTML =
      '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;flex-wrap:wrap;gap:10px;">'
      + '<div>'
      + '<div style="font-family:\'Barlow\',sans-serif;font-size:22px;font-weight:800;color:#eef3fc;">📋 Tasks</div>'
      + '<div style="font-size:12px;color:#6b7a96;margin-top:2px;" id="tasks-summary-line">' + summaryParts.join(' &nbsp;·&nbsp; ') + '</div>'
      + '</div>'
      + '<div style="display:flex;gap:8px;">'
      + '<button onclick="window.syncGoogleTasks()" style="background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.1);color:#8a97b5;font-size:11px;font-weight:600;padding:6px 14px;border-radius:8px;cursor:pointer;font-family:inherit;">↻ Google Tasks</button>'
      + '<button onclick="window.openManageCategories()" style="background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.1);color:#8a97b5;font-size:11px;font-weight:600;padding:6px 14px;border-radius:8px;cursor:pointer;font-family:inherit;">🏷️ Categories</button>'
      + '<button onclick="window.openNewTask({})" style="background:rgba(170,255,62,0.12);border:1px solid rgba(170,255,62,0.3);color:#aaff3e;font-size:12px;font-weight:700;padding:6px 16px;border-radius:8px;cursor:pointer;font-family:inherit;">+ New Task</button>'
      + '</div>'
      + '</div>'
      + '<div style="display:flex;gap:8px;margin-bottom:16px;flex-wrap:wrap;align-items:center;" id="tasks-filter-row">'
      + pillsHtml
      + '<div style="margin-left:auto;display:flex;gap:8px;">'
      + '<select id="tasks-sort-sel" onchange="window.setTaskSort(this.value)" style="background:#0d1220;border:1px solid rgba(255,255,255,0.1);color:#8a97b5;font-size:11px;padding:5px 10px;border-radius:8px;cursor:pointer;font-family:inherit;">'
      + '<option value="priority"' + (_taskSort==='priority'?' selected':'') + '>Sort: Priority</option>'
      + '<option value="due"' + (_taskSort==='due'?' selected':'') + '>Sort: Due Date</option>'
      + '<option value="created"' + (_taskSort==='created'?' selected':'') + '>Sort: Created</option>'
      + '</select>'
      + '<select id="tasks-cat-sel" onchange="window.setTaskCatFilter(this.value)" style="background:#0d1220;border:1px solid rgba(255,255,255,0.1);color:#8a97b5;font-size:11px;padding:5px 10px;border-radius:8px;cursor:pointer;font-family:inherit;">'
      + catOptions
      + '</select>'
      + '</div>'
      + '</div>'
      + '<div id="tasks-list-wrap"></div>';

    window.renderTaskList();
  };

  function refreshTaskSummary() {
    var tasks = getAllTasks();
    var overdueCount = tasks.filter(function(t) { return isOverdue(t); }).length;
    var todayCount = tasks.filter(function(t) { return isDueToday(t) && t.status !== 'completed'; }).length;
    var summaryParts = [];
    if (overdueCount) summaryParts.push('<span style="color:#f87171;">' + overdueCount + ' overdue</span>');
    if (todayCount) summaryParts.push('<span style="color:#facc15;">' + todayCount + ' due today</span>');
    summaryParts.push(tasks.length + ' total');
    var sl = eid('tasks-summary-line');
    if (sl) sl.innerHTML = summaryParts.join(' &nbsp;·&nbsp; ');
  }

  window.setTaskFilter = function(f, btn) {
    _taskFilter = f;
    document.querySelectorAll('#tasks-filter-row button').forEach(function(b) {
      var active = b === btn;
      b.style.background = active ? 'rgba(170,255,62,0.12)' : 'rgba(255,255,255,0.04)';
      b.style.borderColor = active ? 'rgba(170,255,62,0.3)' : 'rgba(255,255,255,0.08)';
      b.style.color = active ? '#aaff3e' : '#6b7a96';
    });
    window.renderTaskList();
  };
  window.setTaskSort = function(v) { _taskSort = v; window.renderTaskList(); };
  window.setTaskCatFilter = function(v) { _taskCatFilter = v; window.renderTaskList(); };

  /* ── Task modal (create / edit) ── */
  function openTaskModal(prefill, editId) {
    var old = eid('esq-task-ol'); if (old) old.remove();
    var cats = getTaskCategories();
    var ol = cel('div', 'email-detail-overlay'); ol.id = 'esq-task-ol';
    var modal = cel('div', 'email-detail-modal');
    modal.style.cssText = 'max-width:520px;width:96%;max-height:90vh;overflow-y:auto;padding:0;';

    var pf = prefill || {};
    var title = editId ? 'Edit Task' : 'New Task';

    var hdr = cel('div', '');
    hdr.style.cssText = 'padding:16px 20px;border-bottom:1px solid rgba(255,255,255,0.07);display:flex;align-items:center;justify-content:space-between;';
    var hdrTitle = cel('div', '');
    hdrTitle.style.cssText = 'font-size:16px;font-weight:700;color:#eef3fc;';
    hdrTitle.textContent = title;
    var xBtn = cel('button', 'email-detail-close', '&#x2715;');
    xBtn.style.cssText = 'position:relative;top:0;right:0;';
    xBtn.addEventListener('click', function() { ol.remove(); });
    hdr.appendChild(hdrTitle); hdr.appendChild(xBtn);

    var body = cel('div', '');
    body.style.cssText = 'padding:20px;display:flex;flex-direction:column;gap:14px;';

    function field(labelTxt, inputEl) {
      var wrap = cel('div', '');
      wrap.style.cssText = 'display:flex;flex-direction:column;gap:5px;';
      var lbl = cel('label', '');
      lbl.style.cssText = 'font-size:11px;font-weight:700;color:#6b7a96;text-transform:uppercase;letter-spacing:.06em;';
      lbl.textContent = labelTxt;
      wrap.appendChild(lbl); wrap.appendChild(inputEl);
      return wrap;
    }
    var inputStyle = 'background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.1);color:#eef3fc;font-size:13px;padding:9px 12px;border-radius:8px;font-family:inherit;width:100%;outline:none;';

    var titleIn = cel('input', '');
    titleIn.type = 'text'; titleIn.placeholder = 'Task title *'; titleIn.value = pf.title || '';
    titleIn.style.cssText = inputStyle;

    var descIn = cel('textarea', '');
    descIn.placeholder = 'Description (optional)'; descIn.value = pf.description || '';
    descIn.style.cssText = inputStyle + 'resize:vertical;min-height:72px;';

    var catSel = cel('select', '');
    catSel.style.cssText = inputStyle + 'cursor:pointer;';
    cats.forEach(function(c) {
      var o = document.createElement('option'); o.value = c; o.textContent = c;
      if (c === (pf.category || 'General')) o.selected = true;
      catSel.appendChild(o);
    });
    var newCatOpt = document.createElement('option'); newCatOpt.value = '__new__'; newCatOpt.textContent = '+ New Category…';
    catSel.appendChild(newCatOpt);
    catSel.addEventListener('change', function() {
      if (catSel.value === '__new__') {
        var nc = prompt('New category name:');
        if (nc && nc.trim()) {
          var newCats = getTaskCategories();
          if (!newCats.includes(nc.trim())) { newCats.push(nc.trim()); saveTaskCategories(newCats); }
          var o2 = document.createElement('option'); o2.value = nc.trim(); o2.textContent = nc.trim();
          catSel.insertBefore(o2, newCatOpt);
          catSel.value = nc.trim();
        } else {
          catSel.value = pf.category || 'General';
        }
      }
    });

    var priSel = cel('select', '');
    priSel.style.cssText = inputStyle + 'cursor:pointer;';
    [['urgent','🔴 Urgent'],['high','🟠 High'],['medium','🟡 Medium'],['low','🟢 Low']].forEach(function(p) {
      var o = document.createElement('option'); o.value = p[0]; o.textContent = p[1];
      if (p[0] === (pf.priority || 'medium')) o.selected = true;
      priSel.appendChild(o);
    });

    var statusSel = null;
    if (editId) {
      statusSel = cel('select', '');
      statusSel.style.cssText = inputStyle + 'cursor:pointer;';
      [['pending','Pending'],['in_progress','In Progress'],['completed','Completed']].forEach(function(s) {
        var o = document.createElement('option'); o.value = s[0]; o.textContent = s[1];
        if (s[0] === (pf.status || 'pending')) o.selected = true;
        statusSel.appendChild(o);
      });
    }

    // Due date + time row
    var dueDateIn = cel('input', '');
    dueDateIn.type = 'date';
    dueDateIn.style.cssText = inputStyle + 'flex:1;';
    var dueTimeIn = cel('input', '');
    dueTimeIn.type = 'time';
    dueTimeIn.style.cssText = inputStyle + 'flex:1;';
    if (pf.dueDate) {
      var dd = new Date(pf.dueDate);
      if (!isNaN(dd)) {
        var y = dd.getFullYear(), mo = String(dd.getMonth()+1).padStart(2,'0'), dy = String(dd.getDate()).padStart(2,'0');
        dueDateIn.value = y + '-' + mo + '-' + dy;
        dueTimeIn.value = String(dd.getHours()).padStart(2,'0') + ':' + String(dd.getMinutes()).padStart(2,'0');
      }
    }
    var dueDateRow = cel('div', '');
    dueDateRow.style.cssText = 'display:flex;gap:8px;';
    dueDateRow.appendChild(dueDateIn); dueDateRow.appendChild(dueTimeIn);

    var alertIn = cel('input', '');
    alertIn.type = 'number'; alertIn.min = '0'; alertIn.max = '10080';
    alertIn.value = (pf.alertMinBefore !== undefined ? pf.alertMinBefore : 30);
    alertIn.style.cssText = inputStyle;

    body.appendChild(field('Title *', titleIn));
    body.appendChild(field('Description', descIn));
    body.appendChild(field('Category', catSel));
    body.appendChild(field('Priority', priSel));
    if (statusSel) body.appendChild(field('Status', statusSel));
    body.appendChild(field('Due Date & Time', dueDateRow));
    body.appendChild(field('Alert (minutes before due)', alertIn));

    if (pf.sourceEmailSubject) {
      var srcNote = cel('div', '');
      srcNote.style.cssText = 'background:rgba(170,255,62,0.05);border:1px solid rgba(170,255,62,0.15);border-radius:8px;padding:8px 12px;font-size:11px;color:#6b7a96;';
      srcNote.innerHTML = '📧 From email: <span style="color:#aaff3e;">' + escH(pf.sourceEmailSubject) + '</span>';
      body.appendChild(srcNote);
    }

    var foot = cel('div', '');
    foot.style.cssText = 'padding:14px 20px;border-top:1px solid rgba(255,255,255,0.07);display:flex;gap:10px;justify-content:flex-end;';
    var cancelBtn = cel('button', '', 'Cancel');
    cancelBtn.style.cssText = 'background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.1);color:#8a97b5;font-size:12px;font-weight:600;padding:8px 18px;border-radius:8px;cursor:pointer;font-family:inherit;';
    cancelBtn.addEventListener('click', function() { ol.remove(); });
    var saveBtn = cel('button', '', editId ? 'Save Changes' : 'Create Task');
    saveBtn.style.cssText = 'background:rgba(170,255,62,0.12);border:1px solid rgba(170,255,62,0.3);color:#aaff3e;font-size:12px;font-weight:700;padding:8px 18px;border-radius:8px;cursor:pointer;font-family:inherit;';
    saveBtn.addEventListener('click', function() {
      var t = titleIn.value.trim();
      if (!t) { titleIn.style.borderColor = '#f87171'; titleIn.focus(); return; }
      var dueIso = null;
      if (dueDateIn.value) {
        var timeVal = dueTimeIn.value || '09:00';
        dueIso = new Date(dueDateIn.value + 'T' + timeVal).toISOString();
      }
      var data = {
        title: t,
        description: descIn.value.trim(),
        category: catSel.value === '__new__' ? 'General' : catSel.value,
        priority: priSel.value,
        status: statusSel ? statusSel.value : (pf.status || 'pending'),
        dueDate: dueIso,
        alertMinBefore: parseInt(alertIn.value, 10) || 30,
        sourceEmailId: pf.sourceEmailId || null,
        sourceEmailSubject: pf.sourceEmailSubject || null
      };
      if (editId) {
        updateTask(editId, data);
      } else {
        createTask(data);
      }
      ol.remove();
      if (eid('tasks-page-content')) { window.loadTasks(); }
      injectTasksWidget();
    });
    foot.appendChild(cancelBtn); foot.appendChild(saveBtn);

    modal.appendChild(hdr); modal.appendChild(body); modal.appendChild(foot);
    ol.appendChild(modal);
    ol.addEventListener('click', function(e) { if (e.target === ol) ol.remove(); });
    document.body.appendChild(ol);
    setTimeout(function() { titleIn.focus(); }, 100);
  }

  window.openNewTask = function(prefill) { openTaskModal(prefill || {}, null); };
  window.openEditTask = function(taskId) {
    var tasks = getAllTasks();
    var t = tasks.find(function(x) { return x.id === taskId; });
    if (!t) return;
    openTaskModal(t, taskId);
  };

  /* ── Manage Categories modal ── */
  window.openManageCategories = function() {
    var old = eid('esq-catmgr-ol'); if (old) old.remove();
    var ol = cel('div', 'email-detail-overlay'); ol.id = 'esq-catmgr-ol';
    var modal = cel('div', 'email-detail-modal');
    modal.style.cssText = 'max-width:440px;width:96%;max-height:88vh;overflow-y:auto;';

    var xBtn = cel('button', 'email-detail-close', '&#x2715;');
    xBtn.addEventListener('click', function() { ol.remove(); });
    var hdrEl = cel('div', '');
    hdrEl.style.cssText = 'font-size:16px;font-weight:700;color:#eef3fc;margin-bottom:4px;';
    hdrEl.textContent = '🏷️ Manage Categories';
    var subEl = cel('div', '');
    subEl.style.cssText = 'font-size:12px;color:#6b7a96;margin-bottom:16px;';
    subEl.textContent = 'Add, rename, or remove task categories.';

    var listWrap = cel('div', ''); listWrap.id = 'cat-mgr-list';
    function renderCatList() {
      var cats = getTaskCategories();
      listWrap.innerHTML = '';
      cats.forEach(function(c, idx) {
        var row = cel('div', '');
        row.style.cssText = 'display:flex;align-items:center;gap:8px;padding:8px 0;border-bottom:1px solid rgba(255,255,255,0.05);';
        var nameEl = cel('div', '');
        nameEl.style.cssText = 'flex:1;font-size:13px;color:#eef3fc;';
        nameEl.textContent = c;
        var renBtn = cel('button', '', 'Rename');
        renBtn.style.cssText = 'background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.1);color:#8a97b5;font-size:11px;padding:3px 10px;border-radius:6px;cursor:pointer;';
        renBtn.addEventListener('click', function() {
          var nv = prompt('Rename category:', c);
          if (!nv || !nv.trim() || nv.trim() === c) return;
          var cc = getTaskCategories();
          cc[idx] = nv.trim();
          saveTaskCategories(cc);
          // update tasks using old name
          var tasks = getAllTasks();
          tasks.forEach(function(t) { if (t.category === c) t.category = nv.trim(); });
          saveAllTasks(tasks);
          renderCatList();
        });
        var delBtn = cel('button', '', '✕');
        delBtn.style.cssText = 'background:rgba(248,113,113,0.08);border:1px solid rgba(248,113,113,0.2);color:#f87171;font-size:11px;padding:3px 8px;border-radius:6px;cursor:pointer;';
        delBtn.addEventListener('click', function() {
          if (!confirm('Delete category "' + c + '"? Tasks will move to General.')) return;
          var cc = getTaskCategories();
          cc.splice(idx, 1);
          saveTaskCategories(cc);
          var tasks = getAllTasks();
          tasks.forEach(function(t) { if (t.category === c) t.category = 'General'; });
          saveAllTasks(tasks);
          renderCatList();
        });
        row.appendChild(nameEl); row.appendChild(renBtn); row.appendChild(delBtn);
        listWrap.appendChild(row);
      });
    }
    renderCatList();

    var addRow = cel('div', '');
    addRow.style.cssText = 'display:flex;gap:8px;margin-top:14px;';
    var addIn = cel('input', '');
    addIn.type = 'text'; addIn.placeholder = 'New category name';
    addIn.style.cssText = 'flex:1;background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.1);color:#eef3fc;font-size:12px;padding:7px 10px;border-radius:8px;font-family:inherit;outline:none;';
    var addBtn = cel('button', '', '+ Add');
    addBtn.style.cssText = 'background:rgba(170,255,62,0.1);border:1px solid rgba(170,255,62,0.25);color:#aaff3e;font-size:12px;font-weight:700;padding:7px 14px;border-radius:8px;cursor:pointer;font-family:inherit;';
    addBtn.addEventListener('click', function() {
      var v = addIn.value.trim();
      if (!v) return;
      var cc = getTaskCategories();
      if (!cc.includes(v)) { cc.push(v); saveTaskCategories(cc); }
      addIn.value = '';
      renderCatList();
    });
    addIn.addEventListener('keydown', function(e) { if (e.key === 'Enter') addBtn.click(); });
    addRow.appendChild(addIn); addRow.appendChild(addBtn);

    modal.appendChild(xBtn); modal.appendChild(hdrEl); modal.appendChild(subEl);
    modal.appendChild(listWrap); modal.appendChild(addRow);
    ol.appendChild(modal);
    ol.addEventListener('click', function(e) { if (e.target === ol) ol.remove(); });
    document.body.appendChild(ol);
  };

  /* ── Task Alerts ── */
  function scheduleTaskAlerts() {
    // Clear existing timers
    Object.keys(_taskAlertTimers).forEach(function(k) { clearTimeout(_taskAlertTimers[k]); });
    _taskAlertTimers = {};

    var tasks = getAllTasks();
    var alerted = getAlerted();
    var now = Date.now();

    tasks.forEach(function(t) {
      if (t.status === 'completed' || !t.dueDate) return;
      var dueMs = new Date(t.dueDate).getTime();
      var alertMs = dueMs - (t.alertMinBefore || 30) * 60000;
      var delayMs = alertMs - now;

      // Already past due and not alerted yet — alert immediately
      if (dueMs < now && !alerted[t.id + '_overdue']) {
        alerted[t.id + '_overdue'] = true;
        setAlerted(alerted);
        setTimeout(function() {
          notify('⚠️ Task Overdue: ' + t.title, 'Category: ' + t.category + ' · ' + PRIORITY_LABELS[t.priority], 'task-overdue-' + t.id, function() {
            if (typeof window.showDashTab === 'function') window.showDashTab('tasks-tab', document.getElementById('dash-nav-tasks'));
          });
          playSound('chime');
        }, 500);
        return;
      }

      if (delayMs > 0 && !alerted[t.id + '_pre']) {
        _taskAlertTimers[t.id] = setTimeout(function() {
          var al2 = getAlerted(); al2[t.id + '_pre'] = true; setAlerted(al2);
          notify('⏰ Task Due Soon: ' + t.title, (t.alertMinBefore || 30) + ' min until due · ' + t.category, 'task-pre-' + t.id, function() {
            if (typeof window.showDashTab === 'function') window.showDashTab('tasks-tab', document.getElementById('dash-nav-tasks'));
          });
          playSound('chime');
        }, delayMs);
      }
    });
  }

  /* ── Inbox widget ── */
  function injectTasksWidget() { return; /* removed — Tasks tab accessible via right sidebar */
    var inboxTab = eid('inbox-tab');
    if (!inboxTab) return;
    var old = eid('esq-tasks-widget'); if (old) old.remove();

    var tasks = getAllTasks();
    var widgetTasks = tasks.filter(function(t) {
      return t.status !== 'completed' && (isOverdue(t) || isDueToday(t));
    }).sort(function(a, b) {
      if (isOverdue(a) && !isOverdue(b)) return -1;
      if (!isOverdue(a) && isOverdue(b)) return 1;
      return (PRIORITY_ORDER[a.priority] || 2) - (PRIORITY_ORDER[b.priority] || 2);
    }).slice(0, 6);

    var widget = cel('div', '');
    widget.id = 'esq-tasks-widget';
    widget.style.cssText = 'background:rgba(10,14,24,0.8);border:1px solid rgba(255,255,255,0.07);border-radius:12px;padding:14px 16px;margin:0 0 16px;';

    var wHdr = cel('div', '');
    wHdr.style.cssText = 'display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;';
    var wTitle = cel('div', '');
    wTitle.style.cssText = 'font-size:12px;font-weight:700;color:#aaff3e;text-transform:uppercase;letter-spacing:.08em;';
    wTitle.textContent = '📋 Tasks';
    var wLink = cel('a', '');
    wLink.style.cssText = 'font-size:11px;color:#aaff3e;cursor:pointer;text-decoration:none;';
    wLink.textContent = 'View all →';
    wLink.addEventListener('click', function() {
      if (typeof window.showDashTab === 'function') window.showDashTab('tasks-tab', document.getElementById('dash-nav-tasks'));
    });
    wHdr.appendChild(wTitle); wHdr.appendChild(wLink);
    widget.appendChild(wHdr);

    if (widgetTasks.length === 0) {
      var empty = cel('div', '');
      empty.style.cssText = 'font-size:12px;color:#4a5568;text-align:center;padding:8px 0;';
      empty.textContent = 'No overdue or today tasks';
      widget.appendChild(empty);
    } else {
      widgetTasks.forEach(function(t) {
        var pc = PRIORITY_COLORS[t.priority] || '#6b7a96';
        var row = cel('div', '');
        row.style.cssText = 'display:flex;align-items:center;gap:8px;padding:5px 0;border-bottom:1px solid rgba(255,255,255,0.04);cursor:pointer;';
        row.addEventListener('click', function() {
          if (typeof window.showDashTab === 'function') window.showDashTab('tasks-tab', document.getElementById('dash-nav-tasks'));
        });
        var dot = cel('span', '');
        dot.style.cssText = 'width:7px;height:7px;border-radius:50%;background:' + pc + ';flex-shrink:0;';
        var titleEl = cel('span', '');
        titleEl.style.cssText = 'flex:1;font-size:12px;color:#eef3fc;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;';
        titleEl.textContent = t.title;
        var timeEl = cel('span', '');
        timeEl.style.cssText = 'font-size:10px;color:' + (isOverdue(t) ? '#f87171' : '#6b7a96') + ';flex-shrink:0;';
        timeEl.textContent = t.dueDate ? fmtDue(t.dueDate) : '';
        row.appendChild(dot); row.appendChild(titleEl); row.appendChild(timeEl);
        widget.appendChild(row);
      });
    }

    var wAddBtn = cel('button', '');
    wAddBtn.style.cssText = 'margin-top:10px;width:100%;background:rgba(170,255,62,0.06);border:1px solid rgba(170,255,62,0.15);color:#aaff3e;font-size:11px;font-weight:600;padding:5px 0;border-radius:7px;cursor:pointer;font-family:inherit;';
    wAddBtn.textContent = '+ New Task';
    wAddBtn.addEventListener('click', function() { window.openNewTask({}); });
    widget.appendChild(wAddBtn);

    // Inject at top of inbox-tab
    inboxTab.insertBefore(widget, inboxTab.firstChild);
  }

  /* ── "Create Task from Email" button in email detail modal ── */
  var _origOpenEmailDetail = window.openEmailDetail;
  window.openEmailDetail = function(email) {
    _origOpenEmailDetail(email);
    // Add task button to the action row after a tick
    setTimeout(function() {
      var actRow = document.querySelector('#esq-ed .email-detail-actions');
      if (!actRow || actRow.querySelector('#esq-task-from-email-btn')) return;
      var taskBtn = cel('button', 'email-action-btn', '📋 Task');
      taskBtn.id = 'esq-task-from-email-btn';
      taskBtn.addEventListener('click', function() {
        var ol = eid('esq-ed'); if (ol) ol.remove();
        window.openNewTask({
          sourceEmailId: email.id,
          sourceEmailSubject: email.subject,
          title: 'Follow up: ' + (email.subject || ''),
          description: 'From: ' + (email.from || '')
        });
      });
      // Insert before Close button
      var closeBtn = actRow.querySelector('.email-action-btn:not(.primary):not(.danger)');
      if (closeBtn) actRow.insertBefore(taskBtn, closeBtn);
      else actRow.appendChild(taskBtn);
    }, 50);
  };

  /* ── Google Tasks sync ── */
  window.syncGoogleTasks = function() {
    var supaUrl = window.SUPA_URL || 'https://kbwcsmctwtgrjtjcghkt.supabase.co';
    var supaKey = window.SUPA_KEY || '';

    var btn = document.querySelector('[onclick="window.syncGoogleTasks()"]');
    if (btn) { btn.textContent = '↻ Syncing…'; btn.disabled = true; }

    fetchToken().then(function(token) {
      if (!token) {
        if (btn) { btn.textContent = '↻ Google Tasks'; btn.disabled = false; }
        showTaskScopeModal('No Google session found. Please sign in with Google to sync tasks.');
        return;
      }

      fetch(supaUrl + '/functions/v1/gmail-calendar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'apikey': supaKey, 'Authorization': 'Bearer ' + supaKey },
        body: JSON.stringify({ action: 'google_tasks_list', provider_token: token })
      })
      .then(function(r) { return r.json(); })
      .then(function(data) {
        if (btn) { btn.textContent = '↻ Google Tasks'; btn.disabled = false; }
        if (data.needsScope || (data.error && !data.tasks)) {
          showTaskScopeModal(data.error || 'Google Tasks access required.');
          return;
        }
        var imported = 0;
        var updated  = 0;
        var existing = getAllTasks();
        /* build map of googleTaskId → local task id for upsert */
        var gIdMap = {};
        existing.forEach(function(t) { if (t.googleTaskId) gIdMap[t.googleTaskId] = t.id; });

        (data.tasks || []).forEach(function(gt) {
          if (!gt.id || !gt.title) return;
          var status = gt.status === 'completed' ? 'completed' : 'pending';
          var dueDate = gt.due ? new Date(gt.due).toISOString() : null;
          if (gIdMap[gt.id]) {
            /* update existing */
            updateTask(gIdMap[gt.id], { title: gt.title, description: gt.notes || '', status: status, dueDate: dueDate });
            updated++;
          } else {
            /* create new */
            createTask({
              title: gt.title,
              description: gt.notes || '',
              category: gt._listTitle || 'General',
              priority: 'medium',
              status: status,
              dueDate: dueDate,
              googleTaskId: gt.id
            });
            imported++;
          }
        });

        if (eid('tasks-page-content')) window.loadTasks();
        var msg = imported > 0 || updated > 0
          ? (imported ? imported + ' imported' : '') + (imported && updated ? ', ' : '') + (updated ? updated + ' updated' : '') + ' from Google Tasks.'
          : 'Google Tasks are up to date.';
        showToastMsg(msg);
      })
      .catch(function(err) {
        if (btn) { btn.textContent = '↻ Google Tasks'; btn.disabled = false; }
        showTaskScopeModal('Could not connect to Google Tasks. ' + (err.message || ''));
      });
    }); /* end fetchToken */
  };

  function showTaskScopeModal(msg) {
    var old = eid('esq-scope-ol'); if (old) old.remove();
    var ol = cel('div', 'email-detail-overlay'); ol.id = 'esq-scope-ol';
    var modal = cel('div', 'email-detail-modal');
    modal.style.cssText = 'max-width:440px;width:96%;padding:28px 24px;text-align:center;';
    var icon = cel('div', ''); icon.style.cssText = 'font-size:36px;margin-bottom:12px;'; icon.textContent = '🔑';
    var hd = cel('div', ''); hd.style.cssText = 'font-size:16px;font-weight:700;color:#eef3fc;margin-bottom:8px;'; hd.textContent = 'Google Tasks Access Needed';
    var bd = cel('div', ''); bd.style.cssText = 'font-size:13px;color:#8a97b5;line-height:1.6;margin-bottom:20px;'; bd.textContent = msg + ' To enable Google Tasks sync, reconnect your Google account and grant the Tasks permission when prompted.';
    var closeBtn = cel('button', '');
    closeBtn.style.cssText = 'background:rgba(170,255,62,0.12);border:1px solid rgba(170,255,62,0.3);color:#aaff3e;font-size:13px;font-weight:700;padding:9px 24px;border-radius:8px;cursor:pointer;font-family:inherit;';
    closeBtn.textContent = 'Got it';
    closeBtn.addEventListener('click', function() { ol.remove(); });
    modal.appendChild(icon); modal.appendChild(hd); modal.appendChild(bd); modal.appendChild(closeBtn);
    ol.appendChild(modal);
    ol.addEventListener('click', function(e) { if (e.target === ol) ol.remove(); });
    document.body.appendChild(ol);
  }

  /* ── ARIA briefing integration ── */
  var _origAriaWelcome = window.loadAriaWelcome;
  window.loadAriaWelcome = function() {
    if (typeof _origAriaWelcome === 'function') _origAriaWelcome();
    // Inject task summary into ARIA briefing if element exists
    setTimeout(function() {
      var briefEl = eid('aria-briefing-tasks');
      if (!briefEl) return;
      var tasks = getAllTasks();
      var ov = tasks.filter(function(t) { return isOverdue(t); }).length;
      var td = tasks.filter(function(t) { return isDueToday(t) && t.status !== 'completed'; }).length;
      if (ov || td) {
        briefEl.style.display = 'block';
        briefEl.innerHTML = '📋 <strong>' + (ov ? ov + ' overdue task' + (ov>1?'s':'') : '') + (ov&&td?' and ':'') + (td ? td + ' task' + (td>1?'s':'') + ' due today' : '') + '</strong> — <a href="#" style="color:#aaff3e;" onclick="event.preventDefault();window.showDashTab(\'tasks-tab\',document.getElementById(\'dash-nav-tasks\'))">View tasks →</a>';
      }
    }, 400);
  };

  /* ── showToastMsg helper (if not defined) ── */
  if (typeof showToastMsg === 'undefined') {
    var showToastMsg = function(msg) {
      var t = document.createElement('div');
      t.style.cssText = 'position:fixed;bottom:24px;left:50%;transform:translateX(-50%);background:rgba(8,20,8,0.97);border:1px solid rgba(170,255,62,0.4);color:#aaff3e;font-size:13px;font-weight:700;padding:10px 24px;border-radius:10px;z-index:99999;font-family:Barlow,sans-serif;';
      t.textContent = msg;
      document.body.appendChild(t);
      setTimeout(function() { if (t.parentNode) t.remove(); }, 2500);
    };
  }

  /* ── Public init ── */
  window.initTasks = function() {
    updateTasksBadge();
    scheduleTaskAlerts();
    setTimeout(injectTasksWidget, 300);
  };

  /* ═══════════════════════════════════════════════════════════════════════
     🧭  RIGHT SIDEBAR — Gmail-style view switcher (Email / Calendar / Tasks)
  ═══════════════════════════════════════════════════════════════════════ */
  function injectRightSidebar() {
    if (eid('esq-right-sidebar')) return;

    var sidebar = cel('div', '');
    sidebar.id = 'esq-right-sidebar';
    sidebar.style.cssText = [
      'position:fixed',
      'right:0',
      'top:50%',
      'transform:translateY(-50%)',
      'z-index:1200',
      'display:flex',
      'flex-direction:column',
      'align-items:center',
      'gap:6px',
      'padding:10px 6px',
      'background:rgba(6,8,15,0.92)',
      'border:1px solid rgba(255,255,255,0.07)',
      'border-right:none',
      'border-radius:14px 0 0 14px',
      'backdrop-filter:blur(12px)',
      '-webkit-backdrop-filter:blur(12px)',
      'box-shadow:-4px 0 24px rgba(0,0,0,0.4)',
    ].join(';');

    var tabs = [
      {
        id: 'esq-rsb-email',
        tabId: 'inbox-tab',
        navId: 'dash-nav-inbox',
        label: 'Inbox',
        svg: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="4" width="20" height="16" rx="3"/><polyline points="2,4 12,13 22,4"/></svg>'
      },
      {
        id: 'esq-rsb-cal',
        tabId: 'fullcal-tab',
        navId: 'dash-nav-fullcal',
        label: 'Calendar',
        svg: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="3"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="16" y1="2" x2="16" y2="6"/><rect x="7" y="13" width="3" height="3" rx="0.5" fill="currentColor" stroke="none"/><rect x="14" y="13" width="3" height="3" rx="0.5" fill="currentColor" stroke="none"/></svg>'
      },
      {
        id: 'esq-rsb-tasks',
        tabId: 'tasks-tab',
        navId: 'dash-nav-tasks',
        label: 'Tasks',
        svg: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><polyline points="9,11 12,14 22,4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>'
      }
    ];

    function getActiveTab() {
      var pages = document.querySelectorAll('.page.main.dash-tab');
      for (var i = 0; i < pages.length; i++) {
        if (pages[i].style.display !== 'none') return pages[i].id;
      }
      return 'inbox-tab';
    }

    function updateActive() {
      var active = getActiveTab();
      tabs.forEach(function(t) {
        var btn = eid(t.id);
        if (!btn) return;
        var isActive = active === t.tabId;
        btn.style.background   = isActive ? 'rgba(170,255,62,0.18)' : 'transparent';
        btn.style.color        = isActive ? '#aaff3e' : '#4a5568';
        btn.style.borderColor  = isActive ? 'rgba(170,255,62,0.4)' : 'transparent';
        btn.style.boxShadow    = isActive ? '0 0 12px rgba(170,255,62,0.15)' : 'none';
        var dot = btn.querySelector('.rsb-dot');
        if (dot) dot.style.opacity = isActive ? '1' : '0';
      });
    }

    tabs.forEach(function(t) {
      var wrap = cel('div', '');
      wrap.style.cssText = 'position:relative;display:flex;align-items:center;';

      /* active indicator dot on left edge */
      var dot = cel('div', 'rsb-dot');
      dot.style.cssText = 'position:absolute;left:-6px;width:3px;height:24px;background:#aaff3e;border-radius:2px;opacity:0;transition:opacity .2s;';

      var btn = cel('button', '');
      btn.id = t.id;
      btn.title = t.label;
      btn.innerHTML = t.svg;
      btn.style.cssText = [
        'width:42px',
        'height:42px',
        'border-radius:10px',
        'border:1px solid transparent',
        'background:transparent',
        'color:#4a5568',
        'cursor:pointer',
        'display:flex',
        'align-items:center',
        'justify-content:center',
        'transition:all .18s ease',
        'font-family:inherit',
        'flex-direction:column',
        'gap:2px',
        'padding:0',
      ].join(';');

      /* label beneath icon */
      var lbl = cel('div', '');
      lbl.style.cssText = 'font-size:8px;font-weight:700;letter-spacing:.04em;color:inherit;font-family:Barlow,sans-serif;line-height:1;';
      lbl.textContent = t.label.toUpperCase();

      /* rebuild btn to include label */
      btn.innerHTML = '';
      var iconWrap = cel('div', '');
      iconWrap.style.cssText = 'position:relative;display:flex;align-items:center;justify-content:center;';
      iconWrap.innerHTML = t.svg;

      /* badges — email: unread, calendar: today's events, tasks: overdue+today */
      var badgeCfg = {
        'esq-rsb-email':    { id: 'esq-rsb-email-badge',    bg: '#f87171' },
        'esq-rsb-cal':      { id: 'esq-rsb-cal-badge',      bg: '#64afff' },
        'esq-rsb-tasks':    { id: 'esq-rsb-tasks-badge',    bg: '#f5c542' }
      };
      if (badgeCfg[t.id]) {
        var rsbBadge = cel('span', '');
        rsbBadge.id = badgeCfg[t.id].id;
        rsbBadge.style.cssText = 'display:none;position:absolute;top:-5px;right:-5px;min-width:16px;height:16px;background:'+badgeCfg[t.id].bg+';color:#fff;font-size:9px;font-weight:800;border-radius:8px;padding:0 4px;line-height:16px;text-align:center;font-family:Barlow,sans-serif;border:1.5px solid rgba(6,8,15,0.9);';
        iconWrap.appendChild(rsbBadge);
      }

      btn.appendChild(iconWrap);
      btn.appendChild(lbl);

      btn.addEventListener('mouseenter', function() {
        if (btn.style.color !== 'rgb(170, 255, 62)') {
          btn.style.background = 'rgba(255,255,255,0.05)';
          btn.style.color = '#8a97b5';
        }
      });
      btn.addEventListener('mouseleave', function() {
        updateActive();
      });

      btn.addEventListener('click', function() {
        if (t.tabId === 'fullcal-tab') {
          if (typeof window.showDashTab === 'function') window.showDashTab(t.tabId, eid(t.navId));
          if (typeof window.initFullCalendar === 'function') window.initFullCalendar();
        } else {
          if (typeof window.showDashTab === 'function') window.showDashTab(t.tabId, eid(t.navId));
        }
        setTimeout(updateActive, 60);
      });

      wrap.appendChild(dot);
      wrap.appendChild(btn);
      sidebar.appendChild(wrap);
    });

    /* ARIA sparkle brand mark at bottom */
    var brand = cel('div', '');
    brand.style.cssText = 'margin-top:8px;padding-top:8px;border-top:1px solid rgba(255,255,255,0.07);display:flex;align-items:center;justify-content:center;width:100%;';
    var spark = cel('div', '');
    spark.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="#aaff3e" opacity="0.35"><path d="M12 2 L13.5 9 L20 12 L13.5 15 L12 22 L10.5 15 L4 12 L10.5 9 Z"/></svg>';
    brand.appendChild(spark);
    sidebar.appendChild(brand);

    document.body.appendChild(sidebar);

    /* Seed badges from whatever is already available */
    (function seedBadges() {
      /* email */
      var topBadge = eid('inbox-badge');
      var rsbEmail = eid('esq-rsb-email-badge');
      if (topBadge && rsbEmail) {
        var n = parseInt(topBadge.textContent, 10) || 0;
        if (n > 0) { rsbEmail.textContent = n > 99 ? '99+' : n; rsbEmail.style.display = 'inline-block'; }
      }
      /* tasks */
      updateSidebarTasksBadge();
      /* calendar */
      updateSidebarCalBadge();
    })();

    /* Hook into showDashTab to keep active state fresh */
    var _origSdt = window.showDashTab;
    window.showDashTab = function(tabId, el) {
      if (typeof _origSdt === 'function') _origSdt(tabId, el);
      setTimeout(updateActive, 80);
    };

    updateActive();

    /* Re-check visibility: only show when user is on the dashboard */
    function syncVisibility() {
      var dash = eid('dashboard-view') || eid('page-dashboard') || document.querySelector('.dash-wrap');
      var onDash = dash ? dash.style.display !== 'none' : !!eid('inbox-tab');
      sidebar.style.opacity = onDash ? '1' : '0';
      sidebar.style.pointerEvents = onDash ? 'auto' : 'none';
    }
    setInterval(syncVisibility, 2000);
    syncVisibility();
  }

  /* Expose so onSignedIn can call it */
  window.initRightSidebar = function() {
    setTimeout(injectRightSidebar, 800);
  };

})();
