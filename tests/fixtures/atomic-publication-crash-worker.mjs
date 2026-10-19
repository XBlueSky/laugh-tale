import { dirname, join } from "node:path";
import fs from "node:fs/promises";
import { syncBuiltinESMExports } from "node:module";
import { publishCreatedProject, recoverProjectFileTransaction, replaceProjectFiles, replaceOwnedDirectoryAtomically } from "../../plugins/eternal-pose/lib/atomic-publication.mjs";

const [action, projectDir, phase, occurrence = "1"] = process.argv.slice(2);
let seen = 0;
const noop = async () => {};
const operations = { async beforeMutation(event) {
  if (event.phase === phase && ++seen === Number(occurrence)) {
    process.send?.({ paused: true, event });
    await new Promise((resolve) => process.once("message", resolve));
  }
} };
try {
  if (action === "recover-pause") {
    const operation = phase === "claim" ? "unlink" : phase;
    const original = fs[operation];
    fs[operation] = async (...args) => {
      const result = await original(...args);
      const path = String(args[0]);
      const matches = phase === "claim" ? path.startsWith(`${dirname(projectDir)}/.laugh-tale-writer-`) && path.endsWith(".recovery") : path === projectDir || path.startsWith(`${projectDir}/`) || path.startsWith(`${dirname(projectDir)}/.laugh-tale-stage-`);
      if (matches && ++seen === Number(occurrence)) {
        process.send?.({ paused: true, operation: phase, path: args[0] });
        await new Promise((resolve) => process.once("message", resolve));
      }
      return result;
    };
    syncBuiltinESMExports();
    process.stdout.write(await recoverProjectFileTransaction(projectDir));
  } else if (action === "recover") {
    process.stdout.write(await recoverProjectFileTransaction(projectDir));
  } else if (action === "create") {
    await publishCreatedProject({ targetDir: projectDir, populate: async (stage) => { await fs.mkdir(join(stage, "src")); await fs.writeFile(join(stage, "manifest"), "created manifest"); await fs.writeFile(join(stage, "src/ledger"), "created ledger"); }, validate: noop }, operations);
  } else if (action === "directory") {
    await replaceOwnedDirectoryAtomically({ targetDir: projectDir, candidateDir: join(projectDir, "../candidate"), backupDir: join(projectDir, "../backup"), validateExisting: noop, validateCandidate: noop, validateInstalled: noop }, operations);
  } else {
    await replaceProjectFiles({ projectDir, replacements: new Map([["manifest", "new manifest"], ["src/ledger", "new ledger"]]), allowedPaths: new Set(["manifest", "src/ledger"]), validate: noop }, operations);
  }
  process.disconnect?.();
} catch (error) {
  process.stderr.write(error.stack);
  process.exitCode = 1;
  process.disconnect?.();
}
