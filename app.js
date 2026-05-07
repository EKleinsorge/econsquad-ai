
/* EconSquad App Extensions v05.04.1740 */
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
  function getTag(from, subject, snippet) {
    var f = (from || '').toLowerCase(), s = (subject || '').toLowerCase(), sn = (snippet || '').toLowerCase();
    var all = s + ' ' + sn + ' ' + f;
    if (/\brfi\b|request for information|site selection/.test(all)) return { label: 'RFI', color: '#64afff', bg: 'rgba(100,175,255,0.15)', border: 'rgba(100,175,255,0.35)', icon: '&#128205;', priority: true };
    if (/\bgrant\b|cdbg|eda|usda|funding|weda/.test(all)) return { label: 'GRANT', color: '#f5c542', bg: 'rgba(245,197,66,0.15)', border: 'rgba(245,197,66,0.35)', icon: '&#128176;', priority: true };
    if (/\bbre\b|business retention/.test(all)) return { label: 'BRE', color: '#32e1c8', bg: 'rgba(50,225,200,0.15)', border: 'rgba(50,225,200,0.35)', icon: '&#129309;', priority: true };
    if (/incentive|tax credit|abatement|opportunity zone/.test(all)) return { label: 'INCENTIVE', color: '#c88cff', bg: 'rgba(200,140,255,0.15)', border: 'rgba(200,140,255,0.35)', icon: '&#128142;', priority: true };
    if (/workforce|labor|talent|training/.test(all)) return { label: 'WORKFORCE', color: '#aaff3e', bg: 'rgba(170,255,62,0.15)', border: 'rgba(170,255,62,0.35)', icon: '&#128119;', priority: true };
    if (/prospect|generate leads|attendee/.test(all)) return { label: 'PROSPECT', color: '#ff9b41', bg: 'rgba(255,155,65,0.15)', border: 'rgba(255,155,65,0.35)', icon: '&#127919;', priority: true };
    if (/undeliverable|bounced|could not be delivered/.test(all)) return { label: 'BOUNCE', color: '#ff8080', bg: 'rgba(255,80,80,0.12)', border: 'rgba(255,80,80,0.7)', icon: '&#9888;', bounce: true };
    if (/appointment|notif.*appoint/.test(all)) return { label: 'APPT', color: '#aaff3e', bg: 'rgba(170,255,62,0.12)', border: 'rgba(170,255,62,0.6)', icon: '&#128197;' };
    if (/calendar|no events scheduled/.test(all)) return { label: 'CAL', color: '#64afff', bg: 'rgba(100,175,255,0.12)', border: 'rgba(100,175,255,0.5)', icon: '&#128467;' };
    if (/loopnet|costar|listing|property/.test(all)) return { label: 'SITE', color: '#64afff', bg: 'rgba(100,175,255,0.12)', border: 'rgba(100,175,255,0.5)', icon: '&#127962;' };
    if (/github|gitlab|jira/.test(f + s)) return { label: 'SYSTEM', color: '#6b7a96', bg: 'rgba(165,185,210,0.10)', border: 'rgba(165,185,210,0.4)', icon: '&#9881;' };
    if (/ebay|marketplace|bid|auction/.test(all)) return { label: 'MARKET', color: '#ff9b41', bg: 'rgba(255,155,65,0.10)', border: 'rgba(255,155,65,0.5)', icon: '&#128722;' };
    if (/southwest|airline|flight|hotel|travel/.test(all)) return { label: 'TRAVEL', color: '#82dcff', bg: 'rgba(130,220,255,0.12)', border: 'rgba(130,220,255,0.5)', icon: '&#9992;' };
    if (/netflix|hulu|disney|spotify|membership|subscription/.test(all)) return { label: 'SUBSCR', color: '#c88cff', bg: 'rgba(200,140,255,0.10)', border: 'rgba(200,140,255,0.5)', icon: '&#128250;' };
    if (/walgreens|cvs|pharmacy|health|medical/.test(all)) return { label: 'HEALTH', color: '#32e1c8', bg: 'rgba(50,225,200,0.10)', border: 'rgba(50,225,200,0.5)', icon: '&#128138;' };
    if (/survey|feedback|how.*doing|recommend/.test(all)) return { label: 'SURVEY', color: '#a5b9d2', bg: 'rgba(165,185,210,0.10)', border: 'rgba(165,185,210,0.4)', icon: '&#11088;' };
    if (/newsletter|digest|alert|notification/.test(all)) return { label: 'ALERT', color: '#82dcff', bg: 'rgba(130,220,255,0.12)', border: 'rgba(130,220,255,0.5)', icon: '&#128276;' };
    if (/sale|promo|discount|credit|deal|coupon/.test(all)) return { label: 'PROMO', color: '#b8930a', bg: 'rgba(255,220,100,0.08)', border: 'rgba(255,220,100,0.4)', icon: '&#127991;' };
    if (/support|ticket|re:|fwd:|help/.test(all)) return { label: 'SUPPORT', color: '#6b7a96', bg: 'rgba(255,255,255,0.06)', border: 'rgba(255,255,255,0.2)', icon: '&#128295;' };
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
    var handle = cel('div', 'email-detail-handle');
    var xBtn = cel('button', 'email-detail-close', '&#x2715;');
    xBtn.addEventListener('click', function() { ol.remove(); });
    var tagEl = cel('span', 'email-type-tag');
    tagEl.style.cssText = 'background:' + tag.bg + ';color:' + tag.color + ';border:1px solid ' + tag.border + ';margin-bottom:12px;display:inline-block;';
    tagEl.innerHTML = tag.icon + ' ' + tag.label;
    var fromEl = cel('div', 'email-detail-from', escH(name) + ' &bull; ' + dateStr);
    var subEl = cel('div', 'email-detail-subject', escH(email.subject || '(no subject)'));
    var bodyEl = cel('div', 'email-detail-body', escH(email.snippet || 'No preview available.'));
    var actRow = cel('div', 'email-detail-actions');
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
    var trashBtn = cel('button', 'email-action-btn danger', '&#128465; Trash');
    trashBtn.addEventListener('click', function() { window.trashEmailCard(email.id || '', null, email); ol.remove(); });
    actRow.appendChild(closeBtn);
    actRow.appendChild(trashBtn);
    modal.appendChild(handle);
    modal.appendChild(xBtn);
    modal.appendChild(tagEl);
    modal.appendChild(fromEl);
    modal.appendChild(subEl);
    modal.appendChild(bodyEl);
    modal.appendChild(actRow);
    ol.appendChild(modal);
    ol.addEventListener('click', function(e) { if (e.target === ol) ol.remove(); });
    document.body.appendChild(ol);
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
    fetchToken().then(function(token) {
      if (!token) return;
      fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/' + emailId + '/trash', {
        method: 'POST', headers: { 'Authorization': 'Bearer ' + token }
      }).catch(function() {});
    });
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
    fetchToken().then(function(token) {
      if (!token) return;
      fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/' + emailId + '/untrash', {
        method: 'POST', headers: { 'Authorization': 'Bearer ' + token }
      }).catch(function() {});
    });
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
    var tag = getTag(email.from || '', email.subject || '', email.snippet || '');
    var name = senderName(email.from || '');
    var raw = (email.from || '').match(/<([^>]+)>/);
    var addr = raw ? raw[1] : ((email.from || '').indexOf('@') > -1 ? email.from : '');
    var d = new Date(email.date), now = new Date();
    var t = isNaN(d) ? '' : (d.toDateString() === now.toDateString() ? d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }));
    var tc = tag ? ' tag-' + tag.label.toLowerCase().replace(/[^a-z]/g, '') : '';
    var div = cel('div', 'email-card-v2' + tc);
    div.dataset.email = JSON.stringify({ id: email.id, from: email.from, subject: email.subject, snippet: email.snippet, date: email.date });
    var tagHtml = tag ? '<span class="email-type-tag" style="background:' + tag.bg + ';color:' + tag.color + ';border:1px solid ' + tag.border + ';">' + tag.icon + ' ' + tag.label + '</span>' : '';
    var bg = avatarColor(name), fc = bg.indexOf('aaff3e') > -1 ? '#1a3300' : '#fff';
    div.innerHTML =
      '<div class="email-card-top">' +
        '<div class="email-avatar-v2" style="background:' + bg + ';color:' + fc + '">' + initials(name) + '</div>' +
        '<div class="email-sender-block"><div class="email-sender-name">' + escH(name) + '</div><div class="email-sender-addr">' + escH(addr) + '</div></div>' +
        '<div class="email-meta-right"><span class="email-time">' + t + '</span>' + tagHtml + '</div>' +
      '</div>' +
      '<div class="email-subject">' + escH(email.subject || '(no subject)') + '</div>' +
      '<div class="email-preview">' + escH(email.snippet || '') + '</div>';
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
      var m = (email.from || '').match(/<([^>]+)>/);
      var to = m ? m[1] : (email.from || '');
      window.open('https://mail.google.com/mail/?view=cm&fs=1&to=' + encodeURIComponent(to) + '&su=' + encodeURIComponent('Re: ' + (email.subject || '')));
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
      fetchToken().then(function(token) {
        if (!token) return;
        fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/' + emailId + '/trash', {
          method: 'POST', headers: { 'Authorization': 'Bearer ' + token }
        }).catch(function() {});
      });
      window.showTrashBanner();
      if (card) {
        animateEmailToTrash(card, function() { card.remove(); refreshInboxCount(); });
      }
    });
    actRow.appendChild(replyBtn); actRow.appendChild(archBtn); actRow.appendChild(trashBtn);
    div.appendChild(actRow);
    return div;
  }

  /* ── INSTALL OVERRIDES ── */
  function install() {
    if (typeof window.showEmailList !== 'function' || typeof window.escHtml !== 'function') {
      setTimeout(install, 300); return;
    }
    window.showEmailList = function(emails) {
      window._lastEmails = emails;
      var list = eid('email-list'); if (!list) return;
      var trashLog = getTrashLog(), permDeleted = getPermDeleted();
      emails = (emails || []).filter(function(e) { return !trashLog[e.id] && !permDeleted[e.id]; });
      if (!emails.length) {
        list.innerHTML = '<div style="text-align:center;padding:60px;color:#4a5568;"><div style="font-size:32px;">&#128235;</div><div style="margin-top:8px;">No unread emails</div></div>';
        return;
      }
      var tagged = emails.filter(function(e) { return getTag(e.from || '', e.subject || '', e.snippet || '').priority; });
      var others = emails.filter(function(e) { return !getTag(e.from || '', e.subject || '', e.snippet || '').priority; });
      list.innerHTML = '';
      tagged.concat(others).forEach(function(e) { list.appendChild(renderCard(e)); });
      var lbl = eid('unread-count-label');
      if (lbl) lbl.textContent = emails.length + ' unread | ' + tagged.length + ' priority';
      var badge = eid('inbox-badge');
      if (badge && emails.length > 0) { badge.textContent = emails.length; badge.style.display = 'inline'; }
      list.addEventListener('click', function(e) {
        if (e.target.closest('button')) return;
        var card = e.target.closest('.email-card-v2');
        if (!card || !card.dataset.email) return;
        try { window.openEmailDetail(JSON.parse(card.dataset.email)); } catch (err) {}
      });
      setTimeout(function() { window.autoPurgeTrash(); window.showTrashBanner(); }, 600);
    };
    window.renderEmailCard = renderCard;
    injectReportBtn();
    initHomeChat();
  }

  install();
  setTimeout(injectReportBtn, 1500);
  setTimeout(initHomeChat, 1500);
})();
