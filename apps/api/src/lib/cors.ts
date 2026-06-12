import { env } from "./env.js";

/** CORS headers for the web origin(s). The web app and API live on different hosts. */
export function corsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get("origin") ?? "";
  const isDev = process.env.NODE_ENV !== "production";
  const isLocalhost = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
  // In dev, accept any localhost origin (Vite may use an auto-assigned port).
  const allowed =
    env.webOrigin.includes(origin) || (isDev && isLocalhost) ? origin : (env.webOrigin[0] ?? "*");
  return {
    "Access-Control-Allow-Origin": allowed,
    "Access-Control-Allow-Methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Credentials": "true",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

/** Preflight handler. */
export function handleOptions(req: Request): Response {
  return new Response(null, { status: 204, headers: corsHeaders(req) });
}

/** Attach CORS headers to a response produced by a downstream handler. */
export function withCors(req: Request, res: Response): Response {
  const headers = new Headers(res.headers);
  for (const [k, v] of Object.entries(corsHeaders(req))) headers.set(k, v);
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
}
