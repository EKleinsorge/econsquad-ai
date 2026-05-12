/**
 * auth-nav.js — Loaded by all static marketing/blog pages.
 * Checks for an active Supabase session and, if found, swaps the nav
 * so logged-in users see "← Back to Dashboard" instead of Sign In / Start Trial.
 */
(function () {
  var SUPA_URL = 'https://kbwcsmctwtgrjtjcghkt.supabase.co';
  var SUPA_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imtid2NzbWN0d3Rncmp0amNnaGt0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzcxOTQzNzIsImV4cCI6MjA5Mjc3MDM3Mn0.tOOFb3qwXuYQGVcyt__lg3WLiFxqGZnOPDZA8Zs-XP4';

  function applyLoggedIn() {
    /* 1. Swap every "Home" nav link → "← Dashboard" */
    document.querySelectorAll('.nav-links a[href="index.html"]').forEach(function (a) {
      a.textContent = '← Dashboard';
      a.style.color = '#aaff3e';
      a.style.fontWeight = '700';
    });

    /* 2. Replace the CTA buttons (Sign In + Start Trial) with a single back button */
    var ctas = document.querySelector('.nav-ctas');
    if (ctas) {
      ctas.innerHTML =
        '<a href="index.html" style="'
        + 'background:#aaff3e;color:#1a3300;font-size:13px;font-weight:800;'
        + 'padding:8px 18px;border-radius:8px;text-decoration:none;'
        + 'display:inline-flex;align-items:center;gap:6px;'
        + 'font-family:\'DM Sans\',sans-serif;transition:opacity .2s,transform .15s;"'
        + ' onmouseover="this.style.opacity=\'.85\'" onmouseout="this.style.opacity=\'1\'">'
        + '← Back to Dashboard</a>';
    }

    /* 3. On Monday Drop / blog post pages: update "Back to Blog" link to also
          offer a dashboard return — replace text to make it clearer */
    document.querySelectorAll('a.back-link[href="blog.html"]').forEach(function (a) {
      /* Keep "Back to Blog" but add a dashboard shortcut next to it */
      a.insertAdjacentHTML('afterend',
        ' &nbsp;<a href="index.html" style="'
        + 'display:inline-flex;align-items:center;gap:4px;font-size:13px;font-weight:700;'
        + 'color:#aaff3e;text-decoration:none;margin-left:8px;" '
        + 'onmouseover="this.style.opacity=\'.75\'" onmouseout="this.style.opacity=\'1\'">'
        + '⚡ Dashboard</a>');
    });
  }

  /* Wait for Supabase SDK to be available (loaded via CDN in the page) */
  function tryCheck() {
    if (typeof supabase === 'undefined' || typeof supabase.createClient !== 'function') {
      setTimeout(tryCheck, 80);
      return;
    }
    try {
      var client = supabase.createClient(SUPA_URL, SUPA_KEY);
      client.auth.getSession().then(function (res) {
        if (res && res.data && res.data.session) {
          applyLoggedIn();
        }
      });
    } catch (e) { /* silent — no session or SDK issue */ }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', tryCheck);
  } else {
    tryCheck();
  }
})();
