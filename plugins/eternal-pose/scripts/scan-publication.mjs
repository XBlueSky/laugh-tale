import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { scanPublication } from "../lib/publication-scan.mjs";

function requestedRoot(arguments_) {
  if (arguments_.length === 0) return process.cwd();
  if (arguments_.length === 1 && !arguments_[0].startsWith("--")) return arguments_[0];
  if (arguments_.length === 2 && arguments_[0] === "--root") return arguments_[1];
  return null;
}

function summarize(findings) {
  return {
    counts: {
      errors: findings.filter((finding) => finding.severity === "error").length,
      warnings: findings.filter((finding) => finding.severity === "warning").length,
    },
    findings,
  };
}

function isMainModule() {
  return process.argv[1] !== undefined && pathToFileURL(resolve(process.argv[1])).href === import.meta.url;
}

if (isMainModule()) {
  const rootDir = requestedRoot(process.argv.slice(2));
  if (rootDir === null) {
    console.log(
      JSON.stringify(
        summarize([
          {
            severity: "error",
            code: "scan.invalid-arguments",
            path: ".",
            message: "Usage: node scan-publication.mjs [--root] /absolute/project/path",
          },
        ]),
        null,
        2,
      ),
    );
    process.exitCode = 1;
  } else {
    try {
      const findings = await scanPublication(rootDir);
      const result = summarize(findings);
      console.log(JSON.stringify(result, null, 2));
      if (result.counts.errors > 0) process.exitCode = 1;
    } catch {
      console.log(
        JSON.stringify(
          summarize([
            {
              severity: "error",
              code: "scan.failure",
              path: ".",
              message: "Publication scan could not inspect the requested root.",
            },
          ]),
          null,
          2,
        ),
      );
      process.exitCode = 1;
    }
  }
}
