import * as pdfLib from 'https://esm.sh/pdf-lib@1.17.1';
export { pdfLib };

// The quote as a PDF: something a buyer can print, sign and hand in.
//
// WHY THIS IS NOT A THIRD RENDERER
//
// The email and this PDF are built from the same row, in the same function, in
// one pass. They are two presentations of one set of figures, not two
// independent drawings of a document - which is the thing that was wrong with
// the old browser-side print view and the reason it was deleted.
//
// Everything numeric comes in through `r`. Nothing is computed here except
// layout, so the PDF cannot disagree with the email about what is being
// charged.
//
// TESTED BEFORE IT SHIPPED. esm.sh is not reachable from the sandbox this was
// written in, so the layout was developed and proved against the same library
// installed from npm, rendered to images, and looked at - a one-page 5-seat
// quote, a two-page one with long terms, and one with no logo at all. Only the
// import specifier differs between what was tested and what runs here.

export function money(n: unknown): string {
  const v = Number(n ?? 0);
  return '$' + v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function longDate(d: string | null | undefined): string {
  if (!d) return '—';
  const dt = new Date(String(d).length <= 10 ? d + 'T12:00:00Z' : d);
  if (isNaN(dt.getTime())) return '—';
  return dt.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'America/New_York' });
}

/* Word-wraps to a width in points. Written out rather than pulled in because
   the terms block is admin-written prose of unpredictable length and silently
   running off the right edge of a quote is not an acceptable failure. */
export function wrap(text: unknown, font: any, size: number, maxWidth: number): string[] {
  const out: string[] = [];
  for (const para of String(text ?? '').split('\n')) {
    if (!para.trim()) { out.push(''); continue; }
    let line = '';
    for (const word of para.split(/\s+/)) {
      const test = line ? line + ' ' + word : word;
      if (font.widthOfTextAtSize(test, size) <= maxWidth) { line = test; }
      else { if (line) out.push(line); line = word; }
    }
    if (line) out.push(line);
  }
  return out;
}

