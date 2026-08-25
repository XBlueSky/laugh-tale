import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { afterEach, describe, expect, test } from "vitest";

interface PublicationFinding {
  severity: "error" | "warning";
  code: string;
  path: string;
  message: string;
}

type ScanPublication = (rootDir: string) => Promise<PublicationFinding[]>;

const repoRoot = fileURLToPath(new URL("../..", import.meta.url));
const publicationModuleUrl = pathToFileURL(join(repoRoot, "plugins/eternal-pose/lib/publication-scan.mjs")).href;
const { scanPublication } = (await import(publicationModuleUrl)) as { scanPublication: ScanPublication };
const scanScript = join(repoRoot, "plugins/eternal-pose/scripts/scan-publication.mjs");
const validateScript = join(repoRoot, "plugins/eternal-pose/scripts/validate-trip-project.mjs");
const temporaryRoots: string[] = [];

function createTemporaryRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "eternal-pose-publication-"));
  temporaryRoots.push(root);
  return root;
}

function writeFixture(root: string, relativePath: string, contents: string | Uint8Array): void {
  const target = join(root, relativePath);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, contents);
}

function findingCodes(findings: PublicationFinding[]): string[] {
  return findings.map((finding) => finding.code);
}

function findingAt(findings: PublicationFinding[], path: string, code?: string): boolean {
  return findings.some((finding) => finding.path === path && (code === undefined || finding.code === code));
}

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("publication safety findings", () => {
  test("reports credential, privacy, artifact, and public-access risks with stable safe findings", async () => {
    const root = createTemporaryRoot();
    const googleKey = ["AI", "za", "G".repeat(35)].join("");
    const bearerToken = ["Bearer", " ", "tok_", "B".repeat(30)].join("");
    const bookingReference = ["Booking reference: ", "LT", "7Q", "9X2"].join("");
    const phoneNumber = ["+886", " 9", "12 345 678"].join("");
    const emailAddress = ["traveler", "@", "example", ".invalid"].join("");
    const envToken = ["PRIVATE_TOKEN=", "secret_", "E".repeat(28)].join("");
    const sensitiveValues = [googleKey, bearerToken, bookingReference, phoneNumber, emailAddress, envToken];

    writeFixture(root, "src/private-config.txt", [googleKey, bearerToken, bookingReference, phoneNumber].join("\n"));
    writeFixture(root, ".env.local", `${envToken}\n`);
    writeFixture(root, ".env.example", "GOOGLE_MAPS_API_KEY=\n# Add a local value; never commit it.\n");
    writeFixture(root, "tickets/boarding-pass-qr.png", Buffer.from([0, 1, 2, 3, 255]));
    writeFixture(root, "mail/travel-confirmation.eml", `From: ${emailAddress}\n`);
    writeFixture(root, "documents/passport-scan.pdf", Buffer.from([37, 80, 68, 70, 0, 1]));
    writeFixture(root, "dist/assets/app.js.map", "{}\n");
    writeFixture(root, "vercel.json", '{"public":true}\n');

    const findings = await scanPublication(root);
    const codes = findingCodes(findings);

    expect(codes).toContain("credential.google-api-key");
    expect(codes).toContain("credential.bearer-token");
    expect(codes).toContain("credential.env-file");
    expect(codes).toContain("privacy.booking-reference");
    expect(codes).toContain("privacy.phone-number");
    expect(codes).toContain("privacy.qr-artifact");
    expect(codes).toContain("privacy.raw-email");
    expect(codes).toContain("privacy.private-document");
    expect(codes).toContain("artifact.source-map");
    expect(codes).toContain("artifact.build-output");
    expect(codes).toContain("access.public-configuration");
    expect(findings.some((finding) => finding.path === ".env.example")).toBe(false);
    expect(findings.every((finding) => ["error", "warning"].includes(finding.severity))).toBe(true);
    expect(findings.every((finding) => Object.keys(finding).sort().join(",") === "code,message,path,severity")).toBe(true);
    expect(sensitiveValues.some((value) => JSON.stringify(findings).includes(value))).toBe(false);
  });

  test("does not confuse a booking status field with a booking reference", async () => {
    const root = createTemporaryRoot();
    writeFixture(root, "trip-content.md", "booking: confirmed or pending\n");

    const findings = await scanPublication(root);

    expect(findingAt(findings, "trip-content.md", "privacy.booking-reference")).toBe(false);
  });

  test("caps text reads, skips binary bodies, and still inspects sensitive filenames", async () => {
    const root = createTemporaryRoot();
    const googleKey = ["AI", "za", "K".repeat(35)].join("");
    writeFixture(root, "binary.dat", Buffer.concat([Buffer.from([0]), Buffer.from(googleKey)]));
    writeFixture(root, "oversized.txt", `${"x".repeat(2 * 1024 * 1024)}${googleKey}\n`);
    writeFixture(root, "private/ticket-qr.bin", Buffer.from([0, 8, 9]));

    const findings = await scanPublication(root);

    expect(findingAt(findings, "binary.dat", "credential.google-api-key")).toBe(false);
    expect(findingAt(findings, "oversized.txt", "credential.google-api-key")).toBe(false);
    expect(findingAt(findings, "private/ticket-qr.bin", "privacy.qr-artifact")).toBe(true);
  });
});

