import "dotenv/config";
import { defineConfig } from "prisma/config";

/**
 * Prisma 7 CLI configuration.
 *
 * Connection URLs no longer live in schema.prisma. The CLI (db push / studio /
 * migrate) connects via this datasource url, using the DIRECT (non-pooled) URL.
 * The app runtime connects separately through the @prisma/adapter-pg driver
 * adapter in src/index.ts (pooled DATABASE_URL).
 */
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: process.env.DIRECT_URL ?? process.env.DATABASE_URL ?? "",
  },
});
