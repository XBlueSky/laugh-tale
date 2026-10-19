import type { PlaceProviderResult, PlaceRequestV2 } from "@laugh-tale-island/core";
import type { PlaceAdapterV2 } from "@laugh-tale-island/core/browser";
import { cloneTestValue } from "./FakeRouteAdapterV2.js";

export type FakePlaceResolverV2 = (
  request: PlaceRequestV2,
  attempt: number,
) => PlaceProviderResult | Promise<PlaceProviderResult>;

type PlaceFixtures = Readonly<Record<string, PlaceProviderResult>>;

function snapshotFixtures(fixtures: PlaceFixtures): PlaceFixtures {
  const snapshot: Record<string, PlaceProviderResult> = Object.create(null) as Record<string, PlaceProviderResult>;
  for (const key of Object.keys(fixtures)) snapshot[key] = cloneTestValue(fixtures[key]);
  return snapshot;
}

function snapshotSource(source: FakePlaceResolverV2 | PlaceFixtures): FakePlaceResolverV2 | PlaceFixtures {
  return typeof source === "function" ? source : snapshotFixtures(source);
}

function diagnostic(error: unknown): string {
  try {
    if (error instanceof Error && typeof error.message === "string" && error.message.trim()) return error.message.trim();
  } catch {
    // A hostile thrown value falls through to the deterministic diagnostic.
  }
  return "Synthetic resolver failed";
}

function cancelled(): PlaceProviderResult {
  return { status: "unavailable", reason: "cancelled", retryable: false };
}

function network(error: unknown): PlaceProviderResult {
  return { status: "unavailable", reason: "network", retryable: true, diagnostic: diagnostic(error) };
}

function requestKey(request: PlaceRequestV2): string {
  try {
    return typeof request.providerReference.id === "string" ? request.providerReference.id : "";
  } catch {
    return "";
  }
}

export class FakePlaceAdapterV2 implements PlaceAdapterV2 {
  readonly testOnly = true as const;
  readonly calls: PlaceRequestV2[] = [];
  readonly resolverInputs: PlaceRequestV2[] = [];
  readonly attempts: number[] = [];
  private readonly attemptsByKey = new Map<string, number>();
  private source: FakePlaceResolverV2 | PlaceFixtures;

  constructor(source: FakePlaceResolverV2 | PlaceFixtures = Object.freeze({})) {
    this.source = snapshotSource(source);
  }

  setResolver(source: FakePlaceResolverV2 | PlaceFixtures): void {
    this.source = snapshotSource(source);
  }

  load(request: PlaceRequestV2, signal: AbortSignal): Promise<PlaceProviderResult> {
    let callSnapshot: PlaceRequestV2;
    try {
      callSnapshot = cloneTestValue(request);
      this.calls.push(callSnapshot);
    } catch (error) {
      return Promise.resolve(network(error));
    }
    if (!(signal instanceof AbortSignal) || signal.aborted) return Promise.resolve(cancelled());

    const key = requestKey(callSnapshot);
    const ownerKey = typeof callSnapshot.ownerId === "string" ? callSnapshot.ownerId : "";
    const attempt = (this.attemptsByKey.get(ownerKey) ?? 0) + 1;
    this.attemptsByKey.set(ownerKey, attempt);
    this.attempts.push(attempt);
    const resolverInput = cloneTestValue(callSnapshot);
    this.resolverInputs.push(cloneTestValue(resolverInput));

    let outcome: Promise<PlaceProviderResult>;
    try {
      const value = typeof this.source === "function"
        ? this.source(resolverInput, attempt)
        : Object.hasOwn(this.source, key)
          ? cloneTestValue(this.source[key])
          : { status: "unavailable", reason: "not-found", retryable: false } as const;
      let then: unknown;
      try {
        then = value !== null && (typeof value === "object" || typeof value === "function")
          ? (value as { then?: unknown }).then
          : undefined;
      } catch (error) {
        outcome = Promise.resolve(network(error));
        return this.settle(outcome, signal);
      }
      outcome = typeof then === "function"
        ? Promise.resolve(value).then(cloneTestValue, network)
        : Promise.resolve(cloneTestValue(value));
    } catch (error) {
      outcome = Promise.resolve(network(error));
    }

    return this.settle(outcome, signal);
  }

  private settle(outcome: Promise<PlaceProviderResult>, signal: AbortSignal): Promise<PlaceProviderResult> {
    return new Promise((resolve) => {
      let settled = false;
      const finish = (value: PlaceProviderResult): void => {
        if (settled) return;
        settled = true;
        signal.removeEventListener("abort", onAbort);
        resolve(cloneTestValue(value));
      };
      const onAbort = (): void => finish(cancelled());
      signal.addEventListener("abort", onAbort, { once: true });
      if (signal.aborted) onAbort();
      void outcome.then(finish, (error) => finish(network(error)));
    });
  }
}
