import { corsHeaders } from "./cors.js";

/** JSON response with CORS and no caching (per-user data). */
export function json(req: Request, body: unknown, status = 200): Response {
  return Response.json(body, {
    status,
    headers: { ...corsHeaders(req), "cache-control": "no-store" },
  });
}

/** Parse a JSON body; null when it is missing or malformed. */
export async function readJson<T extends object>(req: Request): Promise<Partial<T> | null> {
  try {
    const body = (await req.json()) as unknown;
    return body && typeof body === "object" && !Array.isArray(body) ? (body as Partial<T>) : null;
  } catch {
    return null;
  }
}
