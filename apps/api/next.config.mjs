/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
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
