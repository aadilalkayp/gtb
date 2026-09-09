/**
 * Funnel message templates — the scan report email and the follow-up drips
 * that work a lead between "unlocked a report" and "talked to GTB".
 *
 * Every template renders from one FunnelContext (built by channels.ts from the
 * client + their latest scan) into channel-specific bodies: an email
 * (subject/html/text) and a short WhatsApp text. Adding a template = one entry
 * in TEMPLATES; the drip scheduler in scanJobs.ts decides *when* each fires.
 */
import { formatDate } from "@gtb/shared";
import type { SendMailInput } from "./mailer.js";
import { button, esc, layout } from "./emails.js";

export interface FunnelContext {
  firstName: string;
  /** "Groom To Be" / "Glow To Be" */
  brand: string;
  /** "Transformation Readiness Scan" */
  product: string;
  reportUrl: string;
  cardUrl: string;
  scanUrl: string;
  unsubscribeUrl: string;
  daysToWedding: number;
  readiness: number | null;
  scores: { skin: number; hair: number; beard: number; style: number } | null;
  focusAreas: { area: string; weight: number }[];
  /** Undone weekly-focus items due in the next 7 days. */
  weekItems: { title: string; description: string | null }[];
  /** Undone checklist milestones due in the next 30 days. */
  milestones: { title: string; dueDate: Date }[];
}

export interface RenderedMessage {
  email: Omit<SendMailInput, "to">;
  whatsapp: string;
}

export type FunnelTemplate = (ctx: FunnelContext) => RenderedMessage;

// ---------------------------------------------------------------------------
// Shared fragments
// ---------------------------------------------------------------------------

function footer(ctx: FunnelContext): string {
  return `<p style="margin:8px 0 0;font-size:11px;color:#a8a29e">
    You're receiving this because you took a ${esc(ctx.product)}.
    <a href="${esc(ctx.unsubscribeUrl)}" style="color:#a8a29e">Unsubscribe</a>
  </p>`;
}