describe("publication inventory", () => {
  test("honors root gitignore entries outside a Git repository", async () => {
    const root = createTemporaryRoot();
    const ignoredKey = ["AI", "za", "I".repeat(35)].join("");
    writeFixture(root, ".gitignore", ".env.local\nignored/\n");
    writeFixture(root, ".env.local", `GOOGLE_MAPS_API_KEY=${ignoredKey}\n`);
    writeFixture(root, "ignored/config.txt", ignoredKey);
    writeFixture(root, ".env.production", "PUBLIC_DEPLOYMENT=true\n");

    const findings = await scanPublication(root);

    expect(findings.some((finding) => finding.path === ".env.local")).toBe(false);
    expect(findings.some((finding) => finding.path.startsWith("ignored/"))).toBe(false);
    expect(findingAt(findings, ".env.production", "credential.env-file")).toBe(true);
  });

  test("uses Git index and ignore semantics so ignored local secrets do not block but tracked ones fail closed", async () => {
    const root = createTemporaryRoot();
    const ignoredKey = ["AI", "za", "L".repeat(35)].join("");
    writeFixture(root, ".gitignore", ".env.local\n");
    writeFixture(root, ".env.local", `GOOGLE_MAPS_API_KEY=${ignoredKey}\n`);
    writeFixture(root, "README.md", "safe\n");
    execFileSync("git", ["init", "-q", root]);

    const ignoredFindings = await scanPublication(root);
    expect(ignoredFindings.some((finding) => finding.path === ".env.local")).toBe(false);

    execFileSync("git", ["-C", root, "add", "-f", ".env.local"]);
    const trackedFindings = await scanPublication(root);
    expect(findingAt(trackedFindings, ".env.local", "credential.env-file")).toBe(true);
    expect(findingAt(trackedFindings, ".env.local", "credential.google-api-key")).toBe(true);
    expect(JSON.stringify(trackedFindings).includes(ignoredKey)).toBe(false);
  });
});

describe("publication CLIs", () => {
  test("scan CLI prints JSON counts and exits one only when errors exist", () => {
    const cleanRoot = createTemporaryRoot();
    writeFixture(cleanRoot, "README.md", "safe\n");
    const clean = spawnSync(process.execPath, [scanScript, cleanRoot], { encoding: "utf8" });
    const cleanPayload = JSON.parse(clean.stdout) as { counts: { errors: number; warnings: number } };

    expect(clean.status).toBe(0);
    expect(cleanPayload.counts).toEqual({ errors: 0, warnings: 0 });

    const unsafeRoot = createTemporaryRoot();
    writeFixture(unsafeRoot, ".env.local", "PRIVATE_TOKEN=set-at-runtime\n");
    const unsafe = spawnSync(process.execPath, [scanScript, unsafeRoot], { encoding: "utf8" });
    const unsafePayload = JSON.parse(unsafe.stdout) as { counts: { errors: number; warnings: number } };

    expect(unsafe.status).toBe(1);
    expect(unsafePayload.counts.errors).toBeGreaterThan(0);
  });

  test("validation CLI exits nonzero when generated-project files and scripts are missing", () => {
    const root = createTemporaryRoot();
    writeFixture(root, "README.md", "incomplete\n");

    const result = spawnSync(process.execPath, [validateScript, root], { encoding: "utf8" });
    const payload = JSON.parse(result.stdout) as { findings: PublicationFinding[] };

    expect(result.status).toBe(1);
    expect(findingCodes(payload.findings)).toContain("project.missing-file");
  });
});
