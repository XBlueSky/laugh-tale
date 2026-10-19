import { canonicalizeJson, sha256CanonicalJson } from "./canonical-json.mjs";
import { createPortablePlaceResolutionProvenance, createPortablePlaceSearchQuery } from "./portable-enrichment-contract.mjs";
import { parseTripProjectInputV2 } from "./trip-project-input-v2.mjs";

export const PLACE_RESOLUTION_SCHEMA_VERSION = 1;

function fail(message) { throw new Error(message); }
function keys(value, allowed, field) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) fail(`${field} must be an object`);
  for (const key of Object.keys(value)) if (!allowed.includes(key)) fail(`${field}: unknown field ${key}`);
}
function text(value, field) { if (typeof value !== "string" || value.trim() === "") fail(`${field} must be nonblank`); return value; }
function freeze(value) { if (value && typeof value === "object") { for (const child of Object.values(value)) freeze(child); Object.freeze(value); } return value; }

export function unresolvedLedgerForInput(input) {
  const parsed = parseTripProjectInputV2(input);
  return freeze({ schemaVersion: 1, provider: "google", entries: parsed.placeOwners.map(({ ownerId, source, query }) => ({ ownerId, status: "unresolved", source, query, reason: "not-reviewed" })).sort((left, right) => left.ownerId < right.ownerId ? -1 : left.ownerId > right.ownerId ? 1 : 0) });
}

export function parsePlaceResolutionLedger(value, input) {
  const project = parseTripProjectInputV2(input);
  const ledger = JSON.parse(canonicalizeJson(value));
  keys(ledger, ["schemaVersion", "provider", "entries"], "ledger");
  if (ledger.schemaVersion !== 1 || ledger.provider !== "google" || !Array.isArray(ledger.entries)) fail("ledger schemaVersion/provider/entries invalid");
  const owners = new Map(project.placeOwners.map((owner) => [owner.ownerId, owner]));
  if (ledger.entries.length !== owners.size) fail("owner coverage mismatch");
  const seen = new Set();
  for (const entry of ledger.entries) {
    keys(entry, ["ownerId", "status", "source", "query", "provider", "accepted", "observedAt", "reason"], "entry");
    const owner = owners.get(entry.ownerId);
    if (!owner || seen.has(entry.ownerId)) fail("owner coverage mismatch");
    seen.add(entry.ownerId);
    if (entry.source !== owner.source) fail("entry source must match owner");
    keys(entry.query, ["ownerId", "text", "locale", "regionCode", "locationBias", "maxCandidates"], "entry.query");
    if (entry.query.maxCandidates !== 3) fail("query maxCandidates must be 3");
    const normalized = createPortablePlaceSearchQuery(entry.query);
    if (canonicalizeJson(normalized) !== canonicalizeJson(entry.query) || canonicalizeJson(entry.query) !== canonicalizeJson(owner.query)) fail("entry query must match normalized owner query");
    entry.query = normalized;
    if (entry.status === "unresolved") {
      if (Object.hasOwn(entry, "provider") || Object.hasOwn(entry, "accepted")) fail("unresolved entry cannot have accepted/provider");
      if (!["not-reviewed", "no-accepted-candidate", "ambiguous"].includes(entry.reason)) fail("unresolved reason invalid");
      if (entry.reason === "not-reviewed") {
        if (Object.hasOwn(entry, "observedAt")) fail("not-reviewed entry omits observedAt");
      } else {
        if (!Object.hasOwn(entry, "observedAt")) fail("reviewed unresolved entry requires observedAt");
        createPortablePlaceResolutionProvenance({ ownerId: entry.ownerId, source: entry.source, query: entry.query, provider: ledger.provider, observedAt: entry.observedAt });
      }
    } else if (entry.status === "resolved") {
      if (Object.hasOwn(entry, "reason") || entry.provider !== "google") fail("resolved entry provider/reason invalid");
      createPortablePlaceResolutionProvenance({ ownerId: entry.ownerId, source: entry.source, query: entry.query, provider: entry.provider, observedAt: entry.observedAt });
      keys(entry.accepted, ["providerReference", "displayName", "formattedAddress", "coordinates", "categories"], "accepted");
      keys(entry.accepted.providerReference, ["provider", "id"], "accepted.providerReference");
      if (entry.accepted.providerReference.provider !== "google") fail("accepted providerReference must be google");
      text(entry.accepted.providerReference.id, "accepted.providerReference.id");
      text(entry.accepted.displayName, "accepted.displayName"); text(entry.accepted.formattedAddress, "accepted.formattedAddress");
      keys(entry.accepted.coordinates, ["lat", "lng"], "accepted.coordinates");
      const { lat, lng } = entry.accepted.coordinates;
      if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) fail("accepted coordinates invalid");
      if (!Array.isArray(entry.accepted.categories)) fail("accepted.categories must be an array");
      entry.accepted.categories.forEach((category) => text(category, "accepted.category"));
      if (new Set(entry.accepted.categories).size !== entry.accepted.categories.length) fail("accepted.categories must be unique");
      entry.accepted.categories.sort();
    } else fail("entry status invalid");
  }
  ledger.entries.sort((left, right) => left.ownerId < right.ownerId ? -1 : left.ownerId > right.ownerId ? 1 : 0);
  return freeze(ledger);
}

