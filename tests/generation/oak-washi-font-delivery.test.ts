import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "vitest";

const root = process.cwd();
const assets = join(root, "plugins/eternal-pose/recipes-v2/oak-washi/presentation/assets");

describe("Oak Huninn delivery", () => {
  test("coalesces adjacent high-frequency public ranges into two delivery bands while keeping Latin separate", () => {
    const result = spawnSync("python3", ["-c", [
      "import json,sys",
      "from pathlib import Path",
      "from fontTools.ttLib import TTFont",
      "assets=Path(sys.argv[1])",
      "fonts=[(entry['file'],TTFont(assets/entry['file']).getBestCmap()) for entry in json.loads((assets/'HUNINN-SUBSETS.json').read_text())['subsets']]",
      "print(json.dumps({character:[file for file,cmap in fonts if ord(character) in cmap] for character in '丑井串三人A'}))",
    ].join("\n"), assets], { cwd: root, encoding: "utf8" });
    expect(result.status, result.stderr).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual({
      丑: ["huninn-regular-tier-090-097.woff2"],
      井: ["huninn-regular-tier-090-097.woff2"],
      串: ["huninn-regular-tier-098-110.woff2"],
      三: ["huninn-regular-tier-098-110.woff2"],
      人: ["huninn-regular-tier-098-110.woff2"],
      A: ["huninn-regular-shaping.woff2"],
    });
  });

  test("keeps every Latin/combining character together and preserves original cross-partition kerning", () => {
    const result = spawnSync("python3", ["-c", [
      "import json,sys,unicodedata",
      "from pathlib import Path",
      "from fontTools.ttLib import TTFont",
      "from fontTools.unicodedata import script",
      "assets=Path(sys.argv[1])",
      "source=TTFont(assets/'huninn-regular.woff2')",
      "required={cp for cp in source.getBestCmap() if script(chr(cp))=='Latn' or unicodedata.category(chr(cp)).startswith('M')}",
      "fonts=[TTFont(assets/e['file']) for e in json.loads((assets/'HUNINN-SUBSETS.json').read_text())['subsets']]",
      "font=next((f for f in fonts if required <= set(f.getBestCmap())),None)",
      "def kern(font,a,b):",
      "    first,second=font.getBestCmap()[ord(a)],font.getBestCmap()[ord(b)]",
      "    result=0",
      "    for table in font['GPOS'].table.LookupList.Lookup[0].SubTable:",
      "        if first not in table.Coverage.glyphs: continue",
      "        if table.Format==1:",
      "            records=table.PairSet[table.Coverage.glyphs.index(first)].PairValueRecord",
      "            record=next((r for r in records if r.SecondGlyph==second),None)",
      "        else:",
      "            record=table.Class1Record[table.ClassDef1.classDefs.get(first,0)].Class2Record[table.ClassDef2.classDefs.get(second,0)]",
      "        result+=getattr(getattr(record,'Value1',None),'XAdvance',0)",
      "    return result",
      "print(json.dumps(None if font is None else [kern(font,'T','ō'),kern(font,'T','ā'),kern(font,'V','ā')]))",
    ].join("\n"), assets], { cwd: root, encoding: "utf8" });
    expect(result.status, result.stderr).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual([-63, -78, -54]);
  });

  test("keeps source timestamps so identical subset builds can reproduce the same bytes", () => {
    const result = spawnSync("python3", ["-c", [
      "import json,sys",
      "from pathlib import Path",
      "from fontTools.ttLib import TTFont",
      "assets=Path(sys.argv[1])",
      "source=TTFont(assets/'huninn-regular.woff2')['head']",
      "changed=[]",
      "for file in assets.glob('huninn-regular-*.woff2'):",
      "    head=TTFont(file)['head']",
      "    if (head.created,head.modified)!=(source.created,source.modified): changed.append(file.name)",
      "print(json.dumps(changed))",
    ].join("\n"), assets], { cwd: root, encoding: "utf8" });
    expect(result.status, result.stderr).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual([]);
  });

  test("rejects a platform-specific cmap change even when asset hashes are updated", () => {
    const directory = mkdtempSync(join(tmpdir(), "oak-font-cmap-"));
    const copiedAssets = join(directory, "assets");
    try {
      cpSync(assets, copiedAssets, { recursive: true });
      mkdirSync(join(directory, "styles"));
      cpSync(join(assets, "../styles/fonts.css"), join(directory, "styles/fonts.css"));
      const mutation = spawnSync("python3", ["-c", [
        "import hashlib,json,sys",
        "from pathlib import Path",
        "from fontTools.ttLib import TTFont",
        "assets=Path(sys.argv[1])",
        'file=assets/"huninn-regular-remainder-000.woff2"',
        "font=TTFont(file,recalcTimestamp=False)",
        "table=next(t for t in font['cmap'].tables if t.platformID==0)",
        "table.cmap=dict(table.cmap)",
        "point=min(table.cmap)",
        "table.cmap[point]=next(value for value in table.cmap.values() if value!=table.cmap[point])",
        "font.save(file)",
        'path=assets/"HUNINN-SUBSETS.json"',
        "record=json.loads(path.read_text())",
        "entry=next(s for s in record['subsets'] if s['file']==file.name)",
        "entry['sha256']=hashlib.sha256(file.read_bytes()).hexdigest()",
        "entry['bytes']=file.stat().st_size",
        "record['runtimeBytes']=sum(s['bytes'] for s in record['subsets'])",
        "path.write_text(json.dumps(record,indent=2)+'\\n')",
      ].join("\n"), copiedAssets], { cwd: root, encoding: "utf8" });
      expect(mutation.status, mutation.stderr).toBe(0);
      const result = spawnSync("python3", ["scripts/build-oak-huninn-subsets.py", "--check", "--assets", copiedAssets], { cwd: root, encoding: "utf8" });
      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain("changed Unicode subtable");
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  }, 60_000);

  test("validates complete cmap, retained glyph geometry, hints and metrics against the pinned font", () => {
    const result = spawnSync("python3", ["scripts/build-oak-huninn-subsets.py", "--check"], { cwd: root, encoding: "utf8" });
    expect(result.status, result.stderr || result.stdout).toBe(0);
    const report = JSON.parse(result.stdout) as { codepoints: number; glyphsVerified: number; subsets: number; runtimeBytes: number };
    expect(report.codepoints).toBe(11_364);
    expect(report.glyphsVerified).toBeGreaterThanOrEqual(11_364);
    expect(report.subsets).toBeGreaterThan(1);
    expect(report.runtimeBytes).toBeLessThan(2_900_000);
  }, 60_000);

  test("provides local selective font faces for common Chinese and Latin without the full archive", () => {
    const cssPath = join(assets, "../styles/fonts.css");
    expect(existsSync(cssPath), "font delivery stylesheet exists").toBe(true);
    if (!existsSync(cssPath)) return;
    const css = readFileSync(cssPath, "utf8");
    const faces = [...css.matchAll(/@font-face\s*\{([^}]+)\}/g)].map(([, body]) => {
      const file = body.match(/url\("\.\.\/assets\/([^"/]+)"\)/)?.[1];
      const ranges = body.match(/unicode-range:\s*([^;]+);/)?.[1];
      expect(file).toBeDefined();
      expect(ranges).toBeDefined();
      expect(body).toMatch(/font-display:\s*swap;/);
      return { file: file!, ranges: ranges!.split(",").map((range) => range.trim().slice(2).split("-").map((value) => Number.parseInt(value, 16))) };
    });
    expect(faces.length).toBeGreaterThan(1);
    expect(css).not.toContain("huninn-regular.woff2");
    const matching = (codepoint: number) => faces.filter((face) => face.ranges.some(([start, end = start]) => codepoint >= start && codepoint <= end));
    const selected = new Set<string>();
    // Generic samples; intentionally unrelated to trip content or copy catalogs.
    for (const character of "ABC123台灣旅行") {
      const matches = matching(character.codePointAt(0)!);
      expect(matches, character).toHaveLength(1);
      expect(existsSync(join(assets, matches[0].file))).toBe(true);
      selected.add(matches[0].file);
    }
    expect([...selected].reduce((sum, file) => sum + readFileSync(join(assets, file)).byteLength, 0)).toBeLessThan(400_000);
    expect(matching(0x1f600)).toHaveLength(0);
  });
});
