/**
 * auth-nav.js v4 — Loaded by all static marketing/blog pages.
 * - When logged in: swaps nav to "← Back to Dashboard"
 * - On Monday Drop pages when NOT logged in: shows archive gate overlay
 */
(function () {
  var SUPA_URL = 'https://kbwcsmctwtgrjtjcghkt.supabase.co';
  var SUPA_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imtid2NzbWN0d3Rncmp0amNnaGt0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzcxOTQzNzIsImV4cCI6MjA5Mjc3MDM3Mn0.tOOFb3qwXuYQGVcyt__lg3WLiFxqGZnOPDZA8Zs-XP4';

  /* index.html?ret=1 tells the app to skip the ARIA splash and restore last tab */
  var DASH = 'index.html?ret=1';

  function showArchiveGate() {
    /* Only gate Monday Drop pages */
    var page = window.location.pathname.split('/').pop() || '';
    if (!/^monday-drop-/.test(page)) return;

    /* Inject keyframe animation once */
    if (!document.getElementById('aria-gate-styles')) {
      var style = document.createElement('style');
      style.id = 'aria-gate-styles';
      style.textContent = '@keyframes ariaGatePulse{'
        + '0%,100%{box-shadow:0 0 0 0 rgba(170,255,62,0.6),0 0 16px 4px rgba(170,255,62,0.3);transform:scale(1);}'
        + '50%{box-shadow:0 0 0 14px rgba(170,255,62,0),0 0 28px 10px rgba(170,255,62,0.55);transform:scale(1.1);}}'
        + '@keyframes ariaGateRing{'
        + '0%{transform:scale(0.9);opacity:0.8;}'
        + '100%{transform:scale(2.4);opacity:0;}}';
      document.head.appendChild(style);
    }

    var gate = document.createElement('div');
    gate.id = 'archive-gate';
    gate.style.cssText = 'position:fixed;inset:0;z-index:99999;display:flex;align-items:center;justify-content:center;padding:24px;'
      + 'background:linear-gradient(to top,rgba(4,5,13,1) 0%,rgba(4,5,13,0.7) 100%);backdrop-filter:blur(8px);';
    gate.innerHTML = '<div style="max-width:460px;width:100%;background:rgba(14,20,36,0.97);border:1px solid rgba(170,255,62,0.25);border-radius:20px;padding:44px 36px;text-align:center;">'
      + '<div style="position:relative;width:64px;height:64px;margin:0 auto 24px;">'
      + '<div style="position:absolute;top:0;left:0;width:64px;height:64px;border-radius:50%;border:2px solid rgba(170,255,62,0.6);animation:ariaGateRing 2s ease-out infinite;"></div>'
      + '<div style="position:absolute;top:0;left:0;width:64px;height:64px;border-radius:50%;border:2px solid rgba(170,255,62,0.4);animation:ariaGateRing 2s ease-out 0.7s infinite;"></div>'
      + '<div style="position:absolute;top:0;left:0;width:64px;height:64px;border-radius:50%;background:radial-gradient(circle at 35% 35%,#d4ff70,#aaff3e 50%,#5a9900);animation:ariaGatePulse 2s ease-in-out infinite;"></div>'
      + '</div>'
      + '<div style="font-family:\'Barlow Condensed\',sans-serif;font-size:26px;font-weight:900;color:#eef3fc;margin-bottom:10px;line-height:1.2;">This is a members-only issue</div>'
      + '<p style="font-size:14px;color:#6b7a96;line-height:1.7;margin-bottom:28px;">Create a free EconSquad AI account to access all archived issues of the Monday AI for ED Drop — plus your own AI economic development squad.</p>'
      + '<a href="/index.html" onclick="sessionStorage.setItem(\'esq_open_auth\',\'signup\');return true;" style="display:block;background:#aaff3e;color:#1a3300;font-family:\'DM Sans\',sans-serif;font-size:15px;font-weight:800;padding:14px 28px;border-radius:10px;text-decoration:none;margin-bottom:12px;">Start free trial — get full access</a>'
      + '<a href="/index.html" onclick="sessionStorage.setItem(\'esq_open_auth\',\'signin\');return true;" style="display:block;border:1px solid rgba(255,255,255,0.12);color:#8a97b5;font-size:13px;font-weight:600;padding:11px 28px;border-radius:10px;text-decoration:none;">Already have an account? Sign in</a>'
      + '</div>';
    document.body.appendChild(gate);

    /* Blur the article content behind the gate */
    var wrap = document.querySelector('.article-wrap');
    if (wrap) wrap.style.filter = 'blur(4px)';
  }

  function applyLoggedIn() {
    /* 1. Swap every "Home" nav link → Back to Dashboard */
    document.querySelectorAll('.nav-links a[href="index.html"]').forEach(function (a) {
      a.href = DASH;
      a.textContent = '← Dashboard';
      a.style.color = '#aaff3e';
      a.style.fontWeight = '700';
    });

    /* 2. Replace Sign In + Start Trial CTA buttons with a single back button */
    var ctas = document.querySelector('.nav-ctas');
    if (ctas) {
      ctas.innerHTML =
        '<a href="' + DASH + '" style="'
        + 'background:#aaff3e;color:#1a3300;font-size:13px;font-weight:800;'
        + 'padding:8px 18px;border-radius:8px;text-decoration:none;'
        + 'display:inline-flex;align-items:center;gap:6px;'
        + 'font-family:\'DM Sans\',sans-serif;transition:opacity .2s;"'
        + ' onmouseover="this.style.opacity=\'.85\'" onmouseout="this.style.opacity=\'1\'">'
        + '← Back to Dashboard</a>';
    }

    /* 3. On Monday Drop / blog post article pages: add a Dashboard shortcut
          beside the existing "← Back to Blog" in-article link */
    var page = window.location.pathname.split('/').pop() || '';
    if (/^(blog-|monday-drop-)/.test(page)) {
      document.querySelectorAll('a.back-link[href="blog.html"]').forEach(function (a) {
        if (a.dataset.dashAdded) return;
        a.dataset.dashAdded = '1';
        a.insertAdjacentHTML('afterend',
          '&nbsp;&nbsp;<a href="' + DASH + '" style="'
          + 'display:inline-flex;align-items:center;gap:4px;font-size:13px;font-weight:700;'
          + 'color:#aaff3e;text-decoration:none;" '
          + 'onmouseover="this.style.opacity=\'.75\'" onmouseout="this.style.opacity=\'1\'">'
          + '⚡ Dashboard</a>');
      });
    }
  }

  /* Wait for Supabase SDK (loaded via CDN script tag in each page) */
  function tryCheck() {
    if (typeof supabase === 'undefined' || typeof supabase.createClient !== 'function') {
      setTimeout(tryCheck, 80);
      return;
    }
    try {
      supabase.createClient(SUPA_URL, SUPA_KEY).auth.getSession().then(function (res) {
        if (res && res.data && res.data.session) {
          applyLoggedIn();
        } else {
          showArchiveGate();
        }
      });
    } catch (e) { showArchiveGate(); }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', tryCheck);
  } else {
    tryCheck();
  }
})();
