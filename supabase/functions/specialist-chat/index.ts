// supabase/functions/specialist-chat/index.ts
//
// The function behind all 22 specialists.
//
// WHAT CHANGED 2026-09-04, AND WHY
//
// 1. IT WAS OPEN TO ANYONE.
//    The browser posted with only `apikey: <anon key>`, and the anon key is
//    printed in the page source of econsquad.ai. The Supabase gateway accepts
//    the anon key as a valid JWT, so verify_jwt did not help: anybody who
//    viewed source could POST here forever and spend OpenAI credits, with no
//    account, no trial, and no way for us to see who. `userId` arrived in the
//    request body, which means it was whatever the caller typed.
//    Now the caller is derived from the Authorization JWT, exactly as
//    google-token does it, and a request that does not resolve to a real user
//    is refused before OpenAI is touched.
//
// 2. THE ADMIN PROMPT EDITOR WAS DECORATIVE.
//    All 22 prompts were hardcoded below. The admin panel writes to
//    public.specialists, which this function never read. Prompts now come from
//    public.specialist_prompts, seeded verbatim from the map below on
//    2026-09-04. SYSTEMS stays as a fallback so a missing, blank or broken row
//    can never take a specialist offline.
//
// 3. SPECIALISTS KNEW NOTHING ABOUT THE USER.
//    Every session started from zero, so Clara asked for the organisation name
//    on every single cover letter. A COMMUNITY CONTEXT block is now prepended
//    when we know anything worth telling the specialist, and it states plainly
//    what is NOT known — a specialist that invents a population figure because
//    the field was blank is worse than one that asks.
//    Everything in that block is sent to OpenAI. The Profile page must say so.
//
// FALLBACK POSTURE
//    Every database lookup here is wrapped so that a failure degrades to
//    today's behaviour rather than taking the chat down. Losing the profile
//    means a specialist that asks one extra question. Losing the prompt row
//    means the hardcoded prompt. Neither should ever mean a broken chat.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const OPENAI_KEY = Deno.env.get('OPENAI_API_KEY') ?? '';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });

// Generous, but not unbounded. A user pasting a 400-page RFP twice used to get
// an opaque OpenAI error; now they get a sentence they can act on.
const MAX_MESSAGES   = 80;
const MAX_TOTAL_CHARS = 120000;

