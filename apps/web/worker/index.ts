/**
 * Edge Worker in front of the SPA's static assets. Runs only for /scan/r/*
 * (see wrangler.jsonc `run_worker_first`); everything else is served straight
 * from assets. Its one job: give shared report links real Open Graph tags —
 * crawlers (WhatsApp, Instagram, iMessage, X) don't run JavaScript, so a plain
 * SPA share unfurls as a generic page. We fetch the report's public summary
 * from the API and inject title/description/image into index.html.
 */
export interface Env {
  ASSETS: Fetcher;
  API_URL: string;
}

interface ReportSummary {
  scores: { readiness: number } | null;
  daysToWedding: number;
}

const PRODUCT = "Transformation Readiness Scan";

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const match = /^\/scan\/r\/([0-9a-f-]{36})\/?$/i.exec(url.pathname);
    if (!match) return env.ASSETS.fetch(request);
    const scanId = match[1];

    // The SPA shell: index.html via the assets binding (SPA fallback config).
    const shell = await env.ASSETS.fetch(new Request(new URL("/", url).toString(), request));
    let html = await shell.text();

    let title = `${PRODUCT} — GTB`;
    let description =
      "How wedding-ready are you? A free AI selfie scan with a week-by-week prep roadmap.";
    try {
      const res = await fetch(
        `${env.API_URL}/api/scan/report?scanId=${encodeURIComponent(scanId)}`,
        { cf: { cacheTtl: 300, cacheEverything: true } },
      );
      if (res.ok) {
        const { report } = (await res.json()) as { report: ReportSummary };
        if (report.scores) {
          title = `I'm ${report.scores.readiness}% wedding-ready — ${report.daysToWedding} days to go`;
          description = `Skin, hair, beard and style scored by the free ${PRODUCT}. See how you compare — scan yours in a minute.`;
        }
      }
    } catch {
      // API unavailable: fall back to generic tags rather than failing the page.
    }

    const image = `${env.API_URL}/api/scan/card?scanId=${encodeURIComponent(scanId)}`;
    const canonical = `${url.origin}/scan/r/${scanId}`;
    const tags = [
      `<meta property="og:title" content="${esc(title)}">`,
      `<meta property="og:description" content="${esc(description)}">`,
      `<meta property="og:image" content="${esc(image)}">`,
      `<meta property="og:image:width" content="1200">`,
      `<meta property="og:image:height" content="630">`,
      `<meta property="og:url" content="${esc(canonical)}">`,
      `<meta name="twitter:title" content="${esc(title)}">`,
      `<meta name="twitter:description" content="${esc(description)}">`,
      `<meta name="twitter:image" content="${esc(image)}">`,
    ].join("\n    ");

    // Drop the generic OG title/description from index.html so ours win, then
    // inject before </head>.
    html = html
      .replace(/<meta property="og:title"[^>]*>\s*/i, "")
      .replace(/<meta\s+property="og:description"[\s\S]*?>\s*/i, "")
      .replace(/<title>[^<]*<\/title>/i, `<title>${esc(title)}</title>`)
      .replace("</head>", `    ${tags}\n  </head>`);

    return new Response(html, {
      status: 200,
      headers: {
        "content-type": "text/html; charset=utf-8",
        "cache-control": "public, max-age=300",
      },
    });
  },
} satisfies ExportedHandler<Env>;
