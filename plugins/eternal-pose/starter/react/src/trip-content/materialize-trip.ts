import { validateTrip, type PlaceIdentity, type PlaceUnresolvedReason, type Trip } from "@laugh-tale-island/core";

type PlaceBinding = { kind: "node" | "candidate"; id: string };
type PlaceOwner = {
  ownerId: string;
  source: string;
  query: Record<string, unknown>;
  bindings: PlaceBinding[];
};

export type TripProjectInputV2 =
  | { schemaVersion: 2; trip: null; setupLocale: string; enrichmentPolicy: null; placeOwners: [] }
  | { schemaVersion: 2; trip: Trip; enrichmentPolicy: unknown; placeOwners: PlaceOwner[] };

type LedgerEntry = {
  ownerId: string;
  source: string;
  query: Record<string, unknown>;
} & (
  | { status: "resolved"; provider: "google"; accepted: { coordinates: { lat: number; lng: number }; providerReference: { provider: string; id: string } } }
  | { status: "unresolved"; reason: PlaceUnresolvedReason }
);

export interface PlaceResolutionLedgerV1 {
  schemaVersion: 1;
  provider: "google";
  entries: LedgerEntry[];
}

function fail(message: string): never { throw new Error(message); }

export function materializeTrip(input: TripProjectInputV2, ledger: PlaceResolutionLedgerV1): Trip | null {
  if (input.schemaVersion !== 2 || ledger.schemaVersion !== 1 || ledger.provider !== "google") fail("invalid input or ledger version");
  if (ledger.entries.length !== input.placeOwners.length) fail("ledger owner coverage mismatch");
  if (input.trip === null) {
    if (input.enrichmentPolicy !== null || input.placeOwners.length !== 0 || !input.setupLocale) fail("invalid no-Trip input");
    return null;
  }

  const trip = structuredClone(input.trip);
  const validation = validateTrip(trip);
  if (validation.errors.length > 0) fail(`invalid authored trip: ${validation.errors[0]?.message}`);
  const nodes = new Map(trip.days.flatMap((day) => day.nodes.map((node) => [node.id, node] as const)));
  const candidates = new Map(trip.candidateGroups.flatMap((group) => group.options.map((option) => [option.id, option] as const)));
  const entries = new Map(ledger.entries.map((entry) => [entry.ownerId, entry] as const));
  if (entries.size !== ledger.entries.length) fail("duplicate ledger owner");
  const seenOwners = new Set<string>();
  const seenBindings = new Set<string>();

  for (const owner of input.placeOwners) {
    if (seenOwners.has(owner.ownerId)) fail("duplicate place owner");
    seenOwners.add(owner.ownerId);
    const entry = entries.get(owner.ownerId);
    if (!entry || entry.source !== owner.source || JSON.stringify(entry.query) !== JSON.stringify(owner.query)) fail("ledger owner source or query drift");
    if (owner.bindings.length === 0) fail("place owner requires a binding");
    if (entry.status === "resolved" && (entry.provider !== "google" || entry.accepted?.providerReference?.provider !== "google")) {
      fail("resolved ledger provider reference must be Google");
    }
    const identity: PlaceIdentity = entry.status === "resolved"
      ? { status: "resolved", coordinates: structuredClone(entry.accepted.coordinates), providerReference: structuredClone(entry.accepted.providerReference) }
      : { status: "unresolved", reason: entry.reason };
    for (const binding of owner.bindings) {
      const key = `${binding.kind}:${binding.id}`;
      if (seenBindings.has(key)) fail("duplicate place binding");
      seenBindings.add(key);
      const target = binding.kind === "node" ? nodes.get(binding.id) : binding.kind === "candidate" ? candidates.get(binding.id) : undefined;
      if (!target?.place) fail(`missing place binding ${key}`);
      target.place.identity = structuredClone(identity);
    }
  }
  if (entries.size !== seenOwners.size) fail("ledger owner coverage mismatch");
  const completedValidation = validateTrip(trip);
  if (completedValidation.errors.length > 0) fail(`invalid materialized trip: ${completedValidation.errors[0]?.message}`);
  return trip;
}
