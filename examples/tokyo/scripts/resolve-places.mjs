#!/usr/bin/env node
/* global fetch, console, process, setTimeout */
// Resolves authored place names to Google Place IDs and coordinates, once.
//
//   node scripts/resolve-places.mjs --probe
//   node scripts/resolve-places.mjs --search
//   node scripts/resolve-places.mjs --search --only "<title>" --query "<refined text>"
//   node scripts/resolve-places.mjs --accept
//
// --search writes candidates to scripts/.resolve-review.json (gitignored). A person
// sets "decision" per title (candidate index, or "unresolved" with a "reason"), then
// --accept writes src/trip-content/resolved-places.json. The key is read from
// .env.local and never logged.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");
const SOURCE = resolve(ROOT, "src/trip-content/source/tokyo-itinerary.json");
const REVIEW = resolve(ROOT, "scripts/.resolve-review.json");
const OUT = resolve(ROOT, "src/trip-content/resolved-places.json");
const ENDPOINT = "https://places.googleapis.com/v1/places:searchText";
const FIELD_MASK = "places.id,places.displayName,places.formattedAddress,places.location,places.types";
// Bias centre only (Tokyo Station); never written into results.
const TOKYO = { latitude: 35.6812, longitude: 139.7671 };
const AIRPORT_TITLES = new Set(["成田國際機場第二航廈", "成田機場第二航廈"]);

function readEnvLocal() {
  const path = resolve(ROOT, ".env.local");
  if (!existsSync(path)) throw new Error(".env.local is missing");
  const entries = Object.fromEntries(
    readFileSync(path, "utf8")
      .split("\n")
      .filter((line) => line.includes("=") && !line.trimStart().startsWith("#"))
      .map((line) => {
        const at = line.indexOf("=");
        return [line.slice(0, at).trim(), line.slice(at + 1).trim()];
      }),
  );
  if (!entries.VITE_GOOGLE_MAPS_API_KEY) throw new Error("VITE_GOOGLE_MAPS_API_KEY is empty");
  return { key: entries.VITE_GOOGLE_MAPS_API_KEY, referer: entries.PLACES_REFERER ?? "" };
}

async function searchText(query, env) {
  const headers = {
    "Content-Type": "application/json",
    "X-Goog-Api-Key": env.key,
    "X-Goog-FieldMask": FIELD_MASK,
  };
  if (env.referer) headers.Referer = env.referer;
  const response = await fetch(ENDPOINT, {
    method: "POST",
    headers,
    body: JSON.stringify({
      textQuery: query,
      languageCode: "zh-TW",
      regionCode: "JP",
      pageSize: 3,
      locationBias: { circle: { center: TOKYO, radius: 30000 } },
    }),
  });
  const body = await response.json();
  if (!response.ok) {
    throw new Error(`${response.status} ${body?.error?.status ?? ""} ${body?.error?.message ?? ""}`.trim());
  }
  return (body.places ?? []).map((place) => ({
    placeId: place.id,
    displayName: place.displayName?.text ?? "",
    formattedAddress: place.formattedAddress ?? "",
    lat: place.location?.latitude,
    lng: place.location?.longitude,
    types: place.types ?? [],
  }));
}

function uniqueTitles() {
  const source = JSON.parse(readFileSync(SOURCE, "utf8"));
  return [...new Set(source.days.flatMap((day) => day.stops.map((stop) => stop.title)))];
}

function haversineKm(lat1, lng1, lat2, lng2) {
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(a));
}

function parseFlags(argv) {
  const value = (flag) => {
    const at = argv.indexOf(flag);
    return at === -1 ? undefined : argv[at + 1];
  };
  return {
    probe: argv.includes("--probe"),
    search: argv.includes("--search"),
    accept: argv.includes("--accept"),
    only: value("--only"),
    query: value("--query"),
  };
}

async function main() {
  const flags = parseFlags(process.argv.slice(2));

  if (flags.probe) {
    const hits = await searchText("東京駅", readEnvLocal());
    console.log(`probe ok: ${hits.length} hit(s); first: ${hits[0]?.displayName ?? "none"}`);
    return;
  }

  if (flags.search) {
    const env = readEnvLocal();
    const review = existsSync(REVIEW) ? JSON.parse(readFileSync(REVIEW, "utf8")) : {};
    const titles = flags.only ? [flags.only] : uniqueTitles().filter((title) => !(title in review));
    for (const title of titles) {
      const queriedAs = flags.only && flags.query ? flags.query : title;
      try {
        review[title] = { queriedAs, candidates: await searchText(queriedAs, env), decision: null };
      } catch (error) {
        review[title] = { queriedAs, candidates: [], decision: null, error: String(error.message) };
      }
      writeFileSync(REVIEW, `${JSON.stringify(review, null, 2)}\n`);
      const entry = review[title];
      console.log(`${title}: ${entry.candidates.length} candidate(s)${entry.error ? ` error: ${entry.error}` : ""}`);
      await new Promise((done) => setTimeout(done, 150));
    }
    return;
  }

  if (flags.accept) {
    const review = JSON.parse(readFileSync(REVIEW, "utf8"));
    const out = {};
    for (const [title, entry] of Object.entries(review)) {
      const decision = entry.decision;
      if (decision === null || decision === undefined) throw new Error(`no decision for ${title}`);
      if (decision === "unresolved") {
        out[title] = { status: "unresolved", reason: entry.reason ?? "no unambiguous match", queriedAs: entry.queriedAs };
        continue;
      }
      const candidate = entry.candidates[decision];
      if (!candidate) throw new Error(`decision ${decision} out of range for ${title}`);
      const km = haversineKm(candidate.lat, candidate.lng, TOKYO.latitude, TOKYO.longitude);
      if (km > 60 && !AIRPORT_TITLES.has(title)) {
        throw new Error(`${title}: candidate ${decision} is ${km.toFixed(1)} km from Tokyo; refusing`);
      }
      out[title] = {
        status: "resolved",
        placeId: candidate.placeId,
        lat: candidate.lat,
        lng: candidate.lng,
        displayName: candidate.displayName,
        formattedAddress: candidate.formattedAddress,
        queriedAs: entry.queriedAs,
      };
    }
    writeFileSync(OUT, `${JSON.stringify(out, null, 2)}\n`);
    const resolvedCount = Object.values(out).filter((record) => record.status === "resolved").length;
    console.log(`wrote resolved-places.json: ${resolvedCount} resolved, ${Object.keys(out).length - resolvedCount} unresolved`);
    return;
  }

  console.error("usage: --probe | --search [--only <title> --query <text>] | --accept");
  process.exitCode = 1;
}

await main();
