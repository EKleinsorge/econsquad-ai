#!/usr/bin/env python3
"""
send_weekly_email.py

Sends the week's Monday AI for ED Drop to all EconSquad AI users.

  • Free / trial users  → post excerpt + warm upgrade CTA
  • Paid subscribers    → tip summary + genuine thank-you + next-week tease

Requires env vars:
  RESEND_API_KEY            — from resend.com
  SUPABASE_URL              — https://kbwcsmctwtgrjtjcghkt.supabase.co
  SUPABASE_SERVICE_ROLE_KEY — service-role key (NOT anon key)
  ANTHROPIC_API_KEY         — used to generate the next-week tease line
"""

import os, sys, json, re, time
from datetime import date
from pathlib import Path

try:
    import requests
except ImportError:
    print("ERROR: requests not installed. Run: pip install requests", file=sys.stderr)
    sys.exit(1)

try:
    import anthropic
except ImportError:
    print("ERROR: anthropic not installed. Run: pip install anthropic", file=sys.stderr)
    sys.exit(1)


# ── Config ────────────────────────────────────────────────────────────────────

RESEND_API_KEY            = os.environ["RESEND_API_KEY"]
SUPABASE_URL              = os.environ.get("SUPABASE_URL",
                                "https://kbwcsmctwtgrjtjcghkt.supabase.co")
SUPABASE_SERVICE_ROLE_KEY = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
ANTHROPIC_API_KEY         = os.environ.get("ANTHROPIC_API_KEY", "")

FROM_EMAIL   = "Monday AI for ED Drop <drop@econsquad.ai>"
SITE_BASE    = "https://ekleinsorge.github.io/econsquad-ai"
APP_URL      = "https://ekleinsorge.github.io/econsquad-ai/index.html"
UNSUBSCRIBE  = "mailto:support@econsquad.ai?subject=Unsubscribe%20from%20Monday%20Drop"

BASE_DIR = Path(__file__).resolve().parents[2]


# ── Load latest post from blog-feed.json ──────────────────────────────────────

def load_latest_post():
    feed_path = BASE_DIR / "blog-feed.json"
    with open(feed_path, encoding="utf-8") as f:
        feed = json.load(f)
    drops = sorted(feed.get("monday_drops", []),
                   key=lambda x: x.get("issue", 0), reverse=True)
    if not drops:
        raise RuntimeError("No posts found in blog-feed.json")
    return drops[0]


# ── Generate next-week tease via Claude ───────────────────────────────────────

def generate_tease(current_issue: int, current_title: str) -> str:
    """Returns a single teaser sentence for next week's issue."""
    if not ANTHROPIC_API_KEY:
        return "Another practical AI tip for ED pros is coming your way next Monday."
    try:
        client = anthropic.Anthropic(api_key=ANTHROPIC_API_KEY)
        msg = client.messages.create(
            model="claude-haiku-4-5",
            max_tokens=80,
            messages=[{
                "role": "user",
                "content": (
                    f"The current Monday AI for ED Drop issue is #{current_issue}: \"{current_title}\". "
                    "Write ONE short, intriguing teaser sentence (max 20 words) hinting at a different "
                    "economic development AI topic for next week. Be specific but mysterious. "
                    "Do NOT use the word 'exciting'. Start with 'Next week:'."
                )
            }]
        )
        return msg.content[0].text.strip()
    except Exception as e:
        print(f"Tease generation failed: {e}", file=sys.stderr)
        return "Next week: another practical AI workflow built specifically for ED professionals."


# ── Fetch all users from Supabase ─────────────────────────────────────────────

def get_all_users():
    """Returns list of dicts: {id, email, plan}"""
    headers = {
        "apikey":        SUPABASE_SERVICE_ROLE_KEY,
        "Authorization": f"Bearer {SUPABASE_SERVICE_ROLE_KEY}",
    }

    # 1. Get all auth users (paginated — Supabase returns max 1000 per page)
    users = {}
    page = 1
    while True:
        resp = requests.get(
            f"{SUPABASE_URL}/auth/v1/admin/users",
            headers=headers,
            params={"page": page, "per_page": 1000},
        )
        resp.raise_for_status()
        data = resp.json()
        batch = data.get("users", [])
        for u in batch:
            if u.get("email"):
                users[u["id"]] = {"id": u["id"], "email": u["email"], "plan": None}
        if len(batch) < 1000:
            break
        page += 1

    # 2. Overlay plan status from public.profiles
    profiles_resp = requests.get(
        f"{SUPABASE_URL}/rest/v1/profiles",
        headers={**headers, "Content-Type": "application/json"},
        params={"select": "id,plan"},
    )
    profiles_resp.raise_for_status()
    for p in profiles_resp.json():
        uid = p.get("id")
        if uid and uid in users:
            users[uid]["plan"] = p.get("plan")

    return list(users.values())


