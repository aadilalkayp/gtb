/** Validated server env. Throws early if a required var is missing in production. */

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    if (process.env.NODE_ENV === "production") {
      throw new Error(`Missing required env var: ${name}`);
    }
    // In dev, warn but allow boot so the app can render a setup state.
    console.warn(`[GTB OS API] Missing env var: ${name}`);
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
  webOrigin: (process.env.WEB_ORIGIN ?? "http://localhost:5173").split(",").map((o) => o.trim()),
  webPublicUrl: process.env.WEB_PUBLIC_URL ?? "http://localhost:5173",
  apiPublicUrl: process.env.API_PUBLIC_URL ?? "http://localhost:3001",
} as const;
