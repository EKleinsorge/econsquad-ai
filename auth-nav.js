/**
 * auth-nav.js v3 — Loaded by all static marketing/blog pages.
 * When a Supabase session exists, replaces Sign In / Start Trial with
 * "← Back to Dashboard" (uses ?ret=1 to skip the ARIA welcome splash).
 */
(function () {
  var SUPA_URL = 'https://kbwcsmctwtgrjtjcghkt.supabase.co';
  var SUPA_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imtid2NzbWN0d3Rncmp0amNnaGt0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzcxOTQzNzIsImV4cCI6MjA5Mjc3MDM3Mn0.tOOFb3qwXuYQGVcyt__lg3WLiFxqGZnOPDZA8Zs-XP4';

  /* index.html?ret=1 tells the app to skip the ARIA splash and restore last tab */
  var DASH = 'index.html?ret=1';

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
        if (res && res.data && res.data.session) applyLoggedIn();
      });
    } catch (e) {}
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', tryCheck);
  } else {
    tryCheck();
  }
})();
