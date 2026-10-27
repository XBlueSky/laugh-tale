#!/usr/bin/env node
/* global console, process */
// Compares committed resolved places with the read-only benchmark by distance only.
//   TOKYO_ORACLE_ROOT=/Users/bluesky/arsenal/tokyo-trip-map node scripts/oracle-check.mjs
// Prints a Markdown table. Benchmark coordinates are never printed.
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");
const resolved = JSON.parse(readFileSync(resolve(ROOT, "src/trip-content/resolved-places.json"), "utf8"));
const oracleRoot = process.env.TOKYO_ORACLE_ROOT;
if (!oracleRoot) throw new Error("TOKYO_ORACLE_ROOT is required");
const dataDir = resolve(oracleRoot, "app/data/tokyo-trip");

function benchmarkStops() {
  const stops = [];
  for (const file of readdirSync(dataDir).filter((name) => /^day-\d+\.ts$/.test(name))) {
    const text = readFileSync(resolve(dataDir, file), "utf8");
    for (const block of text.split(/\n\s{4}\{\n\s{6}id:/).slice(1)) {
      const title = block.match(/\n\s{6}title:\s*"([^"]+)"/)?.[1];
      const location = block.match(/\n\s{6}location:\s*"([^"]+)"/)?.[1];
      const coords = block.match(/\n\s{6}coordinates:\s*at\(\s*([\d.]+),\s*([\d.]+)\s*\)/);
      if (title && coords) {
        stops.push({
          label: location ? `${title} (${location})` : title,
          lat: Number(coords[1]),
          lng: Number(coords[2]),
        });
      }
    }
  }
  return stops;
}

function metres(lat1, lng1, lat2, lng2) {
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * 6371000 * Math.asin(Math.sqrt(a)));
}

const stops = benchmarkStops();
if (stops.length === 0) throw new Error(`no benchmark stops parsed from ${dataDir}`);
const rows = [];
const tally = { match: 0, near: 0, mismatch: 0, "no oracle": 0, unresolved: 0 };
for (const [title, record] of Object.entries(resolved)) {
  if (record.status !== "resolved") {
    rows.push([title, "—", "—", "unresolved"]);
    tally.unresolved += 1;
    continue;
  }
  let best = null;
  for (const stop of stops) {
    const d = metres(record.lat, record.lng, stop.lat, stop.lng);
    if (best === null || d < best.d) best = { d, label: stop.label };
  }
  const verdict = best.d > 2000 ? "no oracle" : best.d <= 100 ? "match" : best.d <= 500 ? "near" : "mismatch";
  tally[verdict] += 1;
  rows.push([
    title,
    verdict === "no oracle" ? "—" : best.label,
    verdict === "no oracle" ? "—" : String(best.d),
    verdict,
  ]);
}
console.log("| authored title | nearest benchmark stop | distance m | verdict |");
console.log("| --- | --- | --- | --- |");
for (const row of rows) console.log(`| ${row.join(" | ")} |`);
console.log();
console.log(
  `Totals: ${Object.entries(tally)
    .map(([k, v]) => `${k} ${v}`)
    .join(", ")} (benchmark stops parsed: ${stops.length})`,
);
