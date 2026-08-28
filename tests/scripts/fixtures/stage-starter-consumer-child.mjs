import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

import { stageStarterConsumer } from "../../../scripts/stage-starter-consumer.mjs";

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

const outDir = process.argv[2];
if (outDir === undefined) throw new Error("staging child requires an output directory");

const result = await stageStarterConsumer({
  install: true,
  outDir: resolve(outDir),
});
runNpm(["run", "check"], result.stagedRoot);
console.log(`STAGE_CHILD_RESULT:${JSON.stringify({ ...result, check: "passed" })}`);
