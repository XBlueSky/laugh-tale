import type { RouteProviderResult, RouteRequestV2 } from "@laugh-tale-island/core";
import type { RouteAdapterV2 } from "@laugh-tale-island/core/browser";

export type FakeRouteResolverV2 = (
  request: RouteRequestV2,
  attempt: number,
) => RouteProviderResult | Promise<RouteProviderResult>;

type RouteFixtures = Readonly<Record<string, RouteProviderResult>>;

export function cloneTestValue<T>(value: T): T {
  return structuredClone(value);
}

function snapshotFixtures(fixtures: RouteFixtures): RouteFixtures {
  const snapshot: Record<string, RouteProviderResult> = Object.create(null) as Record<string, RouteProviderResult>;
  for (const key of Object.keys(fixtures)) snapshot[key] = cloneTestValue(fixtures[key]);
  return snapshot;
}

function snapshotSource(source: FakeRouteResolverV2 | RouteFixtures): FakeRouteResolverV2 | RouteFixtures {
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

export function cancelledResult(): RouteProviderResult {
  return { status: "unavailable", reason: "cancelled", retryable: false };
}

function networkResult(error: unknown): RouteProviderResult {
  return { status: "unavailable", reason: "network", retryable: true, diagnostic: diagnostic(error) };
}

function requestKey(request: RouteRequestV2): string {
  try {
    return typeof request.edge.id === "string" ? request.edge.id : "";
  } catch {
    return "";
  }
}

export class FakeRouteAdapterV2 implements RouteAdapterV2 {
  readonly testOnly = true as const;
  readonly calls: RouteRequestV2[] = [];
  readonly resolverInputs: RouteRequestV2[] = [];
  readonly attempts: number[] = [];
  private readonly attemptsByKey = new Map<string, number>();
  private source: FakeRouteResolverV2 | RouteFixtures;

  constructor(source: FakeRouteResolverV2 | RouteFixtures = Object.freeze({})) {
    this.source = snapshotSource(source);
  }

  setResolver(source: FakeRouteResolverV2 | RouteFixtures): void {
    this.source = snapshotSource(source);
  }

  load(request: RouteRequestV2, signal: AbortSignal): Promise<RouteProviderResult> {
    let callSnapshot: RouteRequestV2;
    try {
      callSnapshot = cloneTestValue(request);
      this.calls.push(callSnapshot);
    } catch (error) {
      return Promise.resolve(networkResult(error));
    }
    if (!(signal instanceof AbortSignal) || signal.aborted) return Promise.resolve(cancelledResult());

    const key = requestKey(callSnapshot);
    const attempt = (this.attemptsByKey.get(key) ?? 0) + 1;
    this.attemptsByKey.set(key, attempt);
    this.attempts.push(attempt);
    const resolverInput = cloneTestValue(callSnapshot);
    this.resolverInputs.push(cloneTestValue(resolverInput));

    let outcome: Promise<RouteProviderResult>;
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
        outcome = Promise.resolve(networkResult(error));
        return this.settle(outcome, signal);
      }
      outcome = typeof then === "function"
        ? Promise.resolve(value).then(cloneTestValue, networkResult)
        : Promise.resolve(cloneTestValue(value));
    } catch (error) {
      outcome = Promise.resolve(networkResult(error));
    }

    return this.settle(outcome, signal);
  }

  private settle(outcome: Promise<RouteProviderResult>, signal: AbortSignal): Promise<RouteProviderResult> {
    return new Promise((resolve) => {
      let settled = false;
      const finish = (value: RouteProviderResult): void => {
        if (settled) return;
        settled = true;
        signal.removeEventListener("abort", onAbort);
        resolve(cloneTestValue(value));
      };
      const onAbort = (): void => finish(cancelledResult());
      signal.addEventListener("abort", onAbort, { once: true });
      if (signal.aborted) onAbort();
      void outcome.then(finish, (error) => finish(networkResult(error)));
    });
  }
}
