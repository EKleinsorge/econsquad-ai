#!/usr/bin/env python3
"""
Reads book-extract.txt and writes setup-book-content.sql
with all chapter content ready to upsert into book_settings.
"""

import re, pathlib

HERE = pathlib.Path(__file__).parent
SRC  = HERE.parent / "book-extract.txt"
OUT  = HERE / "setup-book-content.sql"

raw = SRC.read_text(encoding="utf-8", errors="replace")

# ── helpers ───────────────────────────────────────────────────────────────────

def clean(text):
    """Strip printer artifacts, page numbers, extra whitespace."""
    text = re.sub(r'\bPROOF\b', '', text)            # watermark
    text = re.sub(r'^\s*\d{1,3}\s*$', '', text, flags=re.M)  # lone page nums
    text = re.sub(r' {2,}', ' ', text)
    text = re.sub(r'\n{3,}', '\n\n', text)
    return text.strip()

def to_html(text):
    """Convert plain paragraphs to HTML. Detect bullet lists and headers."""
    lines = text.split('\n')
    html_parts = []
    i = 0
    while i < len(lines):
        line = lines[i].strip()
        if not line:
            i += 1
            continue

        # Detect bullet items (lines starting with common bullet chars)
        if re.match(r'^[•\-\*] ', line) or re.match(r'^ ', lines[i]) and line:
            # collect bullet block
            bullets = []
            while i < len(lines):
                l = lines[i].strip()
                if re.match(r'^[•\-\*] ', l):
                    bullets.append('<li>' + l[2:].strip() + '</li>')
                    i += 1
                elif l.startswith(' ') and l:
                    bullets.append('<li>' + l.strip() + '</li>')
                    i += 1
                else:
                    break
            if bullets:
                html_parts.append('<ul>\n' + '\n'.join(bullets) + '\n</ul>')
            continue

        # ALL-CAPS SHORT LINES → h2
        stripped = line.rstrip(':')
        if (stripped.isupper() and len(stripped) > 4 and len(stripped) < 80
                and not stripped.startswith('CHAPTER')):
            html_parts.append('<h2>' + stripped.title() + '</h2>')
            i += 1
            continue

        # Lines ending with colon that are short → h3
        if line.endswith(':') and len(line) < 80 and len(line) > 8:
            html_parts.append('<h3>' + line[:-1] + '</h3>')
            i += 1
            continue

        # Regular paragraph — collect continuation lines
        para = [line]
        i += 1
        while i < len(lines):
            l = lines[i].strip()
            if not l:
                i += 1
                break
            if re.match(r'^[•\-\*] ', l):
                break
            if (l.rstrip(':').isupper() and len(l) < 80) or l.endswith(':') and len(l) < 80:
                break
            para.append(l)
            i += 1
        html_parts.append('<p>' + ' '.join(para) + '</p>')

    return '\n'.join(html_parts)

def sq(s):
    """Escape single quotes for SQL."""
    return s.replace("'", "''")

# ── locate chapters ───────────────────────────────────────────────────────────

CHAPTER_PATTERN = re.compile(
    r'CHAPTER\s+(ONE|TWO|THREE|FOUR|FIVE|SIX|SEVEN|EIGHT|NINE|TEN|ELEVEN|'
    r'TWELVE|THIRTEEN|FOURTEEN|FIFTEEN|SIXTEEN)\s*\n(.*?)\n',
    re.IGNORECASE
)

NUM_MAP = {
    'ONE':1,'TWO':2,'THREE':3,'FOUR':4,'FIVE':5,'SIX':6,'SEVEN':7,'EIGHT':8,
    'NINE':9,'TEN':10,'ELEVEN':11,'TWELVE':12,'THIRTEEN':13,'FOURTEEN':14,
    'FIFTEEN':15,'SIXTEEN':16
}

chapters_raw = {}
for m in CHAPTER_PATTERN.finditer(raw):
    num = NUM_MAP[m.group(1).upper()]
    title_line = m.group(2).strip()
    start = m.end()
    chapters_raw[num] = (title_line, start)

# Extract body text between chapter starts
sorted_nums = sorted(chapters_raw.keys())
chapters = []

# Add Preface/Introduction as context (not numbered chapters)
preface_match = re.search(r'PREFACE\n(.*?)(?=INTRODUCTION)', raw, re.DOTALL)
intro_match   = re.search(r'INTRODUCTION\n(.*?)(?=CHAPTER ONE)', raw, re.DOTALL)

