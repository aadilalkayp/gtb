/**
 * Lifecycle of the dedicated gtb_e2e Supabase stack.
 *
 * Uses the `supabase` CLI pinned as a devDependency (no global install
 * needed), always with `--workdir` pointed at this package so it can never
 * touch the dev stack in /supabase.
 */
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const E2E_DIR = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

export function supabaseCli(args: string[], opts: { quiet?: boolean } = {}): string {
  // Run the CLI pinned in this package's devDependencies through pnpm, so no
  // global install is ever required (works identically in CI).
  return execFileSync("pnpm", ["exec", "supabase", "--workdir", E2E_DIR, ...args], {
    cwd: E2E_DIR,
    encoding: "utf8",
    stdio: opts.quiet ? ["ignore", "pipe", "pipe"] : ["ignore", "inherit", "inherit"],
    env: { ...process.env },
  }) as unknown as string;
}

export function isStackRunning(): boolean {
  try {
    execFileSync("docker", ["inspect", "--format", "{{.State.Running}}", "supabase_db_gtb_e2e"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
    return true;
  } catch {
    return false;
  }
}

export function startStack(): void {
  if (isStackRunning()) {
    console.log("[e2e] gtb_e2e Supabase stack already running");
    return;
  }
  console.log("[e2e] starting gtb_e2e Supabase stack (first run downloads images)…");
  supabaseCli(["start"]);
}

export function stopStack(opts: { wipe?: boolean } = {}): void {
  supabaseCli(["stop", ...(opts.wipe ? ["--no-backup"] : [])]);
}
