# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

EconSquad AI is a browser-based SPA for economic developers that surfaces AI specialists (powered by Claude) for grants, RFIs, BRE surveys, incentive modeling, workforce analysis, and more. It integrates Gmail, Google Calendar, Stripe, and Supabase with no build toolchain — the app is pure vanilla JS/HTML/CSS deployed as static files.

## No Build System

There is no `package.json`, no bundler, no test runner, and no linter. Development is done by editing files directly and refreshing the browser. Deployment is static file hosting (e.g., GitHub Pages).

To preview locally, serve the files with any static server:
```
npx serve .
# or
python -m http.server 8080
```

## File Structure

- **`index.html`** — The entire SPA: all CSS (embedded `<style>`), all JS (embedded `<script>`), and all HTML markup live in this one file (~390KB). Every UI section, page tab, modal, and Supabase/Stripe/Google API call is here.
- **`app.js`** — Loaded separately via CDN raw URL from GitHub. Contains: floating Report-a-Problem button, ARIA home chat (calls Claude API directly), email card rendering, and the trash/purge system using `localStorage`.
- **`inbox.js`** — Email UI helpers: inbox item rendering, tag color mapping, email categorization regex logic.
- **`admin.html`** — Standalone admin dashboard for managing specialists, users, and subscription plans via Supabase.

## Architecture Patterns

**Single HTML file is intentional.** All state, styling, and logic being in `index.html` is a deliberate tradeoff for simplicity and zero-dependency deployment. Don't refactor this into components or modules without explicit direction.

**Page navigation** is tab-based visibility toggling (`showTab(name)`), not routing. Each "page" is a `<div class="page" id="page-{name}">` that gets shown/hidden.

**`app.js` is loaded from GitHub raw CDN** inside `index.html`. When making changes to `app.js`, the CDN URL in `index.html`'s script tag must be kept in sync if the branch/filename changes.

**No module system.** Everything shares the global `window` scope. Key globals: `supabase` (Supabase client), `stripe` (Stripe.js), `currentUser`, `currentProfile`, `providerToken` (Google OAuth token for Gmail).

## Key Integrations

**Supabase** — Auth (email/password), database tables (`profiles`, `specialists`, `task_history`, `specialist_requests`, `problem_reports`), and Edge Functions for specialist AI chat and Gmail sync. The Supabase URL and anon key are hardcoded in `index.html`.

**Claude API** — Called directly from the browser (`https://api.anthropic.com/v1/messages`) in the ARIA home chat. The API key is stored in the Supabase `profiles` table per-user as `anthropic_key`. Specialist deployment goes through Supabase Edge Functions, not direct API calls.

**Gmail/Google Calendar** — OAuth via Supabase's Google provider. The `providerToken` from the Supabase session is used as the Bearer token for all Gmail API requests. Required scopes: `gmail.readonly`, `gmail.modify`, `gmail.send`, `calendar.readonly`.

**Stripe** — Subscriptions use hardcoded Stripe Payment Link URLs in `index.html`. Customer portal uses `billing.stripe.com`. Plans: `starter` and `pro`.

## Specialist System

Specialists are rows in the Supabase `specialists` table. Each has a `category` (`grants`, `site`, `BRE`, `data`, `incentives`, `marketing`, `workforce`, `reporting`), a `plan` requirement (`starter`/`pro`), and time-savings metadata (`hours_per_use`, `save_time`). Deployment triggers a Supabase Edge Function that runs Claude with the specialist's system prompt.

## CSS Conventions

CSS variables are defined in `:root` in `index.html`:
- Colors: `--navy`, `--navy2`, `--lime`, `--lime2`, `--lime3`, `--gold`, `--text`, `--text2`
- `--border`, `--limedim`, `--limeborder`, `--r` (border-radius: 12px)

Dark navy background (`#04050d`/`#06080f`) with lime green (`#aaff3e`) as the primary accent. All new UI should follow this palette.

## Versioning

The version string (e.g., `v05.04.1730`) appears in the `<title>` tag and inside `app.js`. Bump it in both places when making significant changes.