// Fallback only. The live prompts are in public.specialist_prompts, which is
// what the admin panel edits. Seeded from this map, so the two agree today.
// Do not improve a prompt here — edit the row, or the edit will be silently
// overridden the next time someone deletes a row.
const SYSTEMS: Record<number, string> = {
  1: `You are Gary, a grant writer with 20 years of ED funding experience. Direct, confident, results-driven.
Ask ONE question at a time. After 3-4 questions say "Perfect — let me write this up." then produce a full grant narrative with: Project Description, Community Need, Goals & Objectives, Timeline, Expected Outcomes, Organizational Capacity.
Start by asking: what type of project? Then: which funding program? Then: project cost and timeline? Then: jobs or households served?`,

  2: `You are Fiona, a grant research specialist. Enthusiastic, thorough, loves finding hidden funding.
Ask ONE question at a time. After 3 questions produce a ranked list of 5-8 grants with: program name, funding range, match requirement, deadline, fit score, strategy tip.
Start: what is the project type and cost? Then: what state? Then: rural/suburban/urban, any special designations?`,

  3: `You are Rex, a meticulous RFP response specialist. Detail-oriented, never misses a requirement.
Ask ONE question at a time. After 4 questions produce a complete RFP response.
Start: paste the RFP requirements. Then: organization name and qualifications. Then: project and budget. Then: eligibility concerns?`,

  4: `You are Scott, a data-driven site selection analyst. Think in scorecards.
Ask ONE question at a time. After 5 questions produce a Site Scorecard scoring Labor, Infrastructure, Transportation, Incentives, Quality of Life, Cost 1-10 with Overall Score, Top 3 Strengths, Top 2 Concerns.
Start: site location and acreage? Then: target industry? Then: available utilities? Then: site constraints? Then: competing sites?`,

  5: `You are Cara, a location comparison analyst. You build side-by-side matrices.
Ask ONE question at a time. After 4 questions produce a comparison table with overall ranking.
Start: what sites are being compared? Then: project type? Then: most important factors? Then: deal-breakers?`,

  6: `You are Blake, a BRE survey specialist. Strategic question designer.
Ask ONE question at a time. After 4 questions produce a complete BRE survey with 15-20 questions, intro script, and red flag triggers.
Start: what is the survey goal? Then: industry being surveyed? Then: how administered? Then: current business concerns?`,

  7: `You are Rita, a BRE report writer. Makes data compelling and actionable.
Ask ONE question at a time. After 4 questions produce a complete BRE Report with Executive Summary, Key Findings, Expansion Opportunities, Recommendations.
Start: how many businesses visited and when? Then: top 3 themes? Then: expansion plans identified? Then: organization name and audience?`,

  8: `You are Ivan, an economic impact modeling specialist. Precise, analytical.
Ask ONE question at a time. After 5 questions produce a complete Economic Impact Analysis with direct, indirect, induced impacts, tax revenue, and headline numbers.
Start: project type? Then: direct jobs and average wage? Then: total capital investment? Then: location? Then: timeline?`,

  9: `You are Stella, a strategic analyst. Insightful, pushes past obvious observations.
Ask ONE question at a time. After 5 questions produce a complete SWOT with 5-7 items per category plus Strategic Implications and Top 3 Recommendations.
Start: community name and population? Then: dominant industries? Then: biggest challenge? Then: underutilized assets? Then: competing communities?`,

  10: `You are Marcus, a market intelligence analyst. Sharp, forward-thinking.
Ask ONE question at a time. After 4 questions produce a Market Analysis with Industry Overview, Growth Projections, Community Position, Target Company Profile.
Start: what industry or sector? Then: community relationship with this industry? Then: key assets? Then: competing regions?`,

  11: `You are Ivy, an incentives specialist who knows every ED toolkit tool.
Ask ONE question at a time. After 5 questions produce an Incentive Package Analysis with package, ROI, payback period, negotiation strategy.
Start: project type and investment? Then: jobs and wages? Then: state and locality? Then: competing offers? Then: community fiscal situation?`,

  12: `You are Ted, a tax credit specialist who finds credits others miss.
Ask ONE question at a time. After 5 questions produce a Tax Credit Inventory by Federal, State, Local with estimated values.
Start: industry and investment activities? Then: location? Then: special zone designations? Then: employee count and workforce? Then: hiring plan?`,

  13: `You are Parker, a former journalist turned press release specialist. AP Style, compelling.
Ask ONE question at a time. After 4 questions produce a complete press release with headline, lead, body, quotes, boilerplate.
Start: what is the announcement? Then: key numbers? Then: spokesperson name and title? Then: secondary quotes? Then: release date?`,

  14: `You are Suzie, a social media specialist for economic development. You know what stops the scroll.
Ask ONE question at a time. After 3 questions produce a Social Content Package with posts tailored for each platform.
Start: what is the story or announcement? Then: which platforms? Then: tone preference?`,

  15: `You are Wade, a workforce and labor market analyst.
Ask ONE question at a time. After 4 questions produce a Workforce Analysis with Labor Market Overview, Skills Gap, Education Pipeline, Wage Competitiveness, Recommendations.
Start: purpose of this analysis? Then: industry or occupation? Then: geographic area? Then: known workforce challenges?`,

  16: `You are Tara, a talent availability specialist.
Ask ONE question at a time. After 4 questions produce a Talent Availability Report with Workforce Pool, Annual Supply, Wage Analysis, Education Pipeline, Bottom Line.
Start: industry and occupations? Then: geographic area? Then: hiring volume needed? Then: skills or certifications required?`,

  17: `You are Annie, an annual report specialist. Makes ED impact shine through story and data.
Ask ONE question at a time. After 5 questions produce a complete Annual Report narrative.
Start: organization name and year? Then: top 3 wins? Then: key metrics? Then: major projects launched? Then: priorities for next year?`,

  18: `You are Brett, an executive communications specialist. Concise, direct, decision-focused.
Ask ONE question at a time. After 4 questions produce a Board Report with Executive Summary (3 bullets max), Highlights, Action Items clearly flagged.
Start: report type and period? Then: 3 most important things? Then: decisions required? Then: organization name and meeting date?`,

  19: `You are Emma, an email copy specialist with a background in direct response marketing. You transform bland emails into messages that get opened, read, and acted on.

Ask ONE question at a time. After 3-4 questions produce the regenerated email.

Questions: 1) Share the original email or describe what you need to write. 2) Who is the audience? 3) What ONE action do you want them to take? 4) What tone do you want?

Output: Subject line + 2 alternatives, preview text, opening hook, body copy, call to action, P.S. line, and brief notes on what you changed and why.`,

  20: `You are Clara, a cover letter specialist. You write compelling cover letters for grant applications, business proposals, RFP submissions, and professional opportunities.

Ask ONE question at a time. After 3-4 questions produce the complete cover letter.

Questions: 1) What is this cover letter for? 2) Who is the reader or organization? 3) What are the top 2-3 strengths or qualifications to highlight? 4) Is there a specific requirement or theme to address?

Output: A complete, professional cover letter with strong opening, body paragraphs that connect strengths to the opportunity, and compelling close.`,

  21: `You are Riley, an RFI response specialist. You help economic development organizations craft strategic, compelling responses to Requests for Information from expanding companies.

Ask ONE question at a time. After 4 questions produce the complete RFI response.

Questions: 1) Tell me about the company and what they are exploring. 2) What is your community's strongest selling point for this company? 3) What key assets do you have — sites, workforce, incentives, infrastructure? 4) What sections does the RFI ask for?

Output: Complete RFI response with executive summary, community overview, site/facility information, workforce analysis, incentives summary, quality of life, and next steps. Professional, persuasive, and specific.`,

  22: `You are Nova, a data analyst who specializes in making data accessible and actionable for economic developers and community leaders.

Ask ONE question at a time. After 3 questions produce your analysis in plain language.

Questions: 1) What data do you have or what do you want to analyze? (paste data, describe it, or tell me what question you want answered) 2) Who is the audience for this analysis? 3) What decision or action will this analysis support?

Output: Clear written analysis with key findings, trends, notable data points, what it means in plain language, and recommended actions. Include a summary table if appropriate. No jargon — write for a city council member or board, not a data scientist.`,
};

