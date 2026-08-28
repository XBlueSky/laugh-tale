import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { stageStarterConsumer } from "./stage-starter-consumer.mjs";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));

function parseRecipeArgument(arguments_) {
  const recipeFlags = arguments_.filter((argument) => argument === "--recipe");
  if (recipeFlags.length > 1) throw new Error("--recipe must be provided exactly once");
  if (arguments_.length !== 2 || arguments_[0] !== "--recipe") {
    throw new Error("Usage: npm run test:recipes:internal -- --recipe field-atlas");
  }
  const recipe = arguments_[1];
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(recipe)) {
    throw new Error("recipe name must use lowercase letters, numbers, and hyphens");
  }
  return recipe;
}

function npmInvocation(arguments_) {
  if (process.env.npm_execpath) {
    return { command: process.execPath, arguments: [process.env.npm_execpath, ...arguments_] };
  }
  return {
    command: process.platform === "win32" ? "npm.cmd" : "npm",
    arguments: arguments_,
  };
}

function runNpm(arguments_, cwd, env = process.env) {
  const invocation = npmInvocation(arguments_);
  const result = spawnSync(invocation.command, invocation.arguments, {
    cwd,
    env,
    stdio: "inherit",
    shell: false,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`npm ${arguments_.join(" ")} failed (${result.status})`);
  }
}

async function main() {
  const recipe = parseRecipeArgument(process.argv.slice(2));
  const outDir = join(repoRoot, "tmp", "internal-recipes", recipe, "consumer");
  const { stagedRoot } = await stageStarterConsumer({
    install: true,
    outDir,
    recipe,
  });
  runNpm(["run", "check"], stagedRoot);
  runNpm(
    ["run", "test:e2e", "--", "tests/e2e/presentation-contract.spec.ts"],
    stagedRoot,
    { ...process.env, ETERNAL_POSE_RECIPE_UNDER_TEST: recipe },
  );
}

try {
  await main();
} catch (error) {
  console.error(error instanceof Error ? error.message : "internal recipe test failed");
  process.exitCode = 1;
}
