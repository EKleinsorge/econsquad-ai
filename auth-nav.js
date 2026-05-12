/**
 * auth-nav.js — Loaded by all static marketing/blog pages.
 * Checks for an active Supabase session and, if found, swaps the nav
 * so logged-in users see a contextual back button instead of Sign In / Start Trial.
 *
 * Back destination logic:
 *   blog post or Monday Drop page  → blog.html  (natural back-nav hierarchy)
 *   blog index / all other pages   → index.html?ret=1  (skips ARIA splash)
 */
(function () {
  var SUPA_URL = 'https://kbwcsmctwtgrjtjcghkt.supabase.co';
  var SUPA_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imtid2NzbWN0d3Rncmp0amNnaGt0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzcxOTQzNzIsImV4cCI6MjA5Mjc3MDM3Mn0.tOOFb3qwXuYQGVcyt__lg3WLiFxqGZnOPDZA8Zs-XP4';

  /* Detect page type */
  var page = window.location.pathname.split('/').pop() || '';
  var isBlogPost = /^(blog-|monday-drop-)/.test(page); /* blog article or Monday Drop */

  var dashDest  = isBlogPost ? 'blog.html' : 'index.html?ret=1';
  var dashLabel = isBlogPost ? '← Back to Blog' : '← Back to Dashboard';

  function applyLoggedIn() {
    /* 1. Swap "Home" nav link to contextual back destination */
    document.querySelectorAll('.nav-links a[href="index.html"]').forEach(function (a) {
      a.href = dashDest;
      a.textContent = dashLabel;
      a.style.color = '#aaff3e';
      a.style.fontWeight = '700';
    });

    /* 2. Replace Sign In + Start Trial CTA buttons with a single back button */
    var ctas = document.querySelector('.nav-ctas');
    if (ctas) {
      ctas.innerHTML =
        '<a href="' + dashDest + '" style="'
        + 'background:#aaff3e;color:#1a3300;font-size:13px;font-weight:800;'
        + 'padding:8px 18px;border-radius:8px;text-decoration:none;'
        + 'display:inline-flex;align-items:center;gap:6px;'
        + 'font-family:\'DM Sans\',sans-serif;transition:opacity .2s,transform .15s;"'
        + ' onmouseover="this.style.opacity=\'.85\'" onmouseout="this.style.opacity=\'1\'">'
        + dashLabel + '</a>';
    }

    /* 3. On blog post / Monday Drop pages: the in-article back link already
          goes to blog.html — just add a "Dashboard" shortcut beside it */
    if (isBlogPost) {
      document.querySelectorAll('a.back-link[href="blog.html"]').forEach(function (a) {
        a.insertAdjacentHTML('afterend',
          '&nbsp;&nbsp;<a href="index.html?ret=1" style="'
          + 'display:inline-flex;align-items:center;gap:4px;font-size:13px;font-weight:700;'
          + 'color:#aaff3e;text-decoration:none;margin-left:4px;" '
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
      var client = supabase.createClient(SUPA_URL, SUPA_KEY);
      client.auth.getSession().then(function (res) {
        if (res && res.data && res.data.session) {
          applyLoggedIn();
        }
      });
    } catch (e) { /* silent */ }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', tryCheck);
  } else {
    tryCheck();
  }
})();
