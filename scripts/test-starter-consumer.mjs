import { spawnSync } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { stageStarterConsumer } from "./stage-starter-consumer.mjs";

const scratch = await mkdtemp(fileURLToPath(new URL("../tmp/starter-check-", import.meta.url)));
try {
  const { stagedRoot } = await stageStarterConsumer({
    recipe: "oak-washi",
    setupLocale: "zh-Hant-TW",
    outDir: join(scratch, "consumer"),
  });
  const checked = spawnSync("npm", ["run", "check"], { cwd: stagedRoot, stdio: "inherit", env: process.env });
  if (checked.error) throw checked.error;
  if (checked.status !== 0) throw new Error(`staged starter check failed (${checked.status ?? "signal"})`);
} finally {
  await rm(scratch, { recursive: true, force: true });
}