function scoreStrip(ctx: FunnelContext): string {
  if (!ctx.scores || ctx.readiness == null) return "";
  const cell = (label: string, v: number) =>
    `<td align="center" style="padding:8px 4px;font-size:12px;color:#78716c">${label}<br><span style="font-size:18px;font-weight:700;color:#1c1917">${v}</span></td>`;
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 18px;background:#f5f5f4;border-radius:10px">
    <tr>
      <td align="center" style="padding:14px 8px 4px;font-size:12px;color:#78716c">Wedding readiness<br><span style="font-size:34px;font-weight:800;color:#0b7e70">${ctx.readiness}</span></td>
    </tr>
    <tr><td><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
      ${cell("Skin", ctx.scores.skin)}${cell("Hair", ctx.scores.hair)}${cell("Beard", ctx.scores.beard)}${cell("Style", ctx.scores.style)}
    </tr></table></td></tr>
  </table>`;
}

function list(items: string[]): string {
  if (!items.length) return "";
  return `<ul style="margin:0 0 18px;padding-left:18px;font-size:14px;line-height:1.7">${items
    .map((i) => `<li>${i}</li>`)
    .join("")}</ul>`;
}

function textList(items: string[]): string {
  return items.map((i) => `• ${i}`).join("\n");
}

const p = (html: string) => `<p style="margin:0 0 14px;font-size:14px;line-height:1.6">${html}</p>`;

function unsubscribeText(ctx: FunnelContext): string {
  return `\n\nUnsubscribe: ${ctx.unsubscribeUrl}`;
}

// ---------------------------------------------------------------------------
// Templates
// ---------------------------------------------------------------------------

const scanReport: FunnelTemplate = (ctx) => {
  const focus = ctx.focusAreas.map((f) => `<strong>${f.weight}%</strong> ${esc(f.area)}`);
  const subject = `Your ${ctx.product} report — ${ctx.readiness ?? "—"}% ready with ${ctx.daysToWedding} days to go`;
  const html = layout(
    `${esc(ctx.firstName)}, here's your readiness report`,
    `
    ${p(`Your wedding is in <strong>${ctx.daysToWedding} days</strong>. Here's where you stand today — and the plan to move the number.`)}
    ${scoreStrip(ctx)}
    ${focus.length ? p("<strong>Where to focus</strong>") + list(focus) : ""}
    <p style="margin:0 0 22px">${button(ctx.reportUrl, "Open my full report & roadmap")}</p>
    ${p(`Keep this email — the link is your report, your week-by-week roadmap, and where your monthly rescans live.`)}
    ${p(`<span style="color:#78716c;font-size:12px">Scores rate appearance only and are never a medical assessment.</span>`)}
  `,
    footer(ctx),
  );
  const text = `Hi ${ctx.firstName},

Your wedding is in ${ctx.daysToWedding} days. Your ${ctx.product} readiness: ${ctx.readiness ?? "—"}/100.
${ctx.scores ? `Skin ${ctx.scores.skin} · Hair ${ctx.scores.hair} · Beard ${ctx.scores.beard} · Style ${ctx.scores.style}` : ""}
${ctx.focusAreas.length ? `\nWhere to focus:\n${textList(ctx.focusAreas.map((f) => `${f.weight}% ${f.area}`))}` : ""}

Open your full report & roadmap: ${ctx.reportUrl}

Scores rate appearance only and are never a medical assessment.${unsubscribeText(ctx)}`;
  const whatsapp = `Hi ${ctx.firstName}! Your ${ctx.product} report is ready: ${ctx.readiness ?? "—"}/100 with ${ctx.daysToWedding} days to your wedding. Full report + roadmap: ${ctx.reportUrl}`;
  return { email: { subject, html, text }, whatsapp };
};

const dripDay3Focus: FunnelTemplate = (ctx) => {
  const items = ctx.weekItems.map(
    (i) => `<strong>${esc(i.title)}</strong>${i.description ? ` — ${esc(i.description)}` : ""}`,
  );
  const subject = `Your week-1 focus, ${ctx.firstName}`;
  const html = layout(
    "This week's plan",
    `
    ${p(`Three days in. The scan found your biggest lever is <strong>${esc(ctx.focusAreas[0]?.area ?? "consistency")}</strong> — this week's roadmap is built around it:`)}
    ${list(items.length ? items : ["Open your roadmap for this week's focus."])}
    <p style="margin:0 0 22px">${button(ctx.reportUrl, "See my roadmap")}</p>
    ${p(`Small things, done daily, are what move a readiness score. Tick them off as you go.`)}
  `,
    footer(ctx),
  );
  const text = `Hi ${ctx.firstName},

Three days in. Your biggest lever is ${ctx.focusAreas[0]?.area ?? "consistency"} — this week's roadmap:
${textList(ctx.weekItems.map((i) => i.title))}

See my roadmap: ${ctx.reportUrl}${unsubscribeText(ctx)}`;
  const whatsapp = `Hi ${ctx.firstName}, your week-1 focus is ready: ${ctx.weekItems[0]?.title ?? "see your roadmap"}. ${ctx.reportUrl}`;
  return { email: { subject, html, text }, whatsapp };
};

const dripDay7Checkin: FunnelTemplate = (ctx) => {
  const ms = ctx.milestones.map(
    (m) => `<strong>${esc(m.title)}</strong> — ${formatDate(m.dueDate)}`,
  );
  const subject = `One week in — what's coming up before the wedding`;
  const html = layout(
    "Milestones on your calendar",
    `
    ${p(`A week since your scan, ${esc(ctx.firstName)}. Beyond the daily routine, these are the wedding-prep milestones due soon:`)}
    ${list(ms.length ? ms : ["Your milestone checklist is in your roadmap."])}
    <p style="margin:0 0 22px">${button(ctx.reportUrl, "Open my checklist")}</p>
    ${p(`Want a coach to run this for you? The GTB program pairs you with skincare, fitness and styling consultants who work your plan with you — reply to this email and we'll set up a call.`)}
  `,
    footer(ctx),
  );
  const text = `Hi ${ctx.firstName},

A week since your scan. Milestones due soon:
${textList(ctx.milestones.map((m) => `${m.title} — ${formatDate(m.dueDate)}`))}

Open my checklist: ${ctx.reportUrl}

Want a coach to run this for you? Reply to this email and we'll set up a call.${unsubscribeText(ctx)}`;
  const whatsapp = `Hi ${ctx.firstName}, one week in! Next milestone: ${ctx.milestones[0] ? `${ctx.milestones[0].title} (${formatDate(ctx.milestones[0].dueDate)})` : "see your checklist"}. ${ctx.reportUrl}`;
  return { email: { subject, html, text }, whatsapp };
};

const dripDay14Progress: FunnelTemplate = (ctx) => {
  const subject = `Two weeks in — how the score actually moves`;
  const html = layout(
    "Halfway to your first rescan",
    `
    ${p(`Two weeks of routine, ${esc(ctx.firstName)}. Here's what typically shifts first, and what takes longer:`)}
    ${list([
      "<strong>Hydration & skin texture</strong> — visible within 2–3 weeks of a consistent routine.",
      "<strong>Tone evenness</strong> — 6–8 weeks; sunscreen every morning is the whole game.",
      "<strong>Beard & hair shape</strong> — immediate with the right cut; density takes months.",
      "<strong>Style</strong> — the fastest score to move: fit and colour, not spend.",
    ])}
    ${p(`Your rescan is in two weeks — same angle, same light, and you'll see the difference measured against <em>yourself</em>, not anyone else.`)}
    <p style="margin:0 0 22px">${button(ctx.reportUrl, "Check my roadmap")}</p>
  `,
    footer(ctx),
  );
  const text = `Hi ${ctx.firstName},

Two weeks of routine. What shifts first:
• Hydration & skin texture — 2–3 weeks
• Tone evenness — 6–8 weeks (sunscreen every morning)
• Beard & hair shape — immediate with the right cut
• Style — the fastest score to move

Your rescan is in two weeks. Roadmap: ${ctx.reportUrl}${unsubscribeText(ctx)}`;
  const whatsapp = `Hi ${ctx.firstName}, two weeks in — skin texture usually shows first, tone takes 6–8 weeks. Rescan in 2 weeks! ${ctx.reportUrl}`;
  return { email: { subject, html, text }, whatsapp };
};

const rescanTemplate =
  (month: number): FunnelTemplate =>
  (ctx) => {
    const subject =
      month === 1
        ? `Time for your first rescan, ${ctx.firstName}`
        : `Month ${month}: rescan and see how far you've come`;
    const html = layout(
      "See your progress",
      `
      ${p(`It's been ${month === 1 ? "a month" : `${month} months`} since your ${month === 1 ? "scan" : "last check-in"}, with <strong>${ctx.daysToWedding} days</strong> to the wedding.`)}
      ${p(`Take a new selfie — same angle, same light — and the scan compares you against your own baseline: "<em>skin clarity improved 18%</em>", not a number in isolation.`)}
      <p style="margin:0 0 22px">${button(ctx.scanUrl, "Rescan now")}</p>
      ${p(`Use the same email and your history stays in one place.`)}
    `,
      footer(ctx),
    );
    const text = `Hi ${ctx.firstName},

${month === 1 ? "A month" : `${month} months`} since your scan, ${ctx.daysToWedding} days to the wedding. Take a new selfie (same angle, same light) and see your progress against your own baseline.

Rescan now: ${ctx.scanUrl}
(Use the same email so your history stays together.)${unsubscribeText(ctx)}`;
    const whatsapp = `Hi ${ctx.firstName}, it's rescan time — ${ctx.daysToWedding} days to go. Same angle, same light: ${ctx.scanUrl}`;
    return { email: { subject, html, text }, whatsapp };
  };

const dripT30FinalStretch: FunnelTemplate = (ctx) => {
  const subject = `30 days out — the final-stretch checklist`;
  const html = layout(
    "The last 30 days",
    `
    ${p(`${esc(ctx.firstName)}, the wedding is <strong>${ctx.daysToWedding} days</strong> away. Timing matters more than effort from here:`)}
    ${list([
      "<strong>Suit / sherwani trial</strong> — now, so alterations have two weeks.",
      "<strong>Last deep facial</strong> — no closer than 14 days out; skin needs time to settle.",
      "<strong>Final haircut & beard shape</strong> — 4–6 days before; sharp but softened.",
      "<strong>Shoes</strong> — buy this week and break them in.",
      "<strong>Sleep & water</strong> — the two things that show in every photo.",
    ])}
    <p style="margin:0 0 22px">${button(ctx.reportUrl, "Open my final checklist")}</p>
  `,
    footer(ctx),
  );
  const text = `Hi ${ctx.firstName},

${ctx.daysToWedding} days to the wedding. The final-stretch timing:
• Suit trial — now
• Last facial — no closer than 14 days out
• Final haircut & beard — 4–6 days before
• Shoes — buy this week, break them in
• Sleep & water

Final checklist: ${ctx.reportUrl}${unsubscribeText(ctx)}`;
  const whatsapp = `Hi ${ctx.firstName}, ${ctx.daysToWedding} days out! Suit trial now, last facial ≥14 days before, final haircut 4–6 days before. Checklist: ${ctx.reportUrl}`;
  return { email: { subject, html, text }, whatsapp };
};

/** Template registry. Keys are stored on OutboundMessage.template. */
export const TEMPLATES: Record<string, FunnelTemplate> = {
  scan_report: scanReport,
  drip_day3_focus: dripDay3Focus,
  drip_day7_checkin: dripDay7Checkin,
  drip_day14_progress: dripDay14Progress,
  drip_t30_final_stretch: dripT30FinalStretch,
};

/** Monthly rescan nudges are keyed per month so each fires once. */
export function rescanTemplateKey(month: number): string {
  return `drip_rescan_m${month}`;
}

/** The report email is keyed per scan so every claimed scan gets one. */
export function scanReportTemplateKey(scanId: string): string {
  return `scan_report:${scanId}`;
}

export function resolveTemplate(key: string): FunnelTemplate | undefined {
  const m = /^drip_rescan_m(\d+)$/.exec(key);
  if (m) return rescanTemplate(Number(m[1]));
  if (key.startsWith("scan_report:")) return scanReport;
  return TEMPLATES[key];
}
