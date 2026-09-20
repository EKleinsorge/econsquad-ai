/* ═══════════════════════════════════════════════════════════════════
   THE IMPORT PANEL, DRIVEN IN A REAL BROWSER

   chatgpt-import.js is tested on its own in tools/test_chatgpt_zip.js.
   This tests the wiring: the panel opens, a real zip is read in the
   page, the person is shown what will be sent, nothing goes over the
   wire until they press the button, and the proposals they tick are
   the ones that get written.

   ⚠️ THE ASSERTION THAT MATTERS MOST IS THE ONE ABOUT THE REQUEST
   BODY. Every fetch is captured, so the test can state as a fact that
   what left the browser was the digest and not the file. A privacy
   claim in the interface is worth nothing unless something checks it.

   Usage: node test_import_panel.js <index.html> [--expect-broken]
   ═══════════════════════════════════════════════════════════════════ */
const { chromium } = require('playwright');
const http = require('http');
const fs = require('fs');
const path = require('path');
const JSZip = require('jszip');

const EXE = (function () {
  for (const r of fs.readdirSync('/opt/pw-browsers').filter((d) => d.startsWith('chromium-'))) {
    const p = '/opt/pw-browsers/' + r + '/chrome-linux/chrome';
    if (fs.existsSync(p)) return p;
  }
  throw new Error('no chromium under /opt/pw-browsers');
})();

const FILE = process.argv[2];
if (!FILE) { console.error('usage: node test_import_panel.js <index.html>'); process.exit(2); }
const DIR = path.dirname(FILE);

let passed = 0, failed = 0;
function ok(name, cond) {
  if (cond) { passed++; console.log('  ok   ' + name); }
  else { failed++; console.log('  FAIL ' + name); }
}

/* Serve the page, its sibling reader, and a local stand-in for the
   JSZip CDN so the test does not depend on the network. */
function serve(port) {
  const jszipSrc = fs.readFileSync(require.resolve('jszip/dist/jszip.min.js'));
  return new Promise((res) => {
    const s = http.createServer((req, rep) => {
      const url = req.url.split('?')[0];
      if (url === '/' || url === '/index.html') {
        rep.writeHead(200, { 'Content-Type': 'text/html' });
        rep.end(fs.readFileSync(FILE));
      } else if (url === '/chatgpt-import.js') {
        rep.writeHead(200, { 'Content-Type': 'text/javascript' });
        rep.end(fs.readFileSync(path.join(DIR, 'chatgpt-import.js')));
      } else if (url === '/jszip.min.js') {
        rep.writeHead(200, { 'Content-Type': 'text/javascript' });
        rep.end(jszipSrc);
      } else { rep.writeHead(404); rep.end(); }
    });
    s.listen(port, () => res(s));
  });
}

/* ── the fixture export ───────────────────────────────────────── */
let clock = 1_700_000_000;
function msg(role, text, extra) {
  clock += 60;
  return Object.assign({
    id: 'm' + clock, author: { role },
    create_time: clock,
    content: { content_type: 'text', parts: [text] }, metadata: {},
  }, extra || {});
}
function convo(title, messages) {
  const mapping = {};
  messages.forEach((m, i) => { mapping[title + i] = { id: 'n' + i, message: m }; });
  return { title, create_time: clock, mapping };
}

const WORK = 'We are the Whoville County Industrial Development Agency, an IDA. '
  + 'We administer a PILOT agreement program and a revolving loan fund, and our '
  + 'top employers are Grinch Industries and Whoville Foods.';
const SECRET = 'My biopsy came back yesterday and the oncologist wants to discuss '
  + 'treatment. I have not told my wife. What should I ask at the appointment?';

const CONVERSATIONS = [
  convo('Agency', [msg('user', WORK)]),
  convo('Health', [msg('user', SECRET)]),
];

async function makeZip() {
  const zip = new JSZip();
  zip.file('conversations.json', JSON.stringify(CONVERSATIONS));
  zip.file('chat.html', '<html>a big useless file</html>');
  zip.file('user.json', JSON.stringify({ email: 'someone@example.org' }));
  return await zip.generateAsync({ type: 'nodebuffer' });
}

