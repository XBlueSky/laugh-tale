import { spawnSync } from "node:child_process";
import {
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { afterAll, describe, expect, test } from "vitest";

const repoRoot = fileURLToPath(new URL("../..", import.meta.url));
const temporaryRoots: string[] = [];

afterAll(() => {
  for (const root of temporaryRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

function run(command: string, commandArguments: string[], cwd: string): string {
  const result = spawnSync(command, commandArguments, { cwd, encoding: "utf8", shell: false });
  expect(
    result.status,
    `${command} ${commandArguments.join(" ")}:\n${result.stdout}\n${result.stderr}`,
  ).toBe(0);
  return result.stdout;
}

function npm(): string {
  return process.platform === "win32" ? "npm.cmd" : "npm";
}

function pack(packageDir: string, destination: string): string {
  run(npm(), ["run", "build"], packageDir);
  const [report] = JSON.parse(
    run(npm(), ["pack", "--json", "--pack-destination", destination], packageDir),
  ) as Array<{ filename: string }>;
  return join(destination, report.filename);
}

describe("clean tarball consumer", () => {
  test(
    "installs both tarballs, type-checks, and runtime-imports without repository paths",
    async () => {
      const root = mkdtempSync(join(realpathSync(tmpdir()), "laugh-tale-consumer-"));
      temporaryRoots.push(root);
      const packDestination = join(root, "packs");
      mkdirSync(packDestination);
      const coreTarball = pack(join(repoRoot, "packages/core"), packDestination);
      const reactTarball = pack(join(repoRoot, "packages/react"), packDestination);

      const consumerRoot = join(root, "consumer");
      mkdirSync(join(consumerRoot, "src"), { recursive: true });
      writeFileSync(
        join(consumerRoot, "package.json"),
        `${JSON.stringify(
          {
            name: "laugh-tale-clean-consumer",
            private: true,
            type: "module",
            dependencies: {
              "@laugh-tale-island/core": `file:${coreTarball}`,
              "@laugh-tale-island/react": `file:${reactTarball}`,
              react: "19.2.6",
              "react-dom": "19.2.6",
            },
            devDependencies: {
              "@types/react": "19.2.14",
            },
          },
          null,
          2,
        )}\n`,
      );
      writeFileSync(
        join(consumerRoot, "tsconfig.json"),
        `${JSON.stringify(
          {
            compilerOptions: {
              target: "ES2022",
              lib: ["ES2022", "DOM"],
              module: "NodeNext",
              moduleResolution: "NodeNext",
              jsx: "react-jsx",
              strict: true,
              noEmit: true,
            },
            include: ["src"],
          },
          null,
          2,
        )}\n`,
      );
      writeFileSync(
        join(consumerRoot, "src/core-consumer.ts"),
        [
          'import { buildTimelineEntries, emptyTripProgress, resolveEffectiveItinerary, validateTrip, type Trip } from "@laugh-tale-island/core";',
          'import type { ProgressStore } from "@laugh-tale-island/core/browser";',
          "",
          "export function summarize(trip: Trip, store: ProgressStore): number {",
          "  const validation = validateTrip(trip);",
          "  if (validation.errors.length > 0) return 0;",
          "  void store.read();",
          "  const effective = resolveEffectiveItinerary(trip, emptyTripProgress());",
          "  const day = effective.days[0];",
          "  return day === undefined ? 0 : buildTimelineEntries(day, effective).length;",
          "}",
          "",
        ].join("\n"),
      );
      writeFileSync(
        join(consumerRoot, "src/react-consumer.tsx"),
        [
          'import type { Trip } from "@laugh-tale-island/core";',
          'import { createLocalStorageProgressStore } from "@laugh-tale-island/core/browser";',
          'import { useCandidateDecision, useItinerarySheet, useTripProgress } from "@laugh-tale-island/react";',
          "",
          "export function Consumer({ trip }: { trip: Trip }) {",
          '  const progress = useTripProgress(trip, createLocalStorageProgressStore(`trip:${trip.id}`));',
          "  const sheet = useItinerarySheet({",
          '    snap: "half",',
          "    geometry: { collapsed: 100, half: 300, expanded: 600, ceiling: 600 },",
          "    onSnapChange: () => {},",
          "  });",
          "  const decision = useCandidateDecision({",
          "    group: trip.candidateGroups[0]!,",
          "    onMapOverrideChange: () => {},",
          "    onConfirm: (optionId) => progress.selectCandidate(trip.candidateGroups[0]!.id, optionId),",
          "  });",
          "  return (",
          "    <section {...sheet.getSheetProps()}>",
          "      <button type=\"button\" {...sheet.getHandleProps()} {...decision.getTriggerProps()} />",
          "      <output>{progress.persistenceStatus}</output>",
          "    </section>",
          "  );",
          "}",
          "",
        ].join("\n"),
      );

      run(npm(), ["install", "--no-audit", "--no-fund"], consumerRoot);

      for (const name of ["core", "react"]) {
        const installed = join(consumerRoot, "node_modules/@laugh-tale-island", name);
        expect(lstatSync(installed).isSymbolicLink(), `${name} must not be a symlink`).toBe(false);
        expect(existsSync(join(installed, "dist/index.js"))).toBe(true);
        expect(existsSync(join(installed, "src"))).toBe(false);
        expect(readdirSync(installed).sort()).toEqual([
          "LICENSE",
          "README.md",
          "dist",
          "package.json",
        ]);
      }

      const tsc = join(repoRoot, "node_modules/.bin/tsc");
      run(tsc, ["-p", "tsconfig.json"], consumerRoot);

      const imported = (await import(
        pathToFileURL(join(consumerRoot, "node_modules/@laugh-tale-island/core/dist/index.js")).href
      )) as Record<string, unknown>;
      expect(typeof imported.validateTrip).toBe("function");
      expect(typeof imported.resolveSheetGeometry).toBe("function");
    },
    600_000,
  );
});
