import { expect, test } from "vitest";
import { pathToFileURL } from "node:url";
import { join } from "node:path";
import { readFileSync } from "node:fs";
import { repoRoot, type Finding } from "../generation/generated-project-v2-fixture.js";
const {scanPublicationSnapshot}=await import(pathToFileURL(join(repoRoot,"plugins/eternal-pose/lib/publication-analysis.mjs")).href) as {scanPublicationSnapshot:(root:string,files:Map<string,Buffer>,options?:{redactedPaths:Set<string>})=>Promise<Finding[]>};

test("scanner source recognizes its own bounded alphabet predicate without hiding nearby phones or credentials", async () => {
  const source = readFileSync(join(repoRoot, "plugins/eternal-pose/lib/publication-analysis.mjs"), "utf8");
  const scan = (contents: string) => scanPublicationSnapshot("/nonexistent/plugin", new Map([["lib/publication-analysis.mjs", Buffer.from(contents)]]));
  expect((await scan(source)).filter(item => item.severity === "error")).toEqual([]);
  for (const contents of [
    source.replace('alphabet === "0123456789"', 'alphabet === "0123456788"'),
    source.replace('const alphabet = staticLiteralValue(receiver);', 'const alphabet = phone;'),
    source + '\nconst phone = "0912345678";',
    source + '\n// call 0912345678',
  ]) expect((await scan(contents)).map(item => item.code)).toContain("privacy.phone-number");
  expect((await scan(source + '\nconst apiKey = "synthetic-review-credential";')).map(item => item.code)).toContain("credential.generic-secret");
});

test("scans captured bytes without requiring an existing directory", async () => {
  const result = await scanPublicationSnapshot("/nonexistent/captured-project", new Map([
    ["src/unsafe.ts", Buffer.from('export const apiKey = "synthetic-live-secret-value";')],
    [".env.local", Buffer.from("PROVIDER_KEY=synthetic-live-secret-value")],
    ["image.png", Buffer.from([0, 1, 2])],
  ]));
  expect(result.some(item => item.severity === "error" && item.path === "src/unsafe.ts")).toBe(true);
  expect(result.some(item => item.severity === "error" && item.path === ".env.local")).toBe(true);
  expect(result.some(item => item.path === "image.png")).toBe(false);
});

test("redacted content remains distinct from malformed empty JSON and retains filename findings", async () => {
  const files = new Map([".laugh-tale-local-candidates.json", ".laugh-tale-staged-consumer.json", ".env.local", "empty.json"].map(path => [path, Buffer.alloc(0)]));
  const ordinary = await scanPublicationSnapshot("/nonexistent/project", files);
  expect(ordinary.filter(item => item.code === "scan.malformed-code")).toHaveLength(3);
  const findings = await scanPublicationSnapshot("/nonexistent/project", files, { redactedPaths: new Set([".laugh-tale-local-candidates.json", ".laugh-tale-staged-consumer.json", ".env.local"]) });
  expect(findings.filter(item => item.code === "scan.malformed-code").map(item => item.path)).toEqual(["empty.json"]);
  expect(findings.some(item => item.path === ".env.local" && item.severity === "error")).toBe(true);
});

test("completely scans production-sized JavaScript including a credential after 100000 AST nodes", async () => {
  const source = "let value;" + "value=1;".repeat(45_000) + 'const apiKey="synthetic-review-credential";';
  const findings = await scanPublicationSnapshot("/nonexistent/project", new Map([["dist/app.js", Buffer.from(source)]]));
  expect(findings.map(item => item.code)).toContain("credential.generic-secret");
  expect(findings.map(item => item.code)).not.toContain("scan.analysis-limit");
  expect(findings.map(item => item.code)).toContain("artifact.build-output");
});

test("JavaScript above the bounded AST budget still fails closed", async () => {
  const source = "let value;" + "value=1;".repeat(65_000);
  const findings = await scanPublicationSnapshot("/nonexistent/project", new Map([["dist/app.js", Buffer.from(source)]]));
  expect(findings.map(item => item.code)).toContain("scan.analysis-limit");
});

test.each([
  'const digits="0123456789".split("");',
  'const chars=`0123456789abcdefghijklmnopqrstuvwxyz`.split(``);',
  'const isDigit=`0123456789`.indexOf(input[1])!==-1;',
])("recognizes only direct numeric-alphabet receiver operations: %s", async source => {
  const findings = await scanPublicationSnapshot("/nonexistent/project", new Map([["dist/trip.js", Buffer.from(source)]]));
  expect(findings.map(item => item.code)).not.toContain("privacy.phone-number");
});

