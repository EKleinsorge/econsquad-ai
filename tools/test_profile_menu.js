/* ============================================================
   THE PROFILE MENU: THE LOGO TOGGLE AND THE PLAN LABEL

   Drives the REAL index.html in Chromium with Supabase stubbed, and asks
   the questions a user would ask:

     - I uploaded a logo. Is the switch that turns it on visible?
     - I am on Pro. Does the menu say Pro?

   !! IT DOES NOT GREP THE SOURCE. Both defects here would have passed a
   source-text check: the toggle row's markup was always present and
   correct, it was just never un-hidden; and the plan label was a
   perfectly valid line of JavaScript saying something false. Only
   running it and reading the DOM catches either.

   Every case runs against both the patched file and the original, and
   the run fails if the original does not reproduce the bug - a test
   that cannot fail on the broken version is not testing anything.

   Usage: node test_profile_menu.js <file.html> [--expect-broken]
   ============================================================ */
const { chromium } = require('playwright');
const http = require('http');
const fs = require('fs');
const path = require('path');

const EXE = (function(){
  const roots = fs.readdirSync('/opt/pw-browsers').filter(d => d.startsWith('chromium-'));
  for (const r of roots) {
    const p = '/opt/pw-browsers/' + r + '/chrome-linux/chrome';
    if (fs.existsSync(p)) return p;
  }
  throw new Error('no chromium under /opt/pw-browsers');
})();

const FILE = process.argv[2];
const EXPECT_BROKEN = process.argv.includes('--expect-broken');
if (!FILE) { console.error('usage: node test_profile_menu.js <file.html>'); process.exit(2); }

let passed = 0, failed = 0;
const fails = [];
function ok(name, cond) {
  if (cond) { passed++; console.log('  ok   ' + name); }
  else { failed++; fails.push(name); console.log('  FAIL ' + name); }
}

/* A one-file static server. The page's CDN <script> tags fail offline,
   which is fine: window.supabase is installed before any of them run. */
function serve(file, port) {
  const html = fs.readFileSync(file);
  return new Promise((res) => {
    const s = http.createServer((req, rep) => {
      if (req.url.split('?')[0] === '/index.html' || req.url === '/') {
        rep.writeHead(200, { 'Content-Type': 'text/html' }); rep.end(html);
      } else { rep.writeHead(404); rep.end(); }
    });
    s.listen(port, () => res(s));
  });
}

/* The stub returns whatever profile row the case asks for. */
function initScript(profile) {
  return `(() => {
    const ROW = ${JSON.stringify(profile)};
    const chain = {};
    ['from','select','eq','order','limit','insert','upsert','delete','ilike',
     'gte','lte','neq','in','is','update','maybeSingle']
      .forEach(k => chain[k] = () => chain);
    chain.single = () => Promise.resolve({ data: ROW, error: null });
    chain.then = (r) => Promise.resolve({ data: [{ id: 'u1' }], error: null }).then(r);
    window.__supaWrites = [];
    chain.update = (v) => { window.__supaWrites.push(v); return chain; };
    window.supabase = { createClient: () => ({
      auth: {
        getSession: async () => ({ data: { session: null } }),
        getUser:    async () => ({ data: { user: null } }),
        onAuthStateChange: () => ({ data: { subscription: { unsubscribe(){} } } }),
      },
      from: () => chain,
      channel: () => ({ on(){ return this; }, subscribe(){ return this; } }),
    })};
  })()`;
}

