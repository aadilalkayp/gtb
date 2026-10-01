/** CLI entry: pnpm --filter @gtb/e2e stack:start | stack:stop | stack:reset */
import { startStack, stopStack } from "../helpers/stack.js";
import { resetDatabase } from "../helpers/db.js";

const cmd = process.argv[2];

switch (cmd) {
  case "start":
    startStack();
    break;
  case "stop":
    stopStack();
    break;
  case "reset":
    await resetDatabase();
    console.log("[e2e] database wiped (schema kept)");
    break;
  default:
    console.error(`unknown stack command: ${cmd}`);
    process.exit(1);
}