test.each([
  'const phone="0123456789";',
  'const phone="0123456788".indexOf(input);',
  'const phone="0123456789".split("-");',
  'const phone="0123456789"["indexOf"](input);',
  'const phone="0123456789";phone.indexOf(input);',
  'const digits="0123456789".split("");const phone="0912345678";',
])("retains telephone findings outside exact alphabet operations: %s", async source => {
  const findings = await scanPublicationSnapshot("/nonexistent/project", new Map([["dist/trip.js", Buffer.from(source)]]));
  expect(findings.map(item => item.code)).toContain("privacy.phone-number");
});

test("alphabet suppression does not suppress credential rules on the same line", async () => {
  const source = 'const digits="0123456789".indexOf(input); const apiKey="synthetic-review-credential";';
  const findings = await scanPublicationSnapshot("/nonexistent/project", new Map([["dist/trip.js", Buffer.from(source)]]));
  expect(findings.map(item => item.code)).toContain("credential.generic-secret");
  expect(findings.map(item => item.code)).not.toContain("privacy.phone-number");
});

const digestWithPhoneDigits = `${"a".repeat(20)}0912345678${"b".repeat(34)}`;
const scanJson = (contents: string) => scanPublicationSnapshot("/nonexistent/project", new Map([
  ["src/metadata.json", Buffer.from(contents)],
]));

test("complete sha256 metadata in the real Huninn manifest does not report telephone numbers", async () => {
  const manifest = readFileSync(join(repoRoot, "plugins/eternal-pose/recipes-v2/oak-washi/presentation/assets/HUNINN-SUBSETS.json"));
  const findings = await scanPublicationSnapshot("/nonexistent/project", new Map([
    ["src/presentation/assets/HUNINN-SUBSETS.json", manifest],
  ]));
  expect(findings.map(item => item.code)).not.toContain("privacy.phone-number");
});

test("complete sha256 JSON property suppresses only telephone-shaped digits inside its value", async () => {
  const findings = await scanJson(JSON.stringify({ sha256: digestWithPhoneDigits }));
  expect(findings.map(item => item.code)).not.toContain("privacy.phone-number");
});

test.each([
  ["wrong property", JSON.stringify({ digest: digestWithPhoneDigits })],
  ["short digest", JSON.stringify({ sha256: digestWithPhoneDigits.slice(0, -1) })],
  ["long digest", JSON.stringify({ sha256: `${digestWithPhoneDigits}a` })],
  ["nearby phone", JSON.stringify({ sha256: digestWithPhoneDigits, phone: "0912345678" })],
  ["malformed JSON", `{"sha256":"${digestWithPhoneDigits}",`],
])("keeps telephone findings for %s", async (_label, contents) => {
  const findings = await scanJson(contents);
  expect(findings.map(item => item.code)).toContain("privacy.phone-number");
});

test("sha256 metadata does not suppress credential findings in the same JSON file", async () => {
  const findings = await scanJson(JSON.stringify({ sha256: digestWithPhoneDigits, apiKey: "synthetic-review-credential" }));
  expect(findings.map(item => item.code)).toContain("credential.generic-secret");
  expect(findings.map(item => item.code)).not.toContain("privacy.phone-number");
});

test("analysis-limited JSON cannot establish trusted checksum spans", async () => {
  const findings = await scanJson(JSON.stringify({ sha256: digestWithPhoneDigits, entries: Array(100_001).fill(0) }));
  expect(findings.map(item => item.code)).toContain("scan.analysis-limit");
  expect(findings.map(item => item.code)).toContain("privacy.phone-number");
});

test.each([
  ["same object", `{"sha256":"${digestWithPhoneDigits}","sha256":"not-a-digest"}`],
  ["escaped key", `{"sha256":"${digestWithPhoneDigits}","sha\\u003256":"not-a-digest"}`],
  ["shadowed parent", `{"metadata":{"sha256":"${digestWithPhoneDigits}"},"metadata":{}}`],
])("duplicate JSON properties fail closed for %s", async (_label, contents) => {
  const findings = await scanJson(contents);
  expect(findings.map(item => item.code)).toContain("privacy.phone-number");
});

test("sha256 keys in separate nested objects retain checksum recognition", async () => {
  const findings = await scanJson(JSON.stringify({ first: { sha256: digestWithPhoneDigits }, second: { sha256: digestWithPhoneDigits } }));
  expect(findings.map(item => item.code)).not.toContain("privacy.phone-number");
});

test.each([
  'const digits=("0123456789" as "0912345678").split("");',
  'const digits=("0123456789" as "0912345678").indexOf(input);',
  'const digits=("0123456789" as string).split("");const phone="0912345678";',
])("alphabet spans do not hide phone literals in TypeScript wrappers or adjacent fields: %s", async source => {
  const findings = await scanPublicationSnapshot("/nonexistent/project", new Map([["src/digits.ts", Buffer.from(source)]]));
  expect(findings.map(item => item.code)).toContain("privacy.phone-number");
});