def is_subscriber(plan: str | None) -> bool:
    return plan in ("starter", "pro")


# ── Email HTML templates ──────────────────────────────────────────────────────

_BASE_STYLE = """
  body,table,td{margin:0;padding:0;border:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;}
  body{background:#04050d;color:#eef1f7;}
  a{color:#aaff3e;text-decoration:none;}
  a:hover{text-decoration:underline;}
  .wrapper{max-width:600px;margin:0 auto;padding:0 0 40px;}
  .nav{background:#0a0d1a;padding:20px 32px;border-bottom:1px solid rgba(255,255,255,0.06);}
  .logo{font-size:20px;font-weight:800;letter-spacing:.02em;color:#fff;}
  .logo span{color:#aaff3e;}
  .badge{display:inline-block;background:rgba(170,255,62,0.12);border:1px solid rgba(170,255,62,0.3);
         border-radius:20px;padding:4px 14px;font-size:11px;font-weight:700;
         color:#aaff3e;letter-spacing:.08em;text-transform:uppercase;}
  .hero{background:#0d1220;padding:32px 32px 28px;border-bottom:1px solid rgba(255,255,255,0.07);}
  .hero h1{font-size:26px;font-weight:800;line-height:1.2;color:#eef1f7;margin:12px 0 10px;}
  .hero p{font-size:14px;color:#8a97b5;line-height:1.6;}
  .body{padding:28px 32px;}
  .body p{font-size:15px;color:#c8d4e6;line-height:1.75;margin-bottom:16px;}
  .tip{background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.08);
       border-radius:10px;padding:18px 20px;margin-bottom:14px;}
  .tip-num{font-size:11px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;
           color:#aaff3e;margin-bottom:6px;}
  .tip h3{font-size:16px;font-weight:700;color:#eef1f7;margin-bottom:8px;}
  .tip p{font-size:13px;color:#8a97b5;line-height:1.65;margin:0;}
  .cta-block{background:rgba(170,255,62,0.08);border:1px solid rgba(170,255,62,0.2);
             border-radius:10px;padding:24px;text-align:center;margin:24px 0;}
  .cta-block p{font-size:14px;color:#8a97b5;margin-bottom:16px;}
  .btn{display:inline-block;background:#aaff3e;color:#1a3300 !important;font-size:14px;
       font-weight:800;padding:12px 28px;border-radius:8px;text-decoration:none !important;}
  .tease{background:#0a0d1a;border-left:3px solid #aaff3e;padding:16px 20px;
         border-radius:0 8px 8px 0;margin:20px 0;}
  .tease p{font-size:13px;color:#8a97b5;margin:0;font-style:italic;}
  .footer{padding:20px 32px 0;border-top:1px solid rgba(255,255,255,0.06);}
  .footer p{font-size:11px;color:#4a5568;line-height:1.6;margin-bottom:6px;}
  .footer a{color:#6b7a96;}
""".strip()


def email_html_subscriber(post: dict, tease: str) -> str:
    title = post["title"].replace("Issue #" + str(post["issue"]) + ": ", "")
    post_url = f"{SITE_BASE}/{post['url']}"
    return f"""<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Monday AI for ED Drop — {post['title']}</title>
<style>{_BASE_STYLE}</style>
</head>
<body>
<div class="wrapper">

  <div class="nav">
    <span class="logo">Econ<span>Squad</span><sup style="font-size:12px;">AI</sup></span>
  </div>

  <div class="hero">
    <div class="badge">&#128197; Issue #{post['issue']} &nbsp;·&nbsp; {post['date']}</div>
    <h1>Monday AI for ED Drop<br>{title}</h1>
    <p>{post['excerpt']}</p>
  </div>

  <div class="body">
    <p>Thanks for being part of EconSquad AI — we genuinely appreciate you. Here's this week's drop.</p>

    <p><strong><a href="{post_url}" style="color:#aaff3e;">Read the full issue →</a></strong></p>

    <div class="tease">
      <p>&#128197;&nbsp; <strong style="color:#eef1f7;">Coming up next Monday:</strong><br>
      {tease}</p>
    </div>

    <div class="cta-block">
      <p>You're always one click away from your full AI squad.</p>
      <a href="{APP_URL}?ret=1" class="btn">Open My Dashboard →</a>
    </div>
  </div>

  <div class="footer">
    <p>You're receiving this because you have an EconSquad AI account.<br>
    <a href="{UNSUBSCRIBE}">Unsubscribe</a> &nbsp;·&nbsp;
    <a href="{SITE_BASE}/blog.html">Blog</a> &nbsp;·&nbsp;
    <a href="{SITE_BASE}/support.html">Support</a></p>
    <p style="margin-top:8px;color:#2d3748;">© {date.today().year} EconSquad AI. Less Work. More Impact.</p>
  </div>

</div>
</body>
</html>"""


