#!/usr/bin/env python3
"""
generate_monday_drop.py

Generates a new "Monday AI for ED Drop" blog post HTML file and updates blog.html.
Runs weekly via GitHub Actions every Monday at 1 PM UTC.

Issue numbering: Issue #1 = May 12, 2026. Each subsequent Monday increments by 1.
"""

import os
import sys
import json
import re
from datetime import date, timedelta

try:
    import anthropic
except ImportError:
    print("ERROR: anthropic package not installed. Run: pip install anthropic", file=sys.stderr)
    sys.exit(1)


# ── Configuration ────────────────────────────────────────────────────────────

ISSUE_1_DATE = date(2026, 5, 12)
BASE_DIR = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
BLOG_HTML_PATH = os.path.join(BASE_DIR, "blog.html")

ANTHROPIC_MODEL = "claude-sonnet-4-5"


# ── Date and issue number ─────────────────────────────────────────────────────

def get_post_date() -> date:
    override = os.environ.get("OVERRIDE_DATE", "").strip()
    if override:
        try:
            return date.fromisoformat(override)
        except ValueError:
            print(f"WARNING: Invalid OVERRIDE_DATE '{override}', using today.", file=sys.stderr)
    return date.today()


def get_issue_number(post_date: date) -> int:
    """Issue #1 = May 12 2026; each Monday after = +1."""
    delta = (post_date - ISSUE_1_DATE).days
    issue = max(1, (delta // 7) + 1)
    return issue


# ── Claude API call ──────────────────────────────────────────────────────────

SYSTEM_PROMPT = """You are the editor of "The Monday AI for ED Drop," a weekly newsletter for economic development (ED) professionals.
Your writing is practical, collegial, confident, and jargon-free — like a knowledgeable colleague sharing what's actually working.
You write for working economic developers at municipal and regional EDOs, state development agencies, and community development organizations.
They are smart, busy, and skeptical of hype. Every tip you share should be immediately actionable.

Respond ONLY with a valid JSON object matching the schema provided. No markdown fences, no extra text."""

def build_user_prompt(issue_number: int, post_date: date) -> str:
    date_str = post_date.strftime("%B %-d, %Y")
    return f"""Generate content for Issue #{issue_number} of The Monday AI for ED Drop, dated {date_str}.

Return a JSON object with exactly this structure:
{{
  "title": "A compelling subtitle for this issue (not including 'The Monday AI for ED Drop — Issue #N:' prefix — just the subtitle, e.g. 'Site Selection in the Age of AI')",
  "intro": "2-3 sentences opening the issue. Reference something timely about economic development seasons, trends, or news. Warm, collegial tone.",
  "tips": [
    {{
      "number": "Tip 1",
      "headline": "Short compelling headline for this tip",
      "body": "150-200 words of practical advice for ED professionals using AI. Specific, actionable, no fluff."
    }},
    {{
      "number": "Tip 2",
      "headline": "...",
      "body": "..."
    }},
    {{
      "number": "Tip 3",
      "headline": "...",
      "body": "..."
    }}
  ],
  "spotlight_feature": "Name of the EconSquad AI feature or specialist being spotlighted (e.g. 'Riley the Grant Writer', 'BRE Survey Pro', 'Workforce Analysis Pro', 'Site Selection Pack', 'ARIA Home Chat')",
  "spotlight_headline": "Compelling headline for the spotlight section",
  "spotlight_body": "2-3 paragraphs (150-200 words total) explaining this EconSquad AI feature and how it helps ED professionals. Practical, specific.",
  "quote": "An insightful, realistic quote from an ED professional about using AI in their work. First-person, specific, believable.",
  "quote_source": "Job title and region, e.g. 'Economic Development Director, rural Appalachian community'",
  "cta_headline": "Short CTA headline (5-8 words)",
  "cta_body": "One sentence inviting the reader to try EconSquad AI.",
  "cta_button": "CTA button text (3-5 words)",
  "closing": "One friendly closing sentence for the bottom of the issue."
}}

Make the content fresh and distinct from these previous issue topics:
- Issue #1: Getting started with AI, 3 tasks to automate first, Riley the Grant Writer
- Issue #2: Grant season RFP scanning, data library, 2-hour narrative method, History tab
- Issue #3: BRE surveys, at-risk business triage, action plans, BRE Survey Pro

For Issue #{issue_number}, choose a distinct focus area from: site selection data packages, workforce analysis and prospects, incentive modeling and structuring, community storytelling for marketing, prospect outreach and pipeline management, strategic planning with AI, public presentation and council briefings, or another relevant ED topic."""


def call_claude(issue_number: int, post_date: date) -> dict:
    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        print("ERROR: ANTHROPIC_API_KEY environment variable not set.", file=sys.stderr)
        sys.exit(1)

    client = anthropic.Anthropic(api_key=api_key)

    print(f"Calling Claude API for Issue #{issue_number}...")
    try:
        message = client.messages.create(
            model=ANTHROPIC_MODEL,
            max_tokens=2048,
            system=SYSTEM_PROMPT,
            messages=[
                {"role": "user", "content": build_user_prompt(issue_number, post_date)}
            ]
        )
    except anthropic.APIConnectionError as e:
        print(f"ERROR: Failed to connect to Anthropic API: {e}", file=sys.stderr)
        sys.exit(1)
    except anthropic.RateLimitError as e:
        print(f"ERROR: Anthropic API rate limit hit: {e}", file=sys.stderr)
        sys.exit(1)
    except anthropic.APIStatusError as e:
        print(f"ERROR: Anthropic API error {e.status_code}: {e.message}", file=sys.stderr)
        sys.exit(1)

    raw = message.content[0].text.strip()

    # Strip markdown code fences if present
    raw = re.sub(r'^```(?:json)?\s*', '', raw)
    raw = re.sub(r'\s*```$', '', raw)

    try:
        data = json.loads(raw)
    except json.JSONDecodeError as e:
        print(f"ERROR: Claude returned invalid JSON: {e}", file=sys.stderr)
        print("Raw response:", raw[:500], file=sys.stderr)
        sys.exit(1)

    required_keys = ["title", "intro", "tips", "spotlight_feature", "spotlight_headline",
                     "spotlight_body", "quote", "quote_source", "cta_headline",
                     "cta_body", "cta_button", "closing"]
    for key in required_keys:
        if key not in data:
            print(f"ERROR: Missing required key '{key}' in Claude response.", file=sys.stderr)
            sys.exit(1)

    if not isinstance(data["tips"], list) or len(data["tips"]) < 3:
        print("ERROR: 'tips' must be a list with at least 3 items.", file=sys.stderr)
        sys.exit(1)

    print("Claude API call successful.")
    return data


# ── HTML rendering ────────────────────────────────────────────────────────────

def render_tips_html(tips: list) -> str:
    html = ""
    for tip in tips:
        num = tip.get("number", "Tip")
        headline = tip.get("headline", "")
        body = tip.get("body", "")
        # Convert newlines to paragraph breaks
        body_html = "".join(f"<p>{para.strip()}</p>" for para in body.split("\n\n") if para.strip())
        if not body_html:
            body_html = f"<p>{body}</p>"
        html += f"""
    <div class="tip-card">
      <div class="tip-num">{num}</div>
      <h3>{headline}</h3>
      {body_html}
    </div>"""
    return html


def render_spotlight_html(data: dict) -> str:
    body_paragraphs = ""
    for para in data["spotlight_body"].split("\n\n"):
        para = para.strip()
        if para:
            body_paragraphs += f"      <p>{para}</p>\n"
    return f"""
    <div class="spotlight">
      <div class="spotlight-label">&#9733; EconSquad AI Spotlight</div>
      <h2>{data['spotlight_headline']}</h2>
{body_paragraphs}    </div>"""


def render_html(data: dict, issue_number: int, post_date: date) -> str:
    date_display = post_date.strftime("%B %-d, %Y")
    full_title = f"The Monday AI for ED Drop — Issue #{issue_number}: {data['title']}"
    filename_date = post_date.strftime("%Y-%m-%d")

    tips_html = render_tips_html(data["tips"])
    spotlight_html = render_spotlight_html(data)

    return f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>{full_title} — EconSquad AI</title>
<meta name="description" content="{data['intro'][:160]}">
<link rel="icon" type="image/svg+xml" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'><rect width='32' height='32' rx='7' fill='%2304050d'/><circle cx='16' cy='16' r='13' fill='%2304050d'/><circle cx='16' cy='16' r='11' fill='%23aaff3e' opacity='0.25'/><circle cx='16' cy='16' r='8' fill='%23aaff3e' opacity='0.5'/><circle cx='16' cy='16' r='6' fill='%23aaff3e'/><path d='M16 11 L17.2 14.8 L21 16 L17.2 17.2 L16 21 L14.8 17.2 L11 16 L14.8 14.8 Z' fill='white'/></svg>">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@600;700;800;900&family=DM+Sans:wght@300;400;500&display=swap" rel="stylesheet">
<style>
*{{box-sizing:border-box;margin:0;padding:0;}}
:root{{
  --navy:#06080f;--navy2:#0d1220;
  --lime:#aaff3e;--lime2:#8fe620;--lime3:#ccff7a;
  --limedim:rgba(170,255,62,0.1);--limeborder:rgba(170,255,62,0.22);
  --gold:#f5c542;--text:#eef1f7;--text2:#8a97b5;
  --border:rgba(255,255,255,0.07);--r:12px;
}}
html,body{{background:#04050d;color:var(--text);font-family:'DM Sans',sans-serif;line-height:1.6;overflow-y:auto;}}
a{{color:var(--lime);text-decoration:none;}}
a:hover{{text-decoration:underline;}}
#progress-bar{{position:fixed;top:0;left:0;height:3px;background:var(--lime);z-index:9999;width:0%;transition:width .1s linear;pointer-events:none;}}
.nav-bar{{position:sticky;top:0;z-index:1000;background:rgba(6,8,15,0.96);backdrop-filter:blur(20px);border-bottom:1px solid rgba(255,255,255,0.06);padding:0 40px;height:66px;display:flex;align-items:center;justify-content:space-between;}}
.logo-mark{{display:flex;align-items:center;gap:10px;text-decoration:none;}}
.logo-icon{{width:38px;height:38px;background:var(--lime);border-radius:9px;display:flex;align-items:center;justify-content:center;flex-shrink:0;}}
.logo-icon svg{{width:22px;height:22px;}}
.logo-text{{font-family:'Barlow Condensed',sans-serif;font-size:23px;font-weight:800;letter-spacing:.02em;line-height:1;}}
.logo-text .econ{{color:#fff;}}
.logo-text .squad{{color:var(--lime);}}
.logo-text .ai-sup{{color:#fff;font-size:14px;font-weight:700;vertical-align:super;margin-left:1px;}}
.logo-sub{{font-size:10px;color:var(--text2);letter-spacing:.08em;text-transform:uppercase;margin-top:2px;}}
.nav-links{{display:flex;gap:24px;list-style:none;align-items:center;}}
.nav-links a{{color:var(--text2);text-decoration:none;font-size:13px;font-weight:500;transition:color .2s;}}
.nav-links a:hover,.nav-links a.active{{color:var(--lime);}}
.nav-ctas{{display:flex;gap:10px;align-items:center;}}
.btn-ghost-sm{{background:transparent;border:1px solid var(--border);color:var(--text2);font-size:13px;padding:7px 16px;border-radius:8px;cursor:pointer;font-family:'DM Sans',sans-serif;transition:all .2s;text-decoration:none;display:inline-flex;align-items:center;}}
.btn-ghost-sm:hover{{border-color:var(--limeborder);color:var(--lime);text-decoration:none;}}
.btn-lime{{background:var(--lime);color:#1a3300;border:none;font-size:13px;font-weight:800;padding:8px 18px;border-radius:8px;cursor:pointer;font-family:'DM Sans',sans-serif;transition:opacity .2s,transform .15s;text-decoration:none;display:inline-flex;align-items:center;}}
.btn-lime:hover{{opacity:.88;transform:translateY(-1px);text-decoration:none;}}
.series-banner{{background:rgba(170,255,62,0.07);border-bottom:1px solid rgba(170,255,62,0.15);padding:10px 40px;text-align:center;}}
.series-banner span{{font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--lime);}}
.article-wrap{{max-width:700px;margin:0 auto;padding:0 40px 80px;}}
.back-link{{display:inline-flex;align-items:center;gap:6px;color:var(--text2);font-size:13px;font-weight:500;margin:32px 0 0;text-decoration:none;transition:color .2s;}}
.back-link:hover{{color:var(--lime);text-decoration:none;}}
.article-hero{{padding:28px 0 40px;}}
.issue-badge{{display:inline-flex;align-items:center;gap:8px;background:rgba(170,255,62,0.1);border:1px solid var(--limeborder);border-radius:20px;padding:5px 14px;font-size:12px;font-weight:700;color:var(--lime);letter-spacing:.05em;margin-bottom:16px;}}
.article-hero h1{{font-family:'Barlow Condensed',sans-serif;font-size:44px;font-weight:900;line-height:1.05;margin-bottom:20px;color:var(--text);}}
.article-meta{{display:flex;align-items:center;gap:16px;flex-wrap:wrap;padding-bottom:28px;border-bottom:1px solid rgba(255,255,255,0.08);}}
.article-meta .date{{font-size:14px;color:var(--text2);}}
.article-meta .readtime{{font-size:12px;color:var(--text2);background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);border-radius:20px;padding:3px 12px;}}
.article-body{{padding-top:32px;}}
.article-body p{{font-size:16px;color:#c8d4e6;line-height:1.85;margin-bottom:20px;}}
.article-body h2{{font-family:'Barlow Condensed',sans-serif;font-size:26px;font-weight:800;color:#eef1f7;margin:36px 0 14px;line-height:1.1;}}
.article-body ul,.article-body ol{{color:#c8d4e6;line-height:1.85;padding-left:20px;margin-bottom:20px;}}
.article-body ul li,.article-body ol li{{margin-bottom:8px;}}
.tip-card{{background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.08);border-radius:var(--r);padding:22px 24px;margin:20px 0;}}
.tip-card .tip-num{{font-family:'Barlow Condensed',sans-serif;font-size:13px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:var(--lime);margin-bottom:8px;}}
.tip-card h3{{font-family:'Barlow Condensed',sans-serif;font-size:20px;font-weight:800;color:var(--text);margin-bottom:10px;}}
.tip-card p{{font-size:15px;color:#c8d4e6;line-height:1.8;margin-bottom:0;}}
.spotlight{{background:rgba(170,255,62,0.06);border:1px solid rgba(170,255,62,0.2);border-radius:var(--r);padding:28px;margin:32px 0;}}
.spotlight .spotlight-label{{font-size:11px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:var(--lime);margin-bottom:12px;}}
.spotlight h2{{font-family:'Barlow Condensed',sans-serif;font-size:24px;font-weight:900;color:var(--text);margin-bottom:12px;}}
.spotlight p{{font-size:15px;color:#c8d4e6;line-height:1.8;margin-bottom:12px;}}
.spotlight p:last-child{{margin-bottom:0;}}
.quote-block{{background:rgba(255,255,255,0.02);border-left:3px solid var(--lime);padding:20px 24px;margin:32px 0;border-radius:0 8px 8px 0;}}
.quote-block blockquote{{font-size:17px;color:var(--text);line-height:1.75;font-style:italic;margin-bottom:8px;}}
.quote-block .quote-source{{font-size:13px;color:var(--text2);}}
.cta-block{{background:rgba(170,255,62,0.08);border:1px solid rgba(170,255,62,0.2);border-radius:var(--r);padding:32px;text-align:center;margin:40px 0;}}
.cta-block h2{{font-family:'Barlow Condensed',sans-serif;font-size:28px;font-weight:900;margin-bottom:10px;}}
.cta-block p{{font-size:15px;color:var(--text2);margin-bottom:20px;}}
.cta-block a{{display:inline-flex;align-items:center;gap:6px;background:var(--lime);color:#1a3300;font-size:14px;font-weight:800;padding:12px 28px;border-radius:8px;text-decoration:none;transition:opacity .2s,transform .15s;}}
.cta-block a:hover{{opacity:.88;transform:translateY(-1px);text-decoration:none;}}
footer{{border-top:1px solid rgba(255,255,255,0.06);background:var(--navy);padding:32px 40px;}}
.footer-inner{{max-width:1100px;margin:0 auto;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:16px;}}
.footer-logo{{display:flex;align-items:center;gap:10px;text-decoration:none;}}
.footer-copy{{font-size:13px;color:var(--text2);text-align:center;}}
.footer-links{{display:flex;gap:20px;flex-wrap:wrap;}}
.footer-links a{{font-size:13px;color:var(--text2);text-decoration:none;transition:color .2s;}}
.footer-links a:hover{{color:var(--lime);}}
@media(max-width:700px){{
  .nav-bar{{padding:0 20px;}}
  .nav-links{{display:none;}}
  .series-banner{{padding:10px 20px;}}
  .article-wrap{{padding:0 20px 60px;}}
  .article-hero h1{{font-size:32px;}}
  footer{{padding:24px 20px;}}
  .footer-inner{{flex-direction:column;text-align:center;}}
}}
</style>
</head>
<body>

<div id="progress-bar"></div>

<nav class="nav-bar">
  <a href="index.html" class="logo-mark">
    <div class="logo-icon">
      <svg viewBox="0 0 22 22" fill="none"><circle cx="11" cy="11" r="9" fill="#04050d"/><circle cx="11" cy="11" r="7" fill="#aaff3e" opacity=".4"/><circle cx="11" cy="11" r="5" fill="#aaff3e"/><path d="M11 7.5 L11.9 10.2 L14.5 11 L11.9 11.8 L11 14.5 L10.1 11.8 L7.5 11 L10.1 10.2 Z" fill="white"/></svg>
    </div>
    <div>
      <div class="logo-text"><span class="econ">Econ</span><span class="squad">Squad</span><sup class="ai-sup">AI</sup></div>
      <div class="logo-sub">Less Work. More Impact.</div>
    </div>
  </a>
  <ul class="nav-links">
    <li><a href="index.html">Home</a></li>
    <li><a href="blog.html" class="active">Blog</a></li>
    <li><a href="support.html">Support</a></li>
  </ul>
  <div class="nav-ctas">
    <a href="index.html" class="btn-ghost-sm">Sign In</a>
    <a href="index.html" class="btn-lime">Start Free Trial</a>
  </div>
</nav>

<div class="series-banner">
  <span>&#128197; The Monday AI for ED Drop — Every Monday, New AI Insights for ED Pros</span>
</div>

<div class="article-wrap">

  <a href="blog.html" class="back-link">&larr; Back to Blog</a>

  <div class="article-hero">
    <div class="issue-badge">&#9889; Issue #{issue_number} &nbsp;&middot;&nbsp; {date_display}</div>
    <h1>{full_title}</h1>
    <div class="article-meta">
      <span class="date">{date_display}</span>
      <span class="readtime">4 min read</span>
    </div>
  </div>

  <div class="article-body">

    <p>{data['intro']}</p>

    <h2>This Week&#39;s Tips</h2>
{tips_html}
{spotlight_html}

    <div class="quote-block">
      <blockquote>&ldquo;{data['quote']}&rdquo;</blockquote>
      <div class="quote-source">&mdash; {data['quote_source']}</div>
    </div>

    <div class="cta-block">
      <h2>{data['cta_headline']}</h2>
      <p>{data['cta_body']}</p>
      <a href="index.html">{data['cta_button']} &rarr;</a>
    </div>

    <p style="font-size:14px;color:var(--text2);text-align:center;">{data['closing']}</p>

  </div>

</div>

<footer>
  <div class="footer-inner">
    <a href="index.html" class="footer-logo">
      <div class="logo-icon" style="width:30px;height:30px;">
        <svg viewBox="0 0 22 22" fill="none" style="width:16px;height:16px;"><circle cx="11" cy="11" r="9" fill="#04050d"/><circle cx="11" cy="11" r="5" fill="#aaff3e"/><path d="M11 7.5 L11.9 10.2 L14.5 11 L11.9 11.8 L11 14.5 L10.1 11.8 L7.5 11 L10.1 10.2 Z" fill="white"/></svg>
      </div>
      <span style="font-family:'Barlow Condensed',sans-serif;font-size:20px;font-weight:800;"><span style="color:#fff;">Econ</span><span style="color:var(--lime);">Squad</span><sup style="font-size:11px;color:#fff;vertical-align:super;">AI</sup></span>
    </a>
    <p class="footer-copy">&copy; 2026 EconSquad AI &nbsp;&middot;&nbsp; All rights reserved.</p>
    <div class="footer-links">
      <a href="privacy.html">Privacy</a>
      <a href="terms.html">Terms</a>
      <a href="support.html">Support</a>
      <a href="blog.html">Blog</a>
      <a href="contact.html">Contact</a>
    </div>
  </div>
</footer>

<script>
window.addEventListener('scroll', function() {{
  var scrollTop = window.scrollY || document.documentElement.scrollTop;
  var docHeight = document.documentElement.scrollHeight - document.documentElement.clientHeight;
  var pct = docHeight > 0 ? (scrollTop / docHeight) * 100 : 0;
  document.getElementById('progress-bar').style.width = pct + '%';
}});
</script>
</body>
</html>
"""


# ── blog.html updater ─────────────────────────────────────────────────────────

def update_blog_html(issue_number: int, post_date: date, title: str, intro: str, filename: str):
    """Prepend the new post to the Monday Drop list in blog.html."""
    date_display = post_date.strftime("%B %-d, %Y")
    # Truncate intro to ~120 chars for the listing
    short_desc = intro if len(intro) <= 130 else intro[:127].rsplit(" ", 1)[0] + "..."

    new_item = f"""
      <div class="monday-drop-item">
        <div class="drop-issue-tag">
          <div class="issue-num">#{issue_number}</div>
          <span class="issue-label">Issue</span>
        </div>
        <div class="drop-content">
          <h3><a href="{filename}">{title}</a></h3>
          <p class="drop-desc">{short_desc}</p>
          <div class="drop-meta">
            <span class="drop-date">{date_display}</span>
            <a href="{filename}" class="drop-read-link">Read &rarr;</a>
          </div>
        </div>
      </div>
"""

    if not os.path.exists(BLOG_HTML_PATH):
        print(f"WARNING: blog.html not found at {BLOG_HTML_PATH}. Skipping update.", file=sys.stderr)
        return

    with open(BLOG_HTML_PATH, "r", encoding="utf-8") as f:
        content = f.read()

    # Find the Monday Drop list and prepend the new item
    marker = '<div class="monday-drop-list">'
    if marker not in content:
        print("WARNING: Monday Drop list marker not found in blog.html. Skipping update.", file=sys.stderr)
        return

    updated = content.replace(marker, marker + new_item, 1)

    with open(BLOG_HTML_PATH, "w", encoding="utf-8") as f:
        f.write(updated)

    print(f"blog.html updated — Issue #{issue_number} prepended to Monday Drop list.")


# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    post_date = get_post_date()
    issue_number = get_issue_number(post_date)
    filename = f"monday-drop-{post_date.strftime('%Y-%m-%d')}.html"
    output_path = os.path.join(BASE_DIR, filename)

    print(f"Generating Issue #{issue_number} for {post_date} → {filename}")

    # Check if file already exists
    if os.path.exists(output_path):
        print(f"WARNING: {filename} already exists. Overwriting.", file=sys.stderr)

    # Generate content via Claude
    data = call_claude(issue_number, post_date)

    # Render HTML
    html = render_html(data, issue_number, post_date)

    # Write HTML file
    with open(output_path, "w", encoding="utf-8") as f:
        f.write(html)
    print(f"Written: {output_path}")

    # Update blog.html
    full_title = f"The Monday AI for ED Drop — Issue #{issue_number}: {data['title']}"
    update_blog_html(issue_number, post_date, full_title, data["intro"], filename)

    # Update blog-feed.json so the app can notify users
    update_blog_feed(issue_number, post_date, data["title"], data["intro"], filename)

    print("Done.")


def update_blog_feed(issue_number: int, post_date: date, subtitle: str, intro: str, filename: str):
    """Prepend the new issue to blog-feed.json for in-app notifications."""
    feed_path = os.path.join(BASE_DIR, "blog-feed.json")
    try:
        with open(feed_path, "r", encoding="utf-8") as f:
            feed = json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        feed = {"monday_drops": []}

    # Avoid duplicates
    existing_issues = {item["issue"] for item in feed.get("monday_drops", [])}
    if issue_number in existing_issues:
        print(f"Issue #{issue_number} already in blog-feed.json — skipping.")
        return

    short_excerpt = intro if len(intro) <= 140 else intro[:137].rsplit(" ", 1)[0] + "..."
    new_entry = {
        "issue": issue_number,
        "date": post_date.strftime("%Y-%m-%d"),
        "title": f"Issue #{issue_number}: {subtitle}",
        "excerpt": short_excerpt,
        "url": filename
    }

    feed.setdefault("monday_drops", []).insert(0, new_entry)

    with open(feed_path, "w", encoding="utf-8") as f:
        json.dump(feed, f, indent=2)
    print(f"blog-feed.json updated — Issue #{issue_number} added.")


if __name__ == "__main__":
    main()