const FAILURE_REASONS = new Set(["missing-configuration", "loader-failed", "request-denied", "not-found", "malformed-response", "implausible-result", "network", "cancelled", "unsupported"]);
function exactKeys(value, allowed, required, field) {
  keys(value, allowed, field);
  for (const key of required) if (!Object.hasOwn(value, key)) fail(`${field}: missing ${key}`);
}
function candidate(value) {
  exactKeys(value, ["providerReference", "displayName", "formattedAddress", "coordinates", "categories"], ["providerReference", "displayName", "formattedAddress", "coordinates", "categories"], "candidate");
  exactKeys(value.providerReference, ["provider", "id"], ["provider", "id"], "candidate.providerReference");
  if (value.providerReference.provider !== "google") fail("candidate provider must be google");
  text(value.providerReference.id, "candidate.providerReference.id");
  text(value.displayName, "candidate.displayName");
  text(value.formattedAddress, "candidate.formattedAddress");
  exactKeys(value.coordinates, ["lat", "lng"], ["lat", "lng"], "candidate.coordinates");
  const { lat, lng } = value.coordinates;
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) fail("candidate coordinates invalid");
  if (!Array.isArray(value.categories) || value.categories.some((item) => typeof item !== "string" || !item.trim()) || new Set(value.categories).size !== value.categories.length) fail("candidate categories invalid");
  value.categories.sort();
  return value;
}

export function parsePlaceReviewArtifact(value, input) {
  const project = parseTripProjectInputV2(input);
  if (project.trip === null || project.enrichmentPolicy === null) fail("review requires a Trip and enrichment policy");
  const review = JSON.parse(canonicalizeJson(value));
  exactKeys(review, ["schemaVersion", "project", "provider", "observedAt", "policy", "entries"], ["schemaVersion", "project", "provider", "observedAt", "policy", "entries"], "review");
  if (review.schemaVersion !== 1 || review.provider !== "google") fail("review schema/provider invalid");
  exactKeys(review.project, ["tripId", "inputHash"], ["tripId", "inputHash"], "review.project");
  if (review.project.tripId !== project.trip.id || review.project.inputHash !== sha256CanonicalJson(project)) fail("review project input hash mismatch");
  if (canonicalizeJson(review.policy) !== canonicalizeJson(project.enrichmentPolicy)) fail("review policy mismatch");
  createPortablePlaceResolutionProvenance({ ownerId: "review", source: "review", query: createPortablePlaceSearchQuery({ ownerId: "review", text: "review", locale: project.trip.locale }), provider: "google", observedAt: review.observedAt });
  if (!Array.isArray(review.entries) || review.entries.length !== project.placeOwners.length) fail("review owner coverage mismatch");
  const owners = new Map(project.placeOwners.map((owner) => [owner.ownerId, owner]));
  const seen = new Set();
  for (const entry of review.entries) {
    exactKeys(entry, ["provenanceSchemaVersion", "ownerId", "source", "query", "result", "unavailableReason", "candidates"], ["provenanceSchemaVersion", "ownerId", "source", "query", "result", "candidates"], "review.entry");
    const owner = owners.get(entry.ownerId);
    if (!owner || seen.has(entry.ownerId)) fail("review owner coverage mismatch");
    seen.add(entry.ownerId);
    if (entry.provenanceSchemaVersion !== 1 || entry.source !== owner.source) fail("review provenance mismatch");
    exactKeys(entry.query, ["ownerId", "text", "locale", "regionCode", "locationBias", "maxCandidates"], ["ownerId", "text", "locale", "maxCandidates"], "review.entry.query");
    if (entry.query.maxCandidates !== 3 || canonicalizeJson(entry.query) !== canonicalizeJson(owner.query)) fail("review query mismatch");
    const query = createPortablePlaceSearchQuery(entry.query);
    if (canonicalizeJson(query) !== canonicalizeJson(entry.query)) fail("review query must be normalized");
    const provenance = createPortablePlaceResolutionProvenance({ ownerId: entry.ownerId, source: entry.source, query, provider: review.provider, observedAt: review.observedAt });
    if (provenance.schemaVersion !== entry.provenanceSchemaVersion || provenance.ownerId !== entry.ownerId) fail("review provenance mismatch");
    if (!Array.isArray(entry.candidates)) fail("review candidates invalid");
    if (entry.result === "unavailable") {
      if (!FAILURE_REASONS.has(entry.unavailableReason) || entry.candidates.length !== 0) fail("review unavailable result invalid");
    } else if (entry.result === "candidates") {
      if (Object.hasOwn(entry, "unavailableReason") || entry.candidates.length > 3) fail("review candidates result invalid");
      const references = new Set();
      for (const item of entry.candidates) {
        candidate(item);
        if (references.has(item.providerReference.id)) fail("duplicate provider reference");
        references.add(item.providerReference.id);
      }
    } else fail("review result invalid");
  }
  for (let index = 1; index < review.entries.length; index++) if (review.entries[index - 1].ownerId >= review.entries[index].ownerId) fail("review entries must be sorted");
  return freeze(review);
}

