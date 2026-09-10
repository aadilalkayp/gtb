/**
 * Loads apps/api env files BEFORE any src/lib module reads process.env.
 * Import this FIRST in every eval runner (ESM evaluates imports in order).
 */
import { config } from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";

const apiRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
for (const f of [".env.local", ".env"]) {
  config({ path: path.join(apiRoot, f) });
}
