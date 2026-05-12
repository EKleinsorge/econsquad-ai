// Reads book-extract.txt → writes setup-book-content.sql
const fs   = require('fs');
const path = require('path');

const HERE = __dirname;
const raw  = fs.readFileSync(path.join(HERE, '../book-extract.txt'), 'utf8');

// ── helpers ──────────────────────────────────────────────────────────────────

function clean(text) {
  return text
    .replace(/\bPROOF\b/g, '')
    .replace(/^\s*\d{1,3}\s*$/gm, '')
    .replace(/ {2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function toHtml(text) {
  const paras = text.split(/\n\n+/);
  return paras.map(block => {
    block = block.trim();
    if (!block) return '';

    // Bullet list block
    const lines = block.split('\n').map(l => l.trim()).filter(Boolean);

    // Section header: short, ends with nothing suspicious, first word title-like
    if (lines.length === 1 && lines[0].length < 80 && lines[0].length > 5) {
      const l = lines[0];
      // ALL CAPS line = h2
      if (l === l.toUpperCase() && /[A-Z]/.test(l) && !l.startsWith('Step')) {
        return `<h2>${titleCase(l)}</h2>`;
      }
      // Ends with colon = h3
      if (l.endsWith(':') && l.length < 70) {
        return `<h3>${l.slice(0,-1)}</h3>`;
      }
    }

    // Bullet items?
    const isBullets = lines.every(l => /^[•\-\*] /.test(l) || l.startsWith(' '));
    if (isBullets && lines.length > 1) {
      const items = lines.map(l => `<li>${l.replace(/^[•\-\*] /,'').trim()}</li>`).join('\n');
      return `<ul>\n${items}\n</ul>`;
    }

    // Contains numbered steps?
    if (/^Step \d/i.test(lines[0]) && lines[0].length < 70) {
      return `<h3>${lines[0]}</h3>\n<p>${lines.slice(1).join(' ')}</p>`;
    }

    return `<p>${lines.join(' ')}</p>`;
  }).filter(Boolean).join('\n');
}

function titleCase(s) {
  return s.toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
}

function sq(s) {
  return (s || '').replace(/'/g, "''");
}

function readTime(text) {
  const words = text.split(/\s+/).length;
  return `${Math.max(3, Math.round(words / 200))} min read`;
}

function firstSentence(text, max=180) {
  const m = text.match(/[^.!?]+[.!?]/);
  const s = m ? m[0].trim() : text.slice(0, max);
  return s.length > max ? s.slice(0, max-3)+'...' : s;
}

// ── chapter boundaries ───────────────────────────────────────────────────────

const NUM_MAP = {
  ONE:1, TWO:2, THREE:3, FOUR:4, FIVE:5, SIX:6, SEVEN:7, EIGHT:8,
  NINE:9, TEN:10, ELEVEN:11, TWELVE:12, THIRTEEN:13, FOURTEEN:14,
  FIFTEEN:15, SIXTEEN:16
};

// Find all chapter starts
const CH_RE = /CHAPTER\s+(ONE|TWO|THREE|FOUR|FIVE|SIX|SEVEN|EIGHT|NINE|TEN|ELEVEN|TWELVE|THIRTEEN|FOURTEEN|FIFTEEN|SIXTEEN)\s*\n([^\n]+)\n?([^\n]+)?/gi;
const found = [];
let m;
while ((m = CH_RE.exec(raw)) !== null) {
  const num   = NUM_MAP[m[1].toUpperCase()];
  let title   = m[2].trim();
  const extra = m[3] ? m[3].trim() : '';
  // Multi-line chapter titles (e.g. "Deploying Specialists Without Disruption" on next line)
  if (extra && !extra.match(/^\d/) && !extra.startsWith('PROOF') && extra.length > 3) {
    title = (title + ' ' + extra).trim();
  }
  found.push({ num, title, start: m.index + m[0].length });
}

// Deduplicate: keep last occurrence of each chapter number
const seen = {};
found.forEach((ch, i) => { seen[ch.num] = i; });
const deduped = found.filter((ch, i) => seen[ch.num] === i);

// Extract body text
const chapters = deduped.map((ch, i) => {
  const end   = i + 1 < deduped.length ? deduped[i+1].start : raw.indexOf('THE COMMITMENT');
  const body  = clean(raw.slice(ch.start, end > ch.start ? end : undefined));
  const html  = toHtml(body);
  const lead  = firstSentence(body.replace(/\n/g,' '));
  // Clean title: strip trailing page number, PROOF, and extra spaces
  const title = ch.title
    .replace(/\bPROOF\b/gi, '')
    .replace(/\s+\d{1,3}$/, '')
    .replace(/\s+/g, ' ')
    .trim();
  const words = body.split(/\s+/).length;
  return {
    num:   ch.num,
    title,
    desc:  lead.slice(0, 120) + (lead.length > 120 ? '...' : ''),
    lead,
    time:  `${Math.max(5, Math.round(words / 200))} min read`,
    body:  html,
  };
});

// ── write SQL ─────────────────────────────────────────────────────────────────

const rows = [
  `  ('book_title',    'Less Work. More Impact\\nIn Economic Development')`,
  `  ('book_subtitle', 'The Economic Developer''s Secret to Focusing on Impact, Not Busywork')`,
  `  ('book_hero_desc','A practical guide for economic developers ready to stop being buried in preparation work and start creating real impact. Written by Eric Kleinsorge after three decades in the field.')`,
  `  ('author_name',   'Eric Kleinsorge')`,
  `  ('author_title',  'CEO/Chairman, Global Site Location Industries · Founder, EconSquad AI')`,
  `  ('author_bio',    'Eric Kleinsorge has spent more than three decades in economic development and site location. As CEO of Global Site Location Industries and founder of EconSquad AI, he has helped communities compete for investment, talent, and opportunity across the country. This book distills what he learned about protecting focus, eliminating busywork, and operating at the level that actually creates impact — not just activity.')`,
  `  ('chapter_count', '${chapters.length}')`,
  `  ('free_chapters',  '1')`,
];

chapters.forEach(ch => {
  rows.push(`  ('ch${ch.num}_title', '${sq(ch.title)}')`);
  rows.push(`  ('ch${ch.num}_desc',  '${sq(ch.desc)}')`);
  rows.push(`  ('ch${ch.num}_lead',  '${sq(ch.lead)}')`);
  rows.push(`  ('ch${ch.num}_time',  '${sq(ch.time)}')`);
  rows.push(`  ('ch${ch.num}_body',  '${sq(ch.body)}')`);
});

const sql = `-- ============================================================
-- EconSquad AI — Book Content
-- Auto-generated from "Less Work More Impact Final Book.pdf"
-- Run in: Supabase Dashboard → SQL Editor → New Query
-- Requires setup-book-settings.sql to have been run first.
-- ============================================================

INSERT INTO book_settings (key, value) VALUES
${rows.join(',\n')}
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;

-- Done — ${chapters.length} chapters loaded.
`;

const outPath = path.join(HERE, 'setup-book-content.sql');
fs.writeFileSync(outPath, sql, 'utf8');
console.log(`✓ Wrote ${outPath}`);
chapters.forEach(ch =>
  console.log(`  Ch${String(ch.num).padStart(2,'0')}: ${ch.title.slice(0,55).padEnd(55)} (${ch.time})`)
);