def email_html_free(post: dict) -> str:
    title = post["title"].replace("Issue #" + str(post["issue"]) + ": ", "")
    post_url = f"{SITE_BASE}/{post['url']}"
    return f"""<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Monday AI for ED Drop — {post['title']}</title>
<style>{_BASE_STYLE}</style>
</head>
<body>
<div class="wrapper">

  <div class="nav">
    <span class="logo">Econ<span>Squad</span><sup style="font-size:12px;">AI</sup></span>
  </div>

  <div class="hero">
    <div class="badge">&#128197; Issue #{post['issue']} &nbsp;·&nbsp; {post['date']}</div>
    <h1>Monday AI for ED Drop<br>{title}</h1>
    <p>{post['excerpt']}</p>
  </div>

  <div class="body">
    <p>Here's this week's Monday AI for ED Drop — practical AI tips built specifically
    for economic development professionals like you.</p>

    <p><a href="{post_url}" style="color:#aaff3e;font-weight:700;">Read the full issue →</a></p>

    <hr style="border:none;border-top:1px solid rgba(255,255,255,0.07);margin:24px 0;">

    <p style="font-size:14px;color:#6b7a96;">
      &#9889;&nbsp; <strong style="color:#eef1f7;">Want the full experience?</strong><br>
      The Monday Drop is just one part of EconSquad AI. Inside the platform, your personal
      AI specialists handle grant writing, site selection RFIs, BRE surveys, workforce
      analysis — and your smart inbox keeps grant deadlines from slipping through the cracks.
    </p>

    <div class="cta-block">
      <p>See everything that's waiting for you — no credit card required.</p>
      <a href="{APP_URL}" class="btn">Start My Free Trial →</a>
    </div>
  </div>

  <div class="footer">
    <p>You're receiving this because you have an EconSquad AI account.<br>
    <a href="{UNSUBSCRIBE}">Unsubscribe</a> &nbsp;·&nbsp;
    <a href="{SITE_BASE}/blog.html">Blog</a> &nbsp;·&nbsp;
    <a href="{SITE_BASE}/support.html">Support</a></p>
    <p style="margin-top:8px;color:#2d3748;">© {date.today().year} EconSquad AI. Less Work. More Impact.</p>
  </div>

</div>
</body>
</html>"""


# ── Send via Resend ───────────────────────────────────────────────────────────

def send_email(to_email: str, subject: str, html: str) -> bool:
    resp = requests.post(
        "https://api.resend.com/emails",
        headers={
            "Authorization": f"Bearer {RESEND_API_KEY}",
            "Content-Type":  "application/json",
        },
        json={
            "from":    FROM_EMAIL,
            "to":      [to_email],
            "subject": subject,
            "html":    html,
        },
        timeout=15,
    )
    if resp.status_code not in (200, 201):
        print(f"  FAILED {to_email}: {resp.status_code} {resp.text}", file=sys.stderr)
        return False
    return True


# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    post  = load_latest_post()
    title = post["title"].replace(f"Issue #{post['issue']}: ", "")
    print(f"Sending issue #{post['issue']}: {title}")

    tease = generate_tease(post["issue"], title)
    print(f"Next-week tease: {tease}")

    users = get_all_users()
    print(f"Found {len(users)} users")

    subject_sub  = f"📰 Your Monday Drop is here — {title}"
    subject_free = f"📰 Monday AI for ED Drop: {title}"

    sent_sub = sent_free = failed = 0

    for u in users:
        email = u["email"]
        plan  = u["plan"]

        if is_subscriber(plan):
            html    = email_html_subscriber(post, tease)
            subject = subject_sub
        else:
            html    = email_html_free(post)
            subject = subject_free

        ok = send_email(email, subject, html)
        if ok:
            if is_subscriber(plan):
                sent_sub += 1
            else:
                sent_free += 1
            print(f"  ✓ {email} ({'sub' if is_subscriber(plan) else 'free'})")
        else:
            failed += 1

        # Resend free tier: 2 req/sec — stay comfortably under
        time.sleep(0.6)

    print(f"\nDone. Sent to {sent_sub} subscribers + {sent_free} free users. {failed} failed.")


if __name__ == "__main__":
    main()
