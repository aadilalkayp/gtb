import path from "node:path";
import { fileURLToPath } from "node:url";
import { withSentryConfig } from "@sentry/nextjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Docker deploys run the traced standalone server (deploy/Dockerfile) — a
  // self-contained .next/standalone tree with only the node_modules the server
  // actually imports. Harmless for local `next start`.
  output: "standalone",
  // Monorepo: trace from the repo root so workspace packages (@gtb/*) and the
  // hoisted pnpm store resolve into the standalone output.
  outputFileTracingRoot: path.join(__dirname, "../.."),
  // Files read at runtime with fs (not imports) must be traced explicitly or
  // they're missing from the standalone image: the share-card fonts, and the
  // WebAssembly satori loads lazily (harfbuzz for shaping, yoga for layout).
  outputFileTracingIncludes: {
    "/api/scan/card": [
      "./src/assets/fonts/**",
      "../../node_modules/.pnpm/harfbuzzjs@*/node_modules/harfbuzzjs/**",
      "../../node_modules/.pnpm/yoga-wasm-web@*/node_modules/yoga-wasm-web/**",
    ],
    // pdfkit reads its standard-font metrics (data/*.afm) from disk; the
    // Blueprint PDF also embeds the Inter fonts.
    "/api/**": ["../../node_modules/.pnpm/pdfkit@*/node_modules/pdfkit/js/data/**"],
    "/api/styling/**": ["./src/assets/fonts/**"],
    "/api/assessment/**": ["./src/assets/fonts/**"],
  },
  // @gtb/* packages ship TypeScript source; let Next transpile them.
  transpilePackages: ["@gtb/db", "@gtb/shared"],
  // ZenStack runtime, Prisma client, resvg (native binary), satori (ships
  // WebAssembly that webpack can't relocate) and pdfkit are server-only; don't bundle them.
  serverExternalPackages: [
    "@prisma/client",
    "@prisma/adapter-pg",
    "@zenstackhq/runtime",
    "@resvg/resvg-js",
    "satori",
    // pdfkit loads font files relative to its own path, so bundling it breaks
    // every PDF (Oct 2026 review, H1: receipts failed with ENOENT Helvetica.afm).
    "pdfkit",
  ],
  webpack: (config) => {
    // Our packages use NodeNext `.js` import specifiers that actually point to
    // `.ts` sources. Teach webpack to resolve them (Vite/tsc do this natively).
    config.resolve.extensionAlias = {
      ".js": [".ts", ".tsx", ".js", ".jsx"],
      ".mjs": [".mts", ".mjs"],
    };
    return config;
  },
};

// Sentry's build plugin only uploads source maps when SENTRY_AUTH_TOKEN is set;
// otherwise this is a plain pass-through, so dev/CI builds need nothing.
export default withSentryConfig(nextConfig, {
  silent: true,
  disableLogger: true,
  telemetry: false,
  sourcemaps: { disable: !process.env.SENTRY_AUTH_TOKEN },
});
