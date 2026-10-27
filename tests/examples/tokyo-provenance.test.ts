import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = resolve(import.meta.dirname, "../../examples/tokyo");
const read = <T>(file: string): T => JSON.parse(readFileSync(resolve(ROOT, file), "utf8")) as T;

type LockEntry = { version?: string; resolved?: string };
const PACKAGES = ["@laugh-tale-island/core", "@laugh-tale-island/react"];

// Baseline option (c): the two Laugh Tale packages come from tarballs packed from main HEAD and
// committed under examples/tokyo/vendor; everything else must still resolve from registry.npmjs.org.
describe("examples/tokyo provenance", () => {
  it("installs both packages from the vendored tarballs and everything else from npmjs", () => {
    const pkg = read<{ dependencies: Record<string, string> }>("package.json");
    const meta = read<{ packages: Record<string, string>; recipe: string }>("eternal-pose.json");
    const lock = read<{ packages: Record<string, LockEntry> }>("package-lock.json");
    for (const name of PACKAGES) {
      const bare = name.split("/")[1];
      expect(pkg.dependencies[name]).toBe(`file:vendor/laugh-tale-island-${bare}-1.0.0.tgz`);
      expect(meta.packages[name]).toBe("1.0.0");
      const entry = lock.packages[`node_modules/${name}`];
      expect(entry.version).toBe("1.0.0");
      expect(entry.resolved).toBe(`file:vendor/laugh-tale-island-${bare}-1.0.0.tgz`);
    }
    const foreign = Object.entries(lock.packages).filter(
      ([key, value]) =>
        key.startsWith("node_modules/") &&
        typeof value.resolved === "string" &&
        !value.resolved.startsWith("https://registry.npmjs.org/") &&
        !value.resolved.startsWith("file:vendor/"),
    );
    expect(foreign).toEqual([]);
    expect(JSON.stringify(lock)).not.toMatch(/"(link|workspace):/);
    expect(meta.recipe).toBe("quiet-wood");
  });

  it("tracks the tarballs but no secret or review file", () => {
    const tracked = execFileSync("/usr/bin/git", ["ls-files", "examples/tokyo"], {
      cwd: resolve(import.meta.dirname, "../.."),
      encoding: "utf8",
    });
    expect(tracked).toMatch(/vendor\/laugh-tale-island-core-1\.0\.0\.tgz/);
    expect(tracked).toMatch(/vendor\/laugh-tale-island-react-1\.0\.0\.tgz/);
    expect(tracked).not.toMatch(/\.env\.local/);
    expect(tracked).not.toMatch(/\.resolve-review\.json/);
  });
});
