import path from "node:path";
import { fileURLToPath } from "node:url";

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
  // @gtb/* packages ship TypeScript source; let Next transpile them.
  transpilePackages: ["@gtb/db", "@gtb/shared"],
  // ZenStack runtime + Prisma client are server-only — don't bundle them.
  serverExternalPackages: ["@prisma/client", "@prisma/adapter-pg", "@zenstackhq/runtime"],
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

export default nextConfig;