async function withPage(profile, port, fn) {
  /* The bundled headless shell is pinned to a build this container does
     not carry. Point at the chromium that IS installed rather than
     downloading one - the network refuses it anyway. */
  const browser = await chromium.launch({ executablePath: EXE });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.addInitScript(initScript(profile));
  await page.goto('http://localhost:' + port + '/index.html', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(900);
  await page.evaluate(() => {
    try { localStorage.clear(); } catch (e) {}
    window.currentUser = { id: 'u1', email: 'demo@econsquad.ai', user_metadata: {} };
  });
  const out = await fn(page, errors);
  await browser.close();
  return out;
}

/* A 1x1 PNG, so FileReader produces a real data: URL. */
const PNG_B64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

(async () => {
  const port = 8911;
  const server = await serve(FILE, port);
  console.log('\nTESTING  ' + path.basename(path.dirname(FILE)) + '/' + path.basename(FILE));

  /* ---- 1. the logo toggle -------------------------------------- */
  console.log('\nAFTER UPLOADING A LOGO, THE SWITCH THAT TURNS IT ON IS VISIBLE');
  const logo = await withPage({ plan: 'pro', is_admin: false }, port, async (page) => {
    const before = await page.evaluate(() =>
      getComputedStyle(document.getElementById('logo-toggle-row')).display);

    await page.evaluate(async (b64) => {
      const bin = atob(b64);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      const file = new File([bytes], 'logo.png', { type: 'image/png' });
      handleLogoUpload({ files: [file] });      // exactly what onchange passes
      await new Promise((r) => setTimeout(r, 400));   // FileReader is async
    }, PNG_B64);

    return await page.evaluate(() => ({
      rowDisplay: getComputedStyle(document.getElementById('logo-toggle-row')).display,
      previewShown: getComputedStyle(document.getElementById('logo-preview-img')).display,
      iconHidden: getComputedStyle(document.getElementById('logo-preview-icon')).display,
      navAvatar: (document.getElementById('user-logo') || {}).style
        ? document.getElementById('user-logo').style.display : 'no-el',
      wroteLogo: (window.__supaWrites || []).some((w) => 'logo_url' in w),
      before: null,
    })).then((r) => Object.assign(r, { before }));
  });

  ok('the row starts hidden (nothing uploaded yet)', logo.before === 'none');
  ok('!! THE TOGGLE IS VISIBLE AFTER UPLOAD', logo.rowDisplay === 'flex');
  ok('the thumbnail shows', logo.previewShown === 'block');
  ok('the placeholder icon is hidden', logo.iconHidden === 'none');
  ok('the nav avatar switches to the logo', logo.navAvatar === 'block');
  ok('the logo is written to the profile', logo.wroteLogo === true);

  /* ---- 2. the plan label --------------------------------------- */
  console.log('\nTHE MENU SAYS WHAT YOU ACTUALLY PAY FOR');
  const day = 86400000;
  const cases = [
    ['a Pro subscriber',        { plan: 'pro' },                                     /pro squad/i,      /trial/i],
    ['a Starter subscriber',    { plan: 'starter' },                                 /starter/i,        /trial/i],
    ['someone 9 days into a trial',
                                { plan: 'trial', trial_end: new Date(Date.now() + 9 * day).toISOString() },
                                                                                     /9 days left/i,    /14/],
    ['someone whose trial ended',
                                { plan: 'trial', trial_end: new Date(Date.now() - 3 * day).toISOString() },
                                                                                     /ended/i,          /days left/i],
    ['a beta tester',           { plan: 'trial', is_beta_tester: true,
                                  beta_expires_at: new Date(Date.now() + 30 * day).toISOString() },
                                                                                     /beta/i,           /trial —/i],
  ];

  for (const [who, profile, want, mustNot] of cases) {
    const text = await withPage(Object.assign({ is_admin: false }, profile), port, async (page) => {
      await page.evaluate(() => { toggleProfileMenu(); });
      await page.waitForTimeout(350);
      return await page.evaluate(() => document.getElementById('pm-plan').textContent.trim());
    });
    ok(who + ' sees "' + text + '"', want.test(text));
    ok('  ...and is not told ' + mustNot, !mustNot.test(text));
  }

  await new Promise((r) => server.close(r));

  console.log('\n' + (passed + failed) + ' checks, ' + passed + ' passed, ' + failed + ' failed');

  if (EXPECT_BROKEN) {
    /* Run against the ORIGINAL file. The point is not that it fails but
       that it fails on the RIGHT things. */
    const wantBroken = [
      '!! THE TOGGLE IS VISIBLE AFTER UPLOAD',
      'a Pro subscriber sees',
    ];
    const missed = wantBroken.filter((w) => !fails.some((f) => f.startsWith(w)));
    if (missed.length) {
      console.log('\n!! THE ORIGINAL DID NOT REPRODUCE: ' + missed.join(', '));
      console.log('   Either the bug was not what we thought, or this test does not reach it.');
      process.exit(1);
    }
    console.log('\nthe original reproduces both defects, as expected');
    process.exit(0);
  }

  process.exit(failed ? 1 : 0);
})();
