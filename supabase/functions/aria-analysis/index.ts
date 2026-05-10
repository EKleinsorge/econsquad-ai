import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY') ?? ''

const corsHeaders = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const {
      missions,
      totalHours,
      specialistsUsed,
      daysSince,
      hourlyRate,
      valueSavedYTD,
      projectedAnnual,
      roiPercent,
      plan,
      subscriptionCostYr,
      topSpecialists,
    } = await req.json()

    if (!ANTHROPIC_API_KEY) {
      return new Response(
        JSON.stringify({ error: 'ANTHROPIC_API_KEY not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const statsContext = `
User's EconSquad AI platform stats:
- Plan: ${plan || 'trial'}
- Days on platform: ${daysSince}
- Total missions run: ${missions}
- Total hours saved: ${totalHours.toFixed(1)} hrs
- Unique specialists used: ${specialistsUsed}
- Hourly rate: $${hourlyRate.toFixed(2)}/hr
- Value saved year-to-date: $${Math.round(valueSavedYTD).toLocaleString()}
- Projected annual value: $${Math.round(projectedAnnual).toLocaleString()}
- Return on investment: ${roiPercent}%
- Annual subscription cost: $${subscriptionCostYr}
- Most used specialists: ${topSpecialists || 'not yet available'}
`.trim()

    const systemPrompt = `You are ARIA, the intelligent assistant built into EconSquad AI — a platform designed exclusively for economic developers. Your job is to provide a personalized, encouraging, and data-driven executive summary of the user's progress and return on investment.

Tone: Sharp, professional, and warm — like a trusted advisor who knows their numbers. Be specific. Celebrate wins. Identify opportunities. Keep it concise.

Format your response as exactly 3 sections with NO markdown headers, NO asterisks, NO bullet symbols:

1. A 2-3 sentence executive summary of their overall performance and ROI story.
2. A "Key Wins" section with 2-3 specific callouts based on the data (start each with an emoji like ✅, 💰, 🚀, 📈).
3. A 1-2 sentence forward-looking recommendation for how they can get even more value from the platform.

Keep the entire response under 200 words. Speak directly to the user as "you".`

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type':  'application/json',
        'x-api-key':     ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model:      'claude-sonnet-4-20250514',
        max_tokens: 350,
        system:     systemPrompt,
        messages:   [{ role: 'user', content: statsContext }],
      }),
    })

    const data = await response.json()

    if (!response.ok) {
      console.error('Anthropic error:', data)
      return new Response(
        JSON.stringify({ error: data.error?.message ?? 'Anthropic API error' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const analysis = data.content?.[0]?.text ?? ''

    return new Response(
      JSON.stringify({ analysis }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (err) {
    console.error('aria-analysis error:', err)
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
