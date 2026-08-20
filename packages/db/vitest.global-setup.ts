import { execSync } from "node:child_process";
import dotenv from "dotenv";

dotenv.config({ path: ".env.test" });

export default function setup() {
  execSync("npx prisma migrate deploy --schema ./prisma/schema.prisma", {
    cwd: __dirname,
    env: { ...process.env, DATABASE_URL: process.env.DATABASE_URL, DIRECT_URL: process.env.DIRECT_URL },
    stdio: "pipe",
  });
}
