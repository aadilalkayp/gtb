import { beforeEach } from "vitest";
import { resetDb } from "./helpers.js";

beforeEach(async () => {
  await resetDb();
});
