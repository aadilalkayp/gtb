/** Validated server env. Throws early if a required var is missing in production. */

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    if (process.env.NODE_ENV === "production") {
      throw new Error(`Missing required env var: ${name}`);
    }
    // In dev, warn but allow boot so the app can render a setup state.
    console.warn(`[env] missing env var (dev fallback to empty): ${name}`);
    return "";
  }
  return value;
}

export const env = {
  databaseUrl: required("DATABASE_URL"),
  supabaseUrl: required("SUPABASE_URL"),
  supabaseAnonKey: required("SUPABASE_ANON_KEY"),
  supabaseServiceRoleKey: required("SUPABASE_SERVICE_ROLE_KEY"),
  mailgun: {
    host: process.env.MAILGUN_SMTP_HOST ?? "smtp.mailgun.org",
    port: Number(process.env.MAILGUN_SMTP_PORT ?? 587),
    user: process.env.MAILGUN_SMTP_USER ?? "",
    password: process.env.MAILGUN_SMTP_PASSWORD ?? "",
    from: process.env.MAIL_FROM ?? "GTB OS <no-reply@example.com>",
  },
  // SEC-13: the web origin must be explicitly configured in production — a
  // localhost default would silently lock the app to the wrong host.
  webOrigin:
    process.env.NODE_ENV === "production" && !process.env.WEB_ORIGIN
      ? (() => {
          throw new Error("Missing required env var: WEB_ORIGIN");
        })()
      : (process.env.WEB_ORIGIN ?? "http://localhost:5175").split(",").map((o) => o.trim()),
  webPublicUrl: process.env.WEB_PUBLIC_URL ?? "http://localhost:5175",
  apiPublicUrl: process.env.API_PUBLIC_URL ?? "http://localhost:3005",
} as const;