for idx, num in enumerate(sorted_nums):
    title_raw, start = chapters_raw[num]
    # Find end = start of next chapter or conclusion
    if idx + 1 < len(sorted_nums):
        _, next_start = chapters_raw[sorted_nums[idx+1]]
        body_raw = raw[start:next_start]
    else:
        # Last chapter — go to COMMITMENT / CONCLUSION
        end_match = re.search(r'THE COMMITMENT|CONCLUSION', raw[start:])
        if end_match:
            body_raw = raw[start : start + end_match.start()]
        else:
            body_raw = raw[start:]

    # Clean multi-line titles (some chapter titles span 2 lines)
    title = re.sub(r'\s+', ' ', title_raw).strip()
    # Try to grab second line if title looks incomplete
    title_match = re.search(
        r'CHAPTER\s+' + list(NUM_MAP.keys())[num-1] + r'\s*\n(.*?)\n(.*?)\n',
        raw, re.IGNORECASE
    )
    if title_match:
        t2 = title_match.group(2).strip()
        if t2 and not t2.startswith('PROOF') and not t2[0].isdigit():
            title = re.sub(r'\s+', ' ', title_raw + ' ' + t2).strip()

    body_clean = clean(body_raw)
    body_html  = to_html(body_clean)

    # Estimate read time (~200 wpm)
    word_count = len(body_clean.split())
    mins = max(3, round(word_count / 200))
    read_time = f"{mins} min read"

    # Opening sentence as lead
    sentences = re.split(r'(?<=[.!?])\s+', body_clean)
    lead = sentences[0].strip() if sentences else ''
    if len(lead) > 200:
        lead = lead[:197] + '...'

    chapters.append({
        'num':      num,
        'title':    title,
        'desc':     lead[:120] + ('...' if len(lead) > 120 else ''),
        'lead':     lead,
        'time':     read_time,
        'body':     body_html,
    })

# ── write SQL ─────────────────────────────────────────────────────────────────

lines = [
    "-- ============================================================",
    "-- EconSquad AI — Book Content",
    "-- Auto-generated from Less Work More Impact Final Book.pdf",
    "-- Run in: Supabase Dashboard → SQL Editor → New Query",
    "-- ============================================================",
    "",
    "-- Make sure setup-book-settings.sql has been run first.",
    "",
    "INSERT INTO book_settings (key, value) VALUES",
]

rows = []

# Book-level settings
rows.append(f"  ('book_title',      'Less Work. More Impact\\nIn Economic Development')")
rows.append(f"  ('book_subtitle',   'The Economic Developer''s Secret to Focusing on Impact, Not Busywork')")
rows.append(f"  ('book_hero_desc',  'A practical guide for economic development professionals who are tired of being buried in preparation work. Learn how to protect your focus, leverage specialists, and create more impact without working more hours.')")
rows.append(f"  ('author_name',     'Eric Kleinsorge')")
rows.append(f"  ('author_title',    'CEO/Chairman, Global Site Location Industries')")
rows.append(f"  ('author_bio',      'Eric Kleinsorge has spent more than three decades working in economic development and site location. As CEO of Global Site Location Industries and founder of EconSquad AI, he has helped communities and organizations across the country compete for investment, talent, and opportunity. This book distills what he learned about protecting focus, eliminating busywork, and operating at the level that actually creates impact.')")
rows.append(f"  ('chapter_count',   '{len(chapters)}')")
rows.append(f"  ('free_chapters',   '1')")

# Chapter rows
for ch in chapters:
    n = ch['num']
    rows.append(f"  ('ch{n}_title', '{sq(ch['title'])}')")
    rows.append(f"  ('ch{n}_desc',  '{sq(ch['desc'])}')")
    rows.append(f"  ('ch{n}_lead',  '{sq(ch['lead'])}')")
    rows.append(f"  ('ch{n}_time',  '{sq(ch['time'])}')")
    rows.append(f"  ('ch{n}_body',  '{sq(ch['body'])}')")

lines.append(',\n'.join(rows))
lines.append("ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;")
lines.append("")
lines.append(f"-- Done — {len(chapters)} chapters loaded.")

OUT.write_text('\n'.join(lines), encoding='utf-8')
print(f"✓ Wrote {OUT}")
print(f"  {len(chapters)} chapters")
for ch in chapters:
    print(f"  Ch{ch['num']:2d}: {ch['title'][:60]}  ({ch['time']})")
