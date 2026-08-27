import { globSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const packageRoot = fileURLToPath(new URL("..", import.meta.url));

describe("package boundaries", () => {
  it("keeps React, Google, and CSS out of all package sources", () => {
    for (const file of globSync(join(packageRoot, "src/**/*.ts"))) {
      const source = readFileSync(file, "utf8");
      expect(source, file).not.toMatch(/from "react"|google\.maps|@googlemaps|\.css"/);
    }
  });

  it("keeps web-platform types out of the root entry modules", () => {
    for (const file of globSync(join(packageRoot, "src/*.ts"))) {
      const source = readFileSync(file, "utf8");
      expect(source, file).not.toMatch(
        /\bHTMLElement\b|\bAbortSignal\b|\blocalStorage\b|\bwindow\b|\bdocument\b|\bnavigator\b/,
      );
    }
  });

  it("keeps visible display strings out of the root entry modules", () => {
    for (const file of globSync(join(packageRoot, "src/*.ts"))) {
      const source = readFileSync(file, "utf8");
      expect(source, file).not.toMatch(/[一-鿿]/);
    }
  });
});
