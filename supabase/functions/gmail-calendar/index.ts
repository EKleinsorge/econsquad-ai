import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const body = await req.json()
    const { action, provider_token } = body

    // ===== ARIA MEETING CHAT (no provider_token needed) =====
    if (action === 'aria_chat') {
      const { messages, system } = body
      const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY') || ''
      if (!anthropicKey) {
        return new Response(JSON.stringify({ error: 'ANTHROPIC_API_KEY not configured' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500
        })
      }
      const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': anthropicKey, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({
          model: 'claude-sonnet-4-6',
          max_tokens: 1024,
          system: system || 'You are ARIA, an AI meeting coach for economic developers.',
          messages: messages || []
        })
      })
      const claudeData = await claudeRes.json()
      const reply = claudeData?.content?.[0]?.text || ''
      return new Response(JSON.stringify({ reply }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // ===== ARIA REPLY DRAFT (no provider_token needed) =====
    if (action === 'aria_reply') {
      const { from, subject, snippet } = body
      const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY') || ''
      if (!anthropicKey) {
        return new Response(JSON.stringify({ error: 'ANTHROPIC_API_KEY not configured' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500
        })
      }
      const prompt = `Draft a professional, concise reply to this email. Return only the reply body text (no subject line, no "To:" line, just the message body):\n\nFrom: ${from}\nSubject: ${subject}\nMessage preview: ${snippet}`
      const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': anthropicKey,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 500,
          messages: [{ role: 'user', content: prompt }]
        })
      })
      const claudeData = await claudeRes.json()
      const draft = claudeData?.content?.[0]?.text || ''
      return new Response(JSON.stringify({ draft }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // ===== ARIA COMPOSE NEW EMAIL (no provider_token needed) =====
    if (action === 'aria_compose') {
      const { to, subject, existing } = body
      const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY') || ''
      if (!anthropicKey) {
        return new Response(JSON.stringify({ error: 'ANTHROPIC_API_KEY not configured' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500
        })
      }
      const existingNote = existing ? `\n\nThe user has already started writing:\n"${existing}"\n\nExpand and polish this into a complete professional email.` : ''
      const prompt = `You are ARIA, an AI assistant for economic developers. Draft a professional email for an economic developer.\n\nTo: ${to || 'the recipient'}\nSubject: ${subject}${existingNote}\n\nWrite a complete, professional email body. Be concise but warm. Do not include a subject line or "To:" header — just the message body starting with a greeting. Sign off as the user (no specific name needed, just a professional closing).`
      const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': anthropicKey, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 600,
          messages: [{ role: 'user', content: prompt }]
        })
      })
      const claudeData = await claudeRes.json()
      const draft = claudeData?.content?.[0]?.text || ''
      return new Response(JSON.stringify({ draft }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // ===== ARIA TRIAGE (no provider_token needed) =====
    if (action === 'aria_triage') {
      const { emails: triageEmails } = body
      const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY') || ''
      const list = (triageEmails || []).map((e: any, i: number) =>
        `${i + 1}. From: ${e.from} | Subject: ${e.subject} | Preview: ${e.snippet}`
      ).join('\n')
      const prompt = `You are ARIA, assistant for economic developers. Triage these unread emails:\n\n${list}\n\nReturn a JSON array only, no other text. Each item: {"index":number,"priority":"urgent"|"today"|"later"|"fyi","reason":"one short sentence"}\n\nurgent=same-day response needed, today=respond today, later=can wait days, fyi=no response needed.`
      const cr = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': anthropicKey, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({ model: 'claude-haiku-4-5-20251001', max_tokens: 1200, messages: [{ role: 'user', content: prompt }] })
      })
      const cd = await cr.json()
      const text = cd?.content?.[0]?.text || '[]'
      let triage: any[] = []
      try { const m = text.match(/\[[\s\S]*\]/); if (m) triage = JSON.parse(m[0]) } catch (_) {}
      return new Response(JSON.stringify({ triage }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // ===== ARIA FOLLOW-UP DRAFT (no provider_token needed) =====
    if (action === 'aria_followup') {
      const { meetingTitle, meetingDate, attendees, liveNotes, savedNotes } = body
      const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY') || ''
      const prompt = `Draft a professional follow-up email after this meeting:\n\nMeeting: ${meetingTitle}\nDate: ${meetingDate || 'Today'}\nAttendees: ${attendees || 'Not specified'}${liveNotes ? '\n\nMeeting notes:\n' + liveNotes : ''}${savedNotes ? '\n\nKey points:\n' + savedNotes : ''}\n\nWrite a concise professional follow-up: thank attendees, summarize key points, list action items, suggest next steps. Return only the email body text, no subject line.`
      const cr = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': anthropicKey, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({ model: 'claude-haiku-4-5-20251001', max_tokens: 800, messages: [{ role: 'user', content: prompt }] })
      })
      const cd = await cr.json()
      return new Response(JSON.stringify({ draft: cd?.content?.[0]?.text || '' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    if (!provider_token) {
      return new Response(JSON.stringify({ error: 'No provider token' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400
      })
    }

    let result = {}

    // ===== GMAIL INBOX - optimized with minimal fields =====
    if (action === 'gmail_inbox') {
      const period = (body.period !== undefined && body.period !== null) ? body.period : '7d'
      const dateFilter = period ? `+newer_than:${period}` : ''
      // Step 1: Get list of unread message IDs (fast)
      const listRes = await fetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=50&q=is:unread${dateFilter}`,
        { headers: { Authorization: `Bearer ${provider_token}` } }
      )
      const listData = await listRes.json()
      const messages = listData.messages || []

      if (messages.length === 0) {
        return new Response(JSON.stringify({ emails: [], total_unread: 0 }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }

      // Step 2: Fetch ALL messages in PARALLEL (not sequential)
      const emailPromises = messages.slice(0, 50).map((msg: any) =>
        fetch(
          `https://gmail.googleapis.com/gmail/v1/users/me/messages/${msg.id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date&fields=id,threadId,snippet,payload/headers`,
          { headers: { Authorization: `Bearer ${provider_token}` } }
        ).then(r => r.json())
      )

      const details = await Promise.all(emailPromises)

      const emails = details.map((detail: any) => {
        const headers = detail.payload?.headers || []
        const getH = (name: string) => headers.find((h: any) => h.name === name)?.value || ''
        return {
          id: detail.id,
          threadId: detail.threadId,
          from: getH('From'),
          subject: getH('Subject'),
          date: getH('Date'),
          snippet: detail.snippet || ''
        }
      }).filter((e: any) => e.from)

      result = { 
        emails, 
        total_unread: listData.resultSizeEstimate || messages.length 
      }
    }

    // ===== GMAIL SEND =====
    if (action === 'gmail_send') {
      const { to, subject, body: emailBody } = body
      const emailRaw = [`To: ${to}`, `Subject: ${subject}`, 'Content-Type: text/plain; charset=utf-8', '', emailBody].join('\n')
      const encoded = btoa(emailRaw).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
      
      await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
        method: 'POST',
        headers: { Authorization: `Bearer ${provider_token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ raw: encoded })
      })
      result = { sent: true }
    }

    // ===== GOOGLE CALENDAR =====
    if (action === 'calendar_today') {
      const now = new Date()
      const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString()
      const nextWeek = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString()
      
      // Fetch today + week in parallel
      const [todayRes, weekRes] = await Promise.all([
        fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin=${startOfDay}&timeMax=${new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59).toISOString()}&singleEvents=true&orderBy=startTime&fields=items(id,summary,start,end,location,attendees,conferenceData)`,
          { headers: { Authorization: `Bearer ${provider_token}` } }),
        fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin=${startOfDay}&timeMax=${nextWeek}&singleEvents=true&orderBy=startTime&maxResults=15&fields=items(id,summary,start)`,
          { headers: { Authorization: `Bearer ${provider_token}` } })
      ])

      const [todayData, weekData] = await Promise.all([todayRes.json(), weekRes.json()])

      result = {
        today: (todayData.items || []).map((e: any) => ({
          id: e.id, title: e.summary || 'Untitled',
          start: e.start?.dateTime || e.start?.date,
          end: e.end?.dateTime || e.end?.date,
          location: e.location || '',
          allDay: !e.start?.dateTime,
          attendees: (e.attendees || []).map((a: any) => ({
            name: a.displayName || a.email || '',
            email: a.email || '',
            status: a.responseStatus || 'needsAction',
            self: !!a.self
          })),
          meetLink: e.conferenceData?.entryPoints?.find((ep: any) => ep.entryPointType === 'video')?.uri || null
        })),
        week: (weekData.items || []).map((e: any) => ({
          id: e.id, title: e.summary || 'Untitled',
          start: e.start?.dateTime || e.start?.date,
          allDay: !e.start?.dateTime
        }))
      }
    }

    // ===== ARIA BRIEFING - inbox + calendar in parallel =====
    if (action === 'aria_briefing') {
      const now = new Date()
      const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString()
      const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59).toISOString()
      const nextWeek = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString()

      // Fetch everything in parallel
      const [gmailListRes, calTodayRes, calWeekRes] = await Promise.all([
        fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=5&q=is:unread newer_than:1d&fields=messages,resultSizeEstimate',
          { headers: { Authorization: `Bearer ${provider_token}` } }),
        fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin=${startOfDay}&timeMax=${endOfDay}&singleEvents=true&orderBy=startTime&fields=items(summary,start)`,
          { headers: { Authorization: `Bearer ${provider_token}` } }),
        fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin=${startOfDay}&timeMax=${nextWeek}&singleEvents=true&orderBy=startTime&maxResults=10&fields=items(summary,start)`,
          { headers: { Authorization: `Bearer ${provider_token}` } })
      ])

      const [gmailList, calToday, calWeek] = await Promise.all([
        gmailListRes.json(), calTodayRes.json(), calWeekRes.json()
      ])

      // Fetch email subjects in parallel
      const msgIds = (gmailList.messages || []).slice(0, 5)
      const emailDetails = await Promise.all(
        msgIds.map((msg: any) =>
          fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${msg.id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&fields=snippet,payload/headers`,
            { headers: { Authorization: `Bearer ${provider_token}` } }
          ).then(r => r.json())
        )
      )

      const emails = emailDetails.map((d: any) => {
        const headers = d.payload?.headers || []
        return {
          from: headers.find((h: any) => h.name === 'From')?.value || '',
          subject: headers.find((h: any) => h.name === 'Subject')?.value || '',
          snippet: d.snippet || ''
        }
      })

      result = {
        unread_count: gmailList.resultSizeEstimate || msgIds.length,
        emails,
        today_events: (calToday.items || []).map((e: any) => ({
          title: e.summary, start: e.start?.dateTime || e.start?.date, allDay: !e.start?.dateTime
        })),
        week_events: (calWeek.items || []).map((e: any) => ({
          title: e.summary, start: e.start?.dateTime || e.start?.date
        }))
      }
    }

    // ===== GMAIL READ EMAILS =====
    if (action === 'gmail_read') {
      const period = (body.period !== undefined && body.period !== null) ? body.period : '30d'
      const dateFilter = period ? `+newer_than:${period}` : ''
      const listRes = await fetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=50&q=is:read+-in:trash${dateFilter}`,
        { headers: { Authorization: `Bearer ${provider_token}` } }
      )
      const listData = await listRes.json()
      const messages = listData.messages || []
      if (messages.length === 0) {
        return new Response(JSON.stringify({ emails: [] }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }
      const emailPromises = messages.slice(0, 50).map((msg: any) =>
        fetch(
          `https://gmail.googleapis.com/gmail/v1/users/me/messages/${msg.id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date&fields=id,threadId,snippet,payload/headers`,
          { headers: { Authorization: `Bearer ${provider_token}` } }
        ).then(r => r.json())
      )
      const details = await Promise.all(emailPromises)
      const emails = details.map((detail: any) => {
        const headers = detail.payload?.headers || []
        const getH = (name: string) => headers.find((h: any) => h.name === name)?.value || ''
        return { id: detail.id, threadId: detail.threadId, from: getH('From'), subject: getH('Subject'), date: getH('Date'), snippet: detail.snippet || '' }
      }).filter((e: any) => e.from)
      result = { emails }
    }

    // ===== GMAIL SENT EMAILS =====
    if (action === 'gmail_sent') {
      const period = (body.period !== undefined && body.period !== null) ? body.period : '30d'
      const dateFilter = period ? `+newer_than:${period}` : ''
      const listRes = await fetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=50&q=in:sent${dateFilter}`,
        { headers: { Authorization: `Bearer ${provider_token}` } }
      )
      const listData = await listRes.json()
      const messages = listData.messages || []
      if (messages.length === 0) {
        return new Response(JSON.stringify({ emails: [] }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }
      const emailPromises = messages.slice(0, 50).map((msg: any) =>
        fetch(
          `https://gmail.googleapis.com/gmail/v1/users/me/messages/${msg.id}?format=metadata&metadataHeaders=To&metadataHeaders=Subject&metadataHeaders=Date&fields=id,threadId,snippet,payload/headers`,
          { headers: { Authorization: `Bearer ${provider_token}` } }
        ).then(r => r.json())
      )
      const details = await Promise.all(emailPromises)
      const emails = details.map((detail: any) => {
        const headers = detail.payload?.headers || []
        const getH = (name: string) => headers.find((h: any) => h.name === name)?.value || ''
        return { id: detail.id, threadId: detail.threadId, from: 'Me → ' + getH('To'), subject: getH('Subject'), date: getH('Date'), snippet: detail.snippet || '' }
      }).filter((e: any) => e.subject)
      result = { emails }
    }

    // ===== GMAIL FULL MESSAGE =====
    if (action === 'gmail_message') {
      const { messageId } = body
      const res = await fetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}?format=full`,
        { headers: { Authorization: `Bearer ${provider_token}` } }
      )
      const data = await res.json()

      // Walk the MIME tree and collect every part that has a Content-ID header
      // (these are inline images referenced as cid:xxx in the HTML body)
      function collectInlineParts(payload: any, acc: any[] = []): any[] {
        if (!payload) return acc
        const cidHeader = (payload.headers || []).find(
          (h: any) => h.name.toLowerCase() === 'content-id'
        )
        if (cidHeader && payload.body) {
          acc.push({
            cid:          cidHeader.value.replace(/^<|>$/g, '').trim(),
            mimeType:     payload.mimeType || 'image/jpeg',
            attachmentId: payload.body.attachmentId || null,
            data:         payload.body.data || null,   // present for small inline parts
          })
        }
        for (const part of payload.parts || []) collectInlineParts(part, acc)
        return acc
      }

      function extractBody(payload: any): { content: string; isHtml: boolean } {
        if (!payload) return { content: '', isHtml: false }
        if (payload.body?.data) {
          const content = atob(payload.body.data.replace(/-/g, '+').replace(/_/g, '/'))
          return { content, isHtml: payload.mimeType === 'text/html' }
        }
        if (payload.parts) {
          const html  = payload.parts.find((p: any) => p.mimeType === 'text/html')
          const plain = payload.parts.find((p: any) => p.mimeType === 'text/plain')
          const part  = html || plain
          if (part?.body?.data) {
            const content = atob(part.body.data.replace(/-/g, '+').replace(/_/g, '/'))
            return { content, isHtml: !!html }
          }
          for (const part of payload.parts) {
            const found = extractBody(part)
            if (found.content) return found
          }
        }
        return { content: '', isHtml: false }
      }

      const headers = data.payload?.headers || []
      const getH = (n: string) => headers.find((h: any) => h.name === n)?.value || ''
      const { content, isHtml } = extractBody(data.payload)

      let processedBody = content

      // Resolve cid: inline image references → data: URIs so they render in the browser
      if (isHtml && data.payload) {
        const inlineParts = collectInlineParts(data.payload)
        for (const part of inlineParts) {
          let b64 = part.data
          // If the attachment data wasn't inlined in the MIME part, fetch it separately
          if (!b64 && part.attachmentId) {
            try {
              const attRes = await fetch(
                `https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}/attachments/${part.attachmentId}`,
                { headers: { Authorization: `Bearer ${provider_token}` } }
              )
              const attJson = await attRes.json()
              b64 = attJson.data || null
            } catch (_) { /* skip */ }
          }
          if (b64) {
            const standardB64 = b64.replace(/-/g, '+').replace(/_/g, '/')
            const dataUri      = `data:${part.mimeType};base64,${standardB64}`
            // Replace every cid:xxx occurrence (case-insensitive, with or without angle brackets)
            const escapedCid   = part.cid.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
            processedBody = processedBody.replace(new RegExp(`cid:${escapedCid}`, 'gi'), dataUri)
          }
        }
      }

      result = { from: getH('From'), to: getH('To'), subject: getH('Subject'), date: getH('Date'), body: processedBody, isHtml }
    }

    // ===== CALENDAR UPDATE (attendees + Google Meet) =====
    if (action === 'calendar_update') {
      const { eventId, attendeeEmails, addMeet, sendUpdates } = body
      const patch: any = {}
      const params = new URLSearchParams()
      if (addMeet) {
        patch.conferenceData = { createRequest: { requestId: `meet-${Date.now()}` } }
        params.set('conferenceDataVersion', '1')
      }
      if (sendUpdates) params.set('sendUpdates', 'all')
      if (attendeeEmails !== undefined) {
        patch.attendees = attendeeEmails.map((email: string) => ({ email: email.trim() }))
      }
      const qs = params.toString()
      let url = `https://www.googleapis.com/calendar/v3/calendars/primary/events/${eventId}${qs ? '?' + qs : ''}`
      const res = await fetch(url, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${provider_token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(patch)
      })
      const data = await res.json()
      const meetLink = data.conferenceData?.entryPoints?.find((ep: any) => ep.entryPointType === 'video')?.uri || null
      result = { updated: !data.error, meetLink, error: data.error?.message }
    }

    // ===== CALENDAR CREATE =====
    if (action === 'calendar_create') {
      const { title, startDateTime, endDateTime, attendeeEmails, location: loc, description, sendUpdates } = body
      const event: any = {
        summary: title,
        start: { dateTime: startDateTime },
        end: { dateTime: endDateTime }
      }
      if (loc) event.location = loc
      if (description) event.description = description
      if (attendeeEmails && attendeeEmails.length) {
        event.attendees = attendeeEmails.map((email: string) => ({ email: email.trim() }))
      }
      const createUrl = sendUpdates
        ? 'https://www.googleapis.com/calendar/v3/calendars/primary/events?sendUpdates=all'
        : 'https://www.googleapis.com/calendar/v3/calendars/primary/events'
      const res = await fetch(createUrl, {
        method: 'POST',
        headers: { Authorization: `Bearer ${provider_token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(event)
      })
      const data = await res.json()
      result = { created: true, eventId: data.id, htmlLink: data.htmlLink, error: data.error?.message }
    }

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })

  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500
    })
  }
})