const PROPOSALS = {
  fields: [
    { key: 'legal_name', scope: 'org', label: 'Legal name', confidence: 'high',
      value: 'Whoville County Industrial Development Agency',
      evidence: 'We are the Whoville County Industrial Development Agency' },
    { key: 'incentive_programs', scope: 'org', label: 'Incentive programs', confidence: 'high',
      value: 'PILOT agreements and a revolving loan fund',
      evidence: 'We administer a PILOT agreement program and a revolving loan fund' },
    { key: 'tagline', scope: 'org', label: 'Tagline', confidence: 'low',
      value: 'Where business grows', evidence: 'We are the Whoville County' },
  ],
  rejected: 2,
};

function initScript() {
  return `(() => {
    window.__fetches = [];
    const realFetch = window.fetch;
    window.fetch = function (url, opts) {
      window.__fetches.push({ url: String(url), body: opts && opts.body ? String(opts.body) : '' });
      if (String(url).indexOf('/functions/v1/import-context') !== -1) {
        return Promise.resolve(new Response(JSON.stringify(${JSON.stringify(PROPOSALS)}),
          { status: 200, headers: { 'Content-Type': 'application/json' } }));
      }
      return realFetch.apply(this, arguments);
    };
    window.__writes = [];
    const chain = {};
    ['from','select','eq','order','limit','insert','delete','ilike','gte','lte',
     'neq','in','is','update','maybeSingle'].forEach((k) => chain[k] = () => chain);
    chain.single = () => Promise.resolve({ data: { plan: 'trial' }, error: null });
    chain.then = (r) => Promise.resolve({ data: [{ id: 'u1', user_id: 'u1', org_id: 1 }], error: null }).then(r);
    chain.upsert = (v) => { window.__writes.push(v); return chain; };
    window.supabase = { createClient: () => ({
      auth: {
        getSession: async () => ({ data: { session: { access_token: 'tok' } } }),
        getUser: async () => ({ data: { user: null } }),
        onAuthStateChange: () => ({ data: { subscription: { unsubscribe(){} } } }),
      },
      from: (t) => { chain.__table = t; return chain; },
      channel: () => ({ on(){ return this; }, subscribe(){ return this; } }),
    })};
  })()`;
}