export async function buildQuotePdf(lib: any, r: any, logoBytes: Uint8Array | null): Promise<Uint8Array> {
  const { PDFDocument, StandardFonts, rgb } = lib;

  const doc = await PDFDocument.create();
  doc.setTitle(`EconSquad AI quote ${r.quote_no || ''} — ${r.organization || ''}`);
  doc.setAuthor('Global Site Location Industries, LLC');
  doc.setSubject('Quotation — EconSquad AI Team Plan');
  doc.setCreator('EconSquad AI');

  const reg  = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);

  const LIME  = rgb(0.42, 0.72, 0.0);
  const INK   = rgb(0.05, 0.07, 0.13);
  const GREY  = rgb(0.42, 0.48, 0.59);
  const RULE  = rgb(0.90, 0.92, 0.95);

  const W = 612, H = 792;            // US Letter, the paper a US buyer files
  const L = 54, R = W - 54;
  let page = doc.addPage([W, H]);
  let y = H - 54;

  const newPage = () => { page = doc.addPage([W, H]); y = H - 54; };
  const room = (n: number) => { if (y - n < 64) newPage(); };

  const text = (s: unknown, x: number, yy: number, { size = 10, font = reg, color = INK }: any = {}) =>
    page.drawText(String(s ?? ''), { x, y: yy, size, font, color });

  const right = (s: unknown, xr: number, yy: number, { size = 10, font = reg, color = INK }: any = {}) =>
    page.drawText(String(s ?? ''), { x: xr - font.widthOfTextAtSize(String(s ?? ''), size), y: yy, size, font, color });

  const rule = (yy: number, color: any = RULE, thickness = 1) =>
    page.drawLine({ start: { x: L, y: yy }, end: { x: R, y: yy }, thickness, color });

  const label = (s: string) => { room(26); y -= 15; text(s, L, y, { size: 7.5, font: bold, color: GREY }); y -= 10; };

  // ── Letterhead ──────────────────────────────────────────────────────
  if (logoBytes) {
    const png = await doc.embedPng(logoBytes);
    const w = 168;                                  // 600x150 source
    const h = (png.height / png.width) * w;
    page.drawImage(png, { x: L, y: y - h + 6, width: w, height: h });
    // The logo carries its own tagline along the bottom edge, so the company
    // line needs real clearance or the two sit on top of each other.
    y -= h + 6;
  } else {
    // A missing logo must not produce a blank letterhead.
    text('EconSquad AI', L, y - 14, { size: 20, font: bold });
    y -= 22;
  }
  text('Global Site Location Industries, LLC   ·   econsquad.ai   ·   eric@econsquad.ai',
       L, y, { size: 8, color: GREY });
  y -= 8;
  page.drawLine({ start: { x: L, y }, end: { x: R, y }, thickness: 2.2, color: LIME });

  y -= 26;
  text('QUOTATION — TEAM PLAN', L, y, { size: 14, font: bold });

  // ── Prepared for / details ──────────────────────────────────────────
  y -= 26;
  const colR = L + 300;
  text('PREPARED FOR', L, y, { size: 7.5, font: bold, color: GREY });
  text('QUOTE DETAILS', colR, y, { size: 7.5, font: bold, color: GREY });
  y -= 14;
  text(r.organization, L, y, { size: 11, font: bold });
  const detail = (k: string, v: string, yy: number) => {
    text(k, colR, yy, { size: 9, color: GREY });
    text(v, colR + 74, yy, { size: 9, font: bold });
  };
  detail('Quote no.', r.quote_no || '—', y);
  y -= 13;
  text([r.full_name, r.role_title].filter(Boolean).join(', '), L, y, { size: 9.5 });
  detail('Date', longDate(r.quote_prepared_at || new Date().toISOString()), y);
  y -= 13;
  detail('Valid until', longDate(r.quote_valid_until), y);
  y -= 13;
  detail('Prepared by', 'Eric Kleinsorge', y);

  // ── Opening ─────────────────────────────────────────────────────────
  if (r.quote_intro) {
    y -= 21;
    for (const line of wrap(r.quote_intro, reg, 9.5, R - L)) {
      room(14); text(line, L, y, { size: 9.5 }); y -= 12.5;
    }
  }

  // ── Line items ──────────────────────────────────────────────────────
  const seats = Number(r.quote_seats ?? 0);
  const free  = Number(r.quote_free_seats ?? 0);
  const unit  = Number(r.quote_unit_price ?? 0);
  const total = Number(r.quote_total ?? 0);

  label('WHAT IS BEING QUOTED');
  y -= 2;
  text('ITEM', L, y, { size: 7.5, font: bold, color: GREY });
  text('QTY', R - 150, y, { size: 7.5, font: bold, color: GREY });
  right('AMOUNT', R, y, { size: 7.5, font: bold, color: GREY });
  y -= 6;
  rule(y, INK, 1.2);

  const item = (desc: string, sub: string, qty: number, amount: string, muted: boolean) => {
    room(34);
    y -= 16;
    text(desc, L, y, { size: 9.5, color: muted ? GREY : INK });
    text(String(qty), R - 150, y, { size: 9.5, color: muted ? GREY : INK });
    right(amount, R, y, { size: 9.5, color: muted ? GREY : INK });
    if (sub) { y -= 10.5; text(sub, L, y, { size: 8, color: GREY }); }
    y -= 7;
    rule(y);
  };

  item('EconSquad AI — Pro Squad, annual subscription',
       `per named user, ${money(unit)} each`, seats, money(total), false);
  if (free > 0) item('Additional seat — included at no charge', '', free, money(0), true);
  item('Onboarding session for the team (60 minutes, remote)', '', 1, 'Included', true);

  y -= 18;
  text('TOTAL — 12 months', L, y, { size: 11, font: bold });
  right(money(total), R, y, { size: 15, font: bold });
  y -= 13;
  const users = seats + free;
  text(`${users} named user${users === 1 ? '' : 's'}. One invoice. One renewal date.`,
       L, y, { size: 8.5, color: GREY });

  // ── Terms ───────────────────────────────────────────────────────────
  if (r.quote_terms) {
    label('TERMS');
    for (const line of wrap(r.quote_terms, reg, 9, R - L)) {
      room(13);
      if (line === '') { y -= 6; continue; }
      text(line, L, y, { size: 9 }); y -= 11.5;
    }
  }

  // ── Acceptance ──────────────────────────────────────────────────────
  // The reason this PDF exists. A quote a public buyer cannot sign is a quote
  // they have to retype into their own form. The fields are fillable so it can
  // be completed on screen, and they print as ordinary ruled lines so it can
  // equally be done with a pen.
  // Height measured against what actually goes in it: heading, two wrapped
  // lines, and two rows of fields each with a caption below. Guessing at 118
  // put the last two captions outside the panel.
  const ACC_H = 150;
  room(ACC_H + 30);
  y -= 26;
  page.drawRectangle({ x: L, y: y + 14 - ACC_H, width: R - L, height: ACC_H, color: rgb(0.96, 0.97, 0.98) });
  page.drawLine({ start: { x: L, y: y + 14 }, end: { x: L, y: y + 14 - ACC_H }, thickness: 3, color: LIME });

  text('ACCEPTANCE', L + 14, y, { size: 7.5, font: bold, color: GREY });
  y -= 14;
  for (const line of wrap(
    `To accept, sign below and return this page, or issue a purchase order referencing ${r.quote_no || 'this quote'}. We will invoice on receipt.`,
    reg, 9, R - L - 28)) {
    text(line, L + 14, y, { size: 9 }); y -= 12;
  }

  const form = doc.getForm();
  const field = (name: string, caption: string, x: number, w: number) => {
    const f = form.createTextField(name);
    f.setText('');
    f.addToPage(page, { x, y: y - 20, width: w, height: 18,
      borderWidth: 0, backgroundColor: rgb(1, 1, 1) });
    page.drawLine({ start: { x, y: y - 22 }, end: { x: x + w, y: y - 22 }, thickness: 0.8, color: GREY });
    page.drawText(caption, { x, y: y - 32, size: 7, font: reg, color: GREY });
  };

  y -= 8;
  const half = (R - L - 28 - 16) / 2;
  field('signature',  'Authorised signature', L + 14, half);
  field('sign_date',  'Date',                 L + 14 + half + 16, half);
  y -= 44;
  field('print_name', 'Name and title',       L + 14, half);
  field('po_number',  'Purchase order number, if applicable', L + 14 + half + 16, half);

  // ── Footer on every page ────────────────────────────────────────────
  const pages = doc.getPages();
  pages.forEach((pg: any, i: number) => {
    pg.drawText('Global Site Location Industries, LLC   ·   econsquad.ai   ·   eric@econsquad.ai',
      { x: L, y: 34, size: 7.5, font: reg, color: GREY });
    pg.drawText(`Page ${i + 1} of ${pages.length}`,
      { x: R - 52, y: 34, size: 7.5, font: reg, color: GREY });
    pg.drawText('We will never ask you for a card number, bank details or a password by email.',
      { x: L, y: 22, size: 7, font: reg, color: GREY });
  });

  return await doc.save();
}