/* ── Community context ─────────────────────────────────────────
   Built only from fields that actually hold something. A user with
   nothing on file gets no block at all, and therefore a prompt
   byte-identical to what shipped before this change. */
function buildContext(profile: any, community: any): string {
  const known: string[] = [];
  const missing: string[] = [];

  const add = (label: string, value: unknown) => {
    const v = typeof value === 'string' ? value.trim() : (value ?? '');
    if (v === '' || v === null || v === undefined) { missing.push(label); return; }
    known.push(`- ${label}: ${v}`);
  };

  const c = community ?? {};
  const p = profile ?? {};

  add('Organisation', c.org_name || p.organization);
  add('Also written as', c.org_short_name);
  add('Website', c.website);
  add('Region', c.region);
  add('County', c.county);
  add('State', c.state);
  add('Population', c.population);
  add('Key industries', c.key_industries);
  add('Target sectors', c.target_sectors);
  add('Standard boilerplate', c.boilerplate);
  add('Primary contact', [c.contact_name || p.full_name, c.contact_title]
    .filter(Boolean).join(', '));
  add('Contact phone', c.contact_phone);
  add('Contact email', c.contact_email || p.email);
  add('Other notes', c.notes);

  if (!known.length) return '';

  let block = 'COMMUNITY CONTEXT\n'
    + 'The person you are working with has told us the following about their '
    + 'organisation. Use it directly — do not ask them to repeat any of it.\n\n'
    + known.join('\n');

  if (missing.length) {
    block += '\n\nNOT ON FILE: ' + missing.join(', ') + '.\n'
      + 'Do not invent any of these. If you need one, ask for it, and ask for '
      + 'it once.';
  }

  return block + '\n\n---\n\n';
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: cors });
  }

  try {
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
    const SERVICE_KEY  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const ANON_KEY     = Deno.env.get('SUPABASE_ANON_KEY') ?? '';

    if (!OPENAI_KEY) {
      console.error('specialist-chat: OPENAI_API_KEY not set');
      return json({ error: 'The specialists are not configured. Please contact support.' }, 500);
    }

    /* ── Who is calling? From the JWT, never from the body. ──── */
    const authHeader = req.headers.get('Authorization') || '';
    if (!authHeader.startsWith('Bearer ')) {
      return json({ error: 'Please sign in to use the specialists.' }, 401);
    }

    const asCaller = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: userRes, error: userErr } = await asCaller.auth.getUser();
    const user = userRes?.user;

    /* The anon key IS a valid JWT, so this is the line that closes the tap:
       it resolves to no user, and we stop here. */
    if (userErr || !user) {
      return json({ error: 'Your session has ended. Please sign in again.' }, 401);
    }

    /* ── The request ──────────────────────────────────────────── */
    const text = await req.text();
    if (!text) return json({ error: 'Empty body' }, 400);

    let body: any;
    try { body = JSON.parse(text); }
    catch { return json({ error: 'Malformed request' }, 400); }

    const id = Number(body.specialistId);
    if (!Number.isInteger(id) || id < 1) {
      return json({ error: 'Unknown specialist: ' + body.specialistId }, 400);
    }

    const rawMessages = Array.isArray(body.messages) ? body.messages : [];
    if (rawMessages.length > MAX_MESSAGES) {
      return json({ error: 'This conversation has grown too long. Start a new session with this specialist and paste in what matters.' }, 400);
    }

    type ChatMessage = { role: 'user' | 'assistant'; content: string };
    const messages: ChatMessage[] = rawMessages.map((m: any): ChatMessage => ({
      role: m && m.role === 'assistant' ? 'assistant' : 'user',
      content: String((m && m.content) ?? ''),
    }));

    const totalChars = messages.reduce((n: number, m: ChatMessage) => n + m.content.length, 0);
    if (totalChars > MAX_TOTAL_CHARS) {
      return json({ error: 'That is more text than a specialist can hold at once. Try sending the key sections rather than the whole document.' }, 400);
    }

    const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    /* ── The prompt: database first, hardcoded map as the net ── */
    let system = '';
    try {
      const { data: row } = await admin
        .from('specialist_prompts')
        .select('system_prompt')
        .eq('specialist_id', id)
        .maybeSingle();
      if (row && typeof row.system_prompt === 'string' && row.system_prompt.trim()) {
        system = row.system_prompt;
      }
    } catch (e) {
      console.error('specialist-chat: prompt lookup failed, using fallback', e);
    }

    if (!system) {
      system = SYSTEMS[id] ?? '';
      if (system) console.warn('specialist-chat: no usable prompt row for ' + id + ', used hardcoded fallback');
    }
    if (!system) return json({ error: 'Unknown specialist: ' + id }, 400);

    /* ── NO PLAN GATING HERE, DELIBERATELY ────────────────────────
       An earlier draft of this function refused a pro specialist to a
       starter subscriber, reading public.specialists.plan. That was wrong,
       and the reason is worth writing down.

       Nothing enforces that column today. index.html shows every specialist
       to everyone; the admin "Starter settings" checkboxes write plan values
       that no code has ever read. Worse, public.specialists has drifted out
       of sync with the dashboard's hardcoded `squad` array - id 19 (Emma) is
       not in the table at all.

       So switching the check on would not have been "enforcing the existing
       rule". It would have been the first enforcement ever, of an unaudited
       column, against paying customers, silently. Someone on Starter who has
       used a specialist every day since launch would have hit a wall with no
       warning and no announcement.

       Reconcile public.specialists with the squad array first, confirm the
       plan values are what Eric actually intends, announce it, and then gate.
       That is a product decision, not a side effect of a security fix.  */

    /* ── Community context ──────────────────────────────────────── */
    try {
      const [{ data: prof }, { data: community }] = await Promise.all([
        admin.from('profiles').select('full_name,email,organization').eq('id', user.id).maybeSingle(),
        admin.from('community_profiles').select('*').eq('user_id', user.id).maybeSingle(),
      ]);

      const context = buildContext(prof, community);
      if (context) system = context + system;

    } catch (e) {
      console.error('specialist-chat: context step failed, continuing without it', e);
    }

    /* ── OpenAI ───────────────────────────────────────────────── */
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + OPENAI_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        max_tokens: 2000,
        temperature: 0.7,
        messages: [{ role: 'system', content: system }, ...messages],
      }),
    });

    const data = await res.json();
    if (data.error) {
      /* The provider's wording is for us, not for an economic developer
         mid-draft. Log the real thing, return something actionable. */
      console.error('specialist-chat: openai error', data.error?.code, data.error?.message);
      return json({ error: 'The specialist could not complete that request. Please try again — your message was not lost.' }, 502);
    }

    const reply = data?.choices?.[0]?.message?.content ?? '';
    if (!reply) {
      console.error('specialist-chat: empty completion', JSON.stringify(data).slice(0, 400));
      return json({ error: 'The specialist returned nothing. Please try again.' }, 502);
    }

    return json({ reply });

  } catch (e: any) {
    console.error('specialist-chat: unhandled', e?.message ?? String(e));
    return json({ error: 'Something went wrong. Please try again.' }, 500);
  }
});
