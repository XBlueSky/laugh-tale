// Run after consumer sync, against an already running canonical Oak fixture:
// OAK_FONT_DELIVERY_URL=http://127.0.0.1:4176 node tests/scripts/oak-washi-font-delivery.browser.mjs
/* global document, requestAnimationFrame */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { chromium } from "@playwright/test";

const manifest = JSON.parse(readFileSync("plugins/eternal-pose/recipes-v2/oak-washi/presentation/assets/HUNINN-SUBSETS.json", "utf8"));
const browser = await chromium.launch({ headless: true });
try {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: "block" });
  const page = await context.newPage();
  const requests = [];
  page.on("request", request => { if (/huninn-regular.*\.woff2/.test(request.url())) requests.push(request.url()); });
  await page.goto(`${process.env.OAK_FONT_DELIVERY_URL ?? "http://127.0.0.1:4176"}/?case=home&variant=zero-mobile`, { waitUntil: "networkidle" });
  await page.locator(".oak-home").waitFor();
  await page.evaluate(() => document.fonts.ready);
  assert(requests.length > 0, "Home must request local Huninn subsets");
  assert(!requests.some(url => new URL(url).pathname.endsWith("/huninn-regular.woff2")), "Home must not request the full archive");
  const requested = manifest.subsets.filter(subset => requests.some(url => url.includes(subset.file.replace(/\.woff2$/, ""))));
  assert.equal(new Set(requests).size, requested.length, "Every Huninn request must match a local manifested subset");
  const bytes = requested.reduce((total, subset) => total + subset.bytes, 0);
  assert(bytes < manifest.source.bytes, "Ordinary Home must download less than the full font");

  // Inspect Chromium's actual painted fonts for separate Chinese/Latin samples.
  // A computed CSS family alone would pass while a fallback rendered the text.
  await page.evaluate(async () => {
    for (const [id, character] of [["oak-font-chinese", "台"], ["oak-font-latin", "A"]]) {
      const sample = document.createElement("span");
      sample.id = id;
      sample.style.cssText = 'font: 32px "Oak Huninn", monospace; position: fixed; top: 0; left: 0;';
      sample.textContent = character;
      document.body.append(sample);
      await document.fonts.load('32px "Oak Huninn"', character);
    }
    await new Promise(resolve => requestAnimationFrame(resolve));
  });
  const cdp = await context.newCDPSession(page);
  await cdp.send("DOM.enable");
  await cdp.send("CSS.enable");
  const { root } = await cdp.send("DOM.getDocument");
  const rendering = [];
  for (const [id, character] of [["oak-font-chinese", "台"], ["oak-font-latin", "A"]]) {
    const { nodeId } = await cdp.send("DOM.querySelector", { nodeId: root.nodeId, selector: `#${id}` });
    const { fonts } = await cdp.send("CSS.getPlatformFontsForNode", { nodeId });
    assert(fonts.some(font => font.isCustomFont && font.postScriptName === "Huninn-Regular" && font.glyphCount > 0), `${character} must actually paint with the pinned Huninn font`);
    assert(fonts.every(font => font.isCustomFont && font.postScriptName === "Huninn-Regular"), `${character} must not use a fallback font`);
    const point = character.codePointAt(0);
    const subset = manifest.subsets.find(entry => entry.unicodeRange.split(",").some(range => {
      const [start, end = start] = range.trim().slice(2).split("-").map(value => Number.parseInt(value, 16));
      return point >= start && point <= end;
    }));
    assert(subset && requests.some(url => url.includes(subset.file.replace(/\.woff2$/, ""))), `${character} must fetch its covering subset`);
    rendering.push({ character, subset: subset.file, fonts });
  }
  console.log(JSON.stringify({ homeSubsets: requested.length, homeFontBytes: bytes, fullFontBytes: manifest.source.bytes, rendering }, null, 2));
  await context.close();
} finally {
  await browser.close();
}