export function parsePlaceSelection(value, review) {
  const selection = JSON.parse(canonicalizeJson(value));
  exactKeys(selection, ["schemaVersion", "reviewHash", "decisions"], ["schemaVersion", "reviewHash", "decisions"], "selection");
  if (selection.schemaVersion !== 1 || !/^[0-9a-f]{64}$/.test(selection.reviewHash)) fail("selection schemaVersion/reviewHash invalid");
  if (selection.reviewHash !== sha256CanonicalJson(review)) fail("selection reviewHash mismatch");
  if (!Array.isArray(selection.decisions) || selection.decisions.length !== review.entries.length) fail("selection decision coverage mismatch");
  const entries = new Map(review.entries.map((entry) => [entry.ownerId, entry]));
  const seen = new Set();
  for (const decision of selection.decisions) {
    keys(decision, ["ownerId", "status", "providerReference", "reason"], "selection.decision");
    const entry = entries.get(decision.ownerId);
    if (!entry || seen.has(decision.ownerId)) fail("selection decision coverage mismatch");
    seen.add(decision.ownerId);
    if (decision.status === "resolved") {
      exactKeys(decision, ["ownerId", "status", "providerReference"], ["ownerId", "status", "providerReference"], "selection.decision");
      exactKeys(decision.providerReference, ["provider", "id"], ["provider", "id"], "selection.providerReference");
      if (decision.providerReference.provider !== "google" || typeof decision.providerReference.id !== "string" || !decision.providerReference.id.trim()) fail("selection providerReference invalid");
      if (entry.result !== "candidates" || !entry.candidates.some((item) => canonicalizeJson(item.providerReference) === canonicalizeJson(decision.providerReference))) fail("selection providerReference absent from owner candidates");
    } else if (decision.status === "unresolved") {
      exactKeys(decision, ["ownerId", "status", "reason"], ["ownerId", "status", "reason"], "selection.decision");
      if (!["no-accepted-candidate", "ambiguous"].includes(decision.reason)) fail("selection unresolved reason invalid");
    } else fail("selection decision status invalid");
  }
  selection.decisions.sort((left, right) => left.ownerId < right.ownerId ? -1 : left.ownerId > right.ownerId ? 1 : 0);
  return freeze(selection);
}

export function acceptedLedgerFromReview(review, selection, input) {
  const parsedReview = parsePlaceReviewArtifact(review, input);
  const parsedSelection = parsePlaceSelection(selection, parsedReview);
  const decisions = new Map(parsedSelection.decisions.map((decision) => [decision.ownerId, decision]));
  const entries = parsedReview.entries.map((entry) => {
    const provenance = createPortablePlaceResolutionProvenance({
      ownerId: entry.ownerId, source: entry.source, query: entry.query,
      provider: parsedReview.provider, observedAt: parsedReview.observedAt,
    });
    const expected = { schemaVersion: entry.provenanceSchemaVersion, ownerId: entry.ownerId, source: entry.source, query: entry.query, provider: parsedReview.provider, observedAt: parsedReview.observedAt };
    if (canonicalizeJson(provenance) !== canonicalizeJson(expected)) fail("review provenance mismatch");
    const base = { ownerId: provenance.ownerId, source: provenance.source, query: provenance.query, observedAt: provenance.observedAt };
    const decision = decisions.get(entry.ownerId);
    if (decision.status === "unresolved") return { ...base, status: "unresolved", reason: decision.reason };
    const candidate = entry.candidates.find((item) => canonicalizeJson(item.providerReference) === canonicalizeJson(decision.providerReference));
    return { ...base, status: "resolved", provider: provenance.provider, accepted: {
      providerReference: candidate.providerReference,
      displayName: candidate.displayName,
      formattedAddress: candidate.formattedAddress,
      coordinates: candidate.coordinates,
      categories: candidate.categories,
    } };
  });
  return parsePlaceResolutionLedger({ schemaVersion: 1, provider: "google", entries }, input);
}
