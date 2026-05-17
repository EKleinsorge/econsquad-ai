// ============================================================
// Supabase Edge Function: track-open
// Returns a 1x1 transparent GIF and records email opens
// URL: /functions/v1/track-open?t=<tracking_token>
// ============================================================
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY  = Deno.env.get('SERVICE_ROLE_KEY')!;
const supa         = createClient(SUPABASE_URL, SERVICE_KEY);

// 1x1 transparent GIF (smallest possible tracking pixel)
const PIXEL = new Uint8Array([
  0x47,0x49,0x46,0x38,0x39,0x61,0x01,0x00,0x01,0x00,0x80,0x00,0x00,
  0xff,0xff,0xff,0x00,0x00,0x00,0x21,0xf9,0x04,0x01,0x00,0x00,0x00,
  0x00,0x2c,0x00,0x00,0x00,0x00,0x01,0x00,0x01,0x00,0x00,0x02,0x02,
  0x44,0x01,0x00,0x3b
]);

Deno.serve(async (req: Request) => {
  const url   = new URL(req.url);
  const token = url.searchParams.get('t');

  if (token) {
    try {
      // Find the send record
      const { data: send } = await supa
        .from('monday_drop_sends')
        .select('id, open_count, first_opened_at')
        .eq('tracking_token', token)
        .single();

      if (send) {
        const now = new Date().toISOString();
        await supa
          .from('monday_drop_sends')
          .update({
            open_count:      (send.open_count ?? 0) + 1,
            first_opened_at: send.first_opened_at ?? now,
          })
          .eq('id', send.id);
      }
    } catch (e) {
      // Silent — never block the pixel from loading
      console.error('track-open error:', e);
    }
  }

  return new Response(PIXEL, {
    status: 200,
    headers: {
      'Content-Type':  'image/gif',
      'Cache-Control': 'no-store, no-cache, must-revalidate',
      'Pragma':        'no-cache',
    },
  });
});