(async () => {
  const port = 8913;
  const server = await serve(port);
  const zipBuf = await makeZip();
  const browser = await chromium.launch({ executablePath: EXE });
  const page = await browser.newPage({ viewport: { width: 1280, height: 950 } });
  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(e.message));

  await page.addInitScript(initScript());
  /* The page asks cdnjs for JSZip; serve our own copy so the test does
     not depend on the network being reachable. */
  await page.route('**/jszip.min.js', (route) =>
    route.fulfill({ status: 200, contentType: 'text/javascript',
                    body: fs.readFileSync(require.resolve('jszip/dist/jszip.min.js'), 'utf8') }));

  await page.goto('http://localhost:' + port + '/index.html', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1000);
  await page.evaluate(() => {
    try { localStorage.clear(); } catch (e) {}
    window.currentUser = { id: 'u1', email: 'demo@econsquad.ai', user_metadata: {} };
  });

  console.log('\nTHE READER IS LOADED BY THE PAGE');
  ok('ESQImport is on the page', await page.evaluate(() => typeof ESQImport === 'object'));
  ok('planSave came with it',    await page.evaluate(() => typeof ESQImport.planSave === 'function'));

  console.log('\nTHE PANEL OPENS FROM THE PROFILE MENU');
  ok('it starts hidden', await page.evaluate(() =>
    getComputedStyle(document.getElementById('esq-import-modal')).display) === 'none');
  await page.evaluate(() => esqOpenImport());
  await page.waitForTimeout(150);
  ok('and opens', await page.evaluate(() =>
    getComputedStyle(document.getElementById('esq-import-modal')).display) === 'flex');

  console.log('\nTHE PRIVACY LINE IS ABOVE THE FILE PICKER, NOT BELOW IT');
  const order = await page.evaluate(() => {
    const m = document.getElementById('esq-import-modal');
    const promise = [...m.querySelectorAll('div')].find((d) =>
      /never uploaded/i.test(d.textContent) && d.children.length === 0);
    const picker = document.getElementById('esq-imp-file');
    if (!promise || !picker) return 'missing';
    return (promise.compareDocumentPosition(picker) & Node.DOCUMENT_POSITION_FOLLOWING)
      ? 'before' : 'after';
  });
  ok('the promise comes before the picker in the document', order === 'before');

  console.log('\nREADING THE ZIP SENDS NOTHING');
  await page.setInputFiles('#esq-imp-file', {
    name: 'chatgpt-export.zip', mimeType: 'application/zip', buffer: zipBuf });
  await page.waitForTimeout(1200);

  const afterRead = await page.evaluate(() => ({
    fetches: window.__fetches.filter((f) => f.url.indexOf('import-context') !== -1).length,
    preview: getComputedStyle(document.getElementById('esq-imp-preview')).display,
    previewText: document.getElementById('esq-imp-preview-text').textContent,
    note: document.getElementById('esq-imp-zipnote').textContent,
    filename: document.getElementById('esq-imp-filename').textContent,
  }));
  ok('!! NOTHING HAS BEEN SENT YET',        afterRead.fetches === 0);
  ok('the file name is shown',             afterRead.filename.indexOf('chatgpt-export.zip') !== -1);
  ok('the digest preview is visible',      afterRead.preview === 'block');
  ok('it contains the work material',      afterRead.previewText.indexOf('PILOT agreement') !== -1);
  ok('!! IT DOES NOT CONTAIN THE BIOPSY',  afterRead.previewText.indexOf('biopsy') === -1);
  ok('...nor the rest of that message',    afterRead.previewText.indexOf('oncologist') === -1);
  ok('the counts are shown to the person', /conversation\(s\) read on this computer/.test(afterRead.note));

  console.log('\nONLY WHEN THEY PRESS THE BUTTON DOES ANYTHING LEAVE');
  await page.evaluate(() => esqImportRead());
  await page.waitForTimeout(600);
  const sent = await page.evaluate(() =>
    window.__fetches.filter((f) => f.url.indexOf('import-context') !== -1));
  ok('exactly one request was made', sent.length === 1);
  const body = sent.length ? JSON.parse(sent[0].body) : {};
  ok('!! THE BODY IS THE DIGEST, NOT THE FILE',
     typeof body.text === 'string' && body.text.indexOf('PILOT agreement') !== -1);
  ok('!! AND THE BIOPSY IS NOT IN THE REQUEST BODY',
     String(sent[0] && sent[0].body).indexOf('biopsy') === -1);
  ok('no chat.html or user.json went with it',
     String(sent[0] && sent[0].body).indexOf('a big useless file') === -1
     && String(sent[0] && sent[0].body).indexOf('someone@example.org') === -1);
  ok('the source is recorded as the zip', body.source === 'chatgpt_zip');

  console.log('\nTHE PROPOSALS ARE SHOWN WITH THEIR EVIDENCE');
  const shown = await page.evaluate(() => ({
    step2: getComputedStyle(document.getElementById('esq-imp-step2')).display,
    text: document.getElementById('esq-imp-fields').textContent,
    summary: document.getElementById('esq-imp-summary').textContent,
    boxes: [...document.querySelectorAll('[data-esqimp]')].map((b) => b.checked),
  }));
  ok('the proposal list is showing',   shown.step2 === 'block');
  ok('three fields',                   shown.boxes.length === 3);
  ok('each shows where it came from',  (shown.text.match(/from your own words/g) || []).length === 3);
  ok('!! THE LOW-CONFIDENCE ONE IS LEFT UNTICKED',
     shown.boxes[0] === true && shown.boxes[1] === true && shown.boxes[2] === false);
  ok('the summary says nothing is saved yet', /Nothing is saved until you press Save/i.test(shown.summary));
  ok('and reports what was discarded',        /2 further suggestion/.test(shown.summary));

  console.log('\nA SOLO USER IS TOLD WHERE THE HOMELESS FIELDS GO');
  const where = await page.evaluate(() => document.getElementById('esq-imp-where').textContent);
  ok('notes are explained', /saved to your notes/i.test(where));
  ok('and which ones',      /Incentive programs/.test(where));

  console.log('\nSAVING WRITES ONLY WHAT IS TICKED');
  await page.evaluate(() => esqImportSave());
  await page.waitForTimeout(400);
  const writes = await page.evaluate(() => window.__writes);
  ok('one write, to the personal profile', writes.length === 1);
  const w = writes[0] || {};
  ok('the legal name landed as org_name',  w.org_name === 'Whoville County Industrial Development Agency');
  ok('!! THE UNTICKED TAGLINE WAS NOT SAVED',
     JSON.stringify(w).indexOf('Where business grows') === -1);
  ok('the homeless field went to notes',
     String(w.notes || '').indexOf('PILOT agreements and a revolving loan fund') !== -1);
  ok('it is keyed on the user',            w.user_id === 'u1');
  ok('the panel closed',  await page.evaluate(() =>
     getComputedStyle(document.getElementById('esq-import-modal')).display) === 'none');

  console.log('\nA FILE THAT IS NOT AN EXPORT SAYS SO, AND SENDS NOTHING');
  const notAnExport = await (async () => {
    const z = new JSZip(); z.file('holiday.txt', 'nothing to see');
    return await z.generateAsync({ type: 'nodebuffer' });
  })();
  await page.evaluate(() => { window.__fetches = []; esqOpenImport(); });
  await page.setInputFiles('#esq-imp-file', {
    name: 'holiday.zip', mimeType: 'application/zip', buffer: notAnExport });
  await page.waitForTimeout(900);
  const err = await page.evaluate(() => ({
    shown: getComputedStyle(document.getElementById('esq-imp-error')).display,
    text: document.getElementById('esq-imp-error').textContent,
    sent: window.__fetches.filter((f) => f.url.indexOf('import-context') !== -1).length,
  }));
  ok('an error is shown',        err.shown === 'block');
  ok('it names the real cause',  /conversations\.json/.test(err.text));
  ok('and nothing was sent',     err.sent === 0);

  console.log('\nPASTING WORKS ON ITS OWN');
  await page.evaluate(() => {
    window.__fetches = [];
    esqOpenImport();
    document.getElementById('esq-imp-paste').value =
      'I run the Whoville County IDA. We administer PILOT agreements.';
    esqImportRead();
  });
  await page.waitForTimeout(500);
  const pasted = await page.evaluate(() =>
    window.__fetches.filter((f) => f.url.indexOf('import-context') !== -1));
  ok('one request', pasted.length === 1);
  ok('marked as a paste', JSON.parse(pasted[0].body).source === 'paste');
  ok('carrying what they typed',
     JSON.parse(pasted[0].body).text.indexOf('Whoville County IDA') !== -1);

  console.log('\nAN EMPTY SUBMISSION IS REFUSED BEFORE THE NETWORK');
  await page.evaluate(() => { window.__fetches = []; esqOpenImport(); esqImportRead(); });
  await page.waitForTimeout(200);
  ok('nothing sent', await page.evaluate(() =>
    window.__fetches.filter((f) => f.url.indexOf('import-context') !== -1).length) === 0);
  ok('and it says what to do', /Paste something in/.test(
    await page.evaluate(() => document.getElementById('esq-imp-error').textContent)));

  console.log('\nTHE WIZARD HAS A STEP FOR IT');
  const wiz = await page.evaluate(() => {
    const s = SW_STEPS.find((x) => x.id === 'import');
    return s ? { i: SW_STEPS.indexOf(s), squad: SW_STEPS.findIndex((x) => x.id === 'squad'),
                 action: s.action, why: s.why } : null;
  });
  ok('the step exists',                 !!wiz);
  ok('it comes before the squad',       wiz && wiz.i < wiz.squad);
  ok('wired to the panel',              wiz && wiz.action === 'openImportPanel');
  ok('and repeats the privacy line',    wiz && /never uploaded/i.test(wiz.why));

  ok('no uncaught page errors: ' + (pageErrors[0] || 'none'), pageErrors.length === 0);

  await browser.close();
  await new Promise((r) => server.close(r));

  console.log('\n' + (passed + failed) + ' checks, ' + passed + ' passed, ' + failed + ' failed');
  process.exit(failed ? 1 : 0);
})();
