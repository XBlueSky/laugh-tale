import { spawn, spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { stageStarterConsumer } from "../../../scripts/stage-starter-consumer.mjs";

if (process.env.STAGE_CHILD_TEST_MODE === "grandchild") {
  console.log("STAGE_CHILD_GRANDCHILD_STDOUT");
  console.error("STAGE_CHILD_GRANDCHILD_STDERR");
  process.on("SIGTERM", () => {
    console.error("STAGE_CHILD_GRANDCHILD_IGNORED_TERM");
  });
  globalThis.setInterval(() => undefined, 1_000);
} else if (process.env.STAGE_CHILD_TEST_MODE === "hang") {
  const grandchild = spawn(process.execPath, [fileURLToPath(import.meta.url)], {
    env: { ...process.env, STAGE_CHILD_TEST_MODE: "grandchild" },
    shell: false,
    stdio: ["ignore", "inherit", "inherit"],
  });
  if (grandchild.pid === undefined) throw new Error("hanging fixture failed to spawn grandchild");
  console.log(`STAGE_CHILD_GRANDCHILD_PID:${grandchild.pid}`);
  console.log("STAGE_CHILD_HANG_STDOUT");
  console.error("STAGE_CHILD_HANG_STDERR");
  globalThis.setInterval(() => undefined, 1_000);
} else {
  await main();
}

function runNpm(commandArguments, cwd) {
  const invocation = process.env.npm_execpath
    ? { command: process.execPath, arguments: [process.env.npm_execpath, ...commandArguments] }
    : {
        command: process.platform === "win32" ? "npm.cmd" : "npm",
        arguments: commandArguments,
      };
  const result = spawnSync(invocation.command, invocation.arguments, {
    cwd,
    encoding: "utf8",
    shell: false,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(
      `npm ${commandArguments.join(" ")} failed (${result.status}):\n${result.stdout}\n${result.stderr}`,
    );
  }
}

async function main() {
  const outDir = process.argv[2];
  if (outDir === undefined) throw new Error("staging child requires an output directory");
  const commandEvents = [];
  const result = await stageStarterConsumer(
    {
      install: true,
      outDir: resolve(outDir),
    },
    {
      onCommand: (command) => commandEvents.push({ ...command, at: Date.now(), phase: "start" }),
      onCommandComplete: (command) =>
        commandEvents.push({ ...command, at: Date.now(), phase: "complete" }),
    },
  );
  runNpm(["run", "check"], result.stagedRoot);
  console.log(
    `STAGE_CHILD_RESULT:${JSON.stringify({ ...result, check: "passed", commandEvents })}`,
  );
}
