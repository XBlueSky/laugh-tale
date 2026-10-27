import type { PlaceRequestV2, RouteRequestV2 } from "@laugh-tale-island/core";
import type { MarkerContentFactory, UserLocationContentFactory } from "@laugh-tale-island/core/browser";
import {
  GoogleMapAdapter,
  GooglePlaceAdapter,
  GoogleRouteAdapter,
} from "@laugh-tale-island/adapters/google";
import { vi } from "vitest";

import {
  defineMapAdapterV2Contract,
} from "../src/contracts/map-adapter-v2.js";
import { createRuntime, createContractHost } from "./fixtures/google-map-runtime.js";
import { definePlaceAdapterV2Contract, type PlaceAdapterV2ContractControl } from "../src/contracts/place-adapter-v2.js";
import { defineRouteAdapterV2Contract, type RouteAdapterV2ContractControl, type RouteContractReadyCase } from "../src/contracts/route-adapter-v2.js";
import type { PlaceContractReadyCase } from "../src/contracts/place-adapter-v2.js";

interface PendingFetch {
  resolve(response: Response): void;
  reject(error: unknown): void;
  completed: Promise<void>;
  complete(): void;
  completionScheduled: boolean;
  bodyStarted: Promise<void>;
  markBodyStarted(): void;
  releaseBody?: () => void;
}

class ControlledFetch implements RouteAdapterV2ContractControl, PlaceAdapterV2ContractControl {
  readonly pending: PendingFetch[] = [];
  private throwNext = false;
  private completions = 0;

  constructor(private readonly readyPayload: (fixture: RouteContractReadyCase | PlaceContractReadyCase) => unknown) {}

  get providerStarts(): number { return this.pending.length; }
  get providerCompletions(): number { return this.completions; }

  readonly fetch = (): Promise<Response> => {
    if (this.throwNext) {
      this.throwNext = false;
      throw new Error("synthetic provider start failure");
    }
    let resolve!: (response: Response) => void;
    let reject!: (error: unknown) => void;
    let complete!: () => void;
    let markBodyStarted!: () => void;
    const completed = new Promise<void>((done) => { complete = done; });
    const bodyStarted = new Promise<void>((done) => { markBodyStarted = done; });
    const provider = new Promise<Response>((done, fail) => { resolve = done; reject = fail; });
    this.pending.push({
      resolve,
      reject,
      completed,
      complete,
      completionScheduled: false,
      bodyStarted,
      markBodyStarted,
    });
    return provider;
  };

  resolveReady(providerCall: number, fixture: RouteContractReadyCase | PlaceContractReadyCase): void {
    this.resolveBody(providerCall, this.readyPayload(fixture), false);
  }
  beginReadyWithHeldWork(providerCall: number, fixture: RouteContractReadyCase | PlaceContractReadyCase): void {
    this.resolveBody(providerCall, this.readyPayload(fixture), true);
  }
  heldWorkReachedReleasePoint(providerCall: number): Promise<void> { return this.entry(providerCall).bodyStarted; }
  releaseHeldWork(providerCall: number): void {
    const entry = this.entry(providerCall);
    if (entry.releaseBody === undefined) throw new Error(`Provider call ${providerCall} does not have a delayed body`);
    entry.releaseBody();
    entry.releaseBody = undefined;
  }
  resolveMalformed(providerCall: number): void { this.resolveBody(providerCall, { unexpected: true }, false); }
  reject(providerCall: number): void {
    const entry = this.entry(providerCall);
    entry.reject(new Error("synthetic provider rejection"));
    this.scheduleCompletion(entry);
  }
  throwOnNextStart(): void { this.throwNext = true; }
  completed(providerCall: number): Promise<void> { return this.entry(providerCall).completed; }

  private resolveBody(providerCall: number, payload: unknown, delayed: boolean): void {
    const entry = this.entry(providerCall);
    entry.resolve({
      ok: true,
      status: 200,
      json: () => {
        entry.markBodyStarted();
        let release!: () => void;
        const body = delayed
          ? new Promise<unknown>((resolve) => {
            release = () => resolve(structuredClone(payload));
            entry.releaseBody = release;
          })
          : Promise.resolve(structuredClone(payload));
        void body.then(
          () => this.scheduleCompletion(entry),
          () => this.scheduleCompletion(entry),
        );
        return body;
      },
    } as Response);
  }

  private scheduleCompletion(entry: PendingFetch): void {
    if (entry.completionScheduled) return;
    entry.completionScheduled = true;
    setTimeout(() => {
      this.completions += 1;
      entry.complete();
    }, 0);
  }

  private entry(providerCall: number): PendingFetch {
    const entry = this.pending[providerCall];
    if (entry === undefined) throw new Error(`Provider call ${providerCall} has not started`);
    return entry;
  }
}

function routeRequest(resourceId = "resource-default", semanticOwnerId = "owner-default"): RouteRequestV2 {
  return {
    edge: { id: resourceId, dayId: "contract-day", fromNodeId: "contract-origin", toNodeId: "contract-destination", mode: "walking", source: "provider", certainty: "suggested" },
    origin: { ownerId: `${semanticOwnerId}-origin`, label: "Contract origin", identity: { status: "resolved", coordinates: { lat: 10, lng: 20 } } },
    destination: { ownerId: `${semanticOwnerId}-destination`, label: "Contract destination", identity: { status: "resolved", coordinates: { lat: 10.01, lng: 20.01 } } },
  };
}

defineRouteAdapterV2Contract(
  "GoogleRouteAdapter with injected fetch",
  () => {
    const payloads: Record<RouteContractReadyCase, unknown> = {
      primary: { routes: [{ duration: "300s", distanceMeters: 500 }] },
      alternate: { routes: [{ duration: "600s", distanceMeters: 1_000 }] },
      abandoned: { routes: [{ duration: "60s", distanceMeters: 100 }] },
      replacement: { routes: [{ duration: "720s", distanceMeters: 900 }] },
    };
    const expected = {
      primary: { status: "ready", durationMinutes: 5, distanceMeters: 500, steps: [] },
      alternate: { status: "ready", durationMinutes: 10, distanceMeters: 1_000, steps: [] },
      abandoned: { status: "ready", durationMinutes: 1, distanceMeters: 100, steps: [] },
      replacement: { status: "ready", durationMinutes: 12, distanceMeters: 900, steps: [] },
    } as const;
    const control = new ControlledFetch((fixture) => payloads[fixture]);
    return {
      adapter: new GoogleRouteAdapter({ apiKey: "synthetic-key", transitEnabled: true, fetch: control.fetch }),
      control,
      expectedReady: (fixture: RouteContractReadyCase) => structuredClone(expected[fixture]),
      request: routeRequest,
      unsupportedRequest() {
        const request = routeRequest();
        request.edge.mode = "unknown";
        return request;
      },
    };
  },
);

function placeRequest(resourceId = "resource-default", semanticOwnerId = "owner-default"): PlaceRequestV2 {
  return { ownerId: semanticOwnerId, providerReference: { provider: "google", id: resourceId }, locale: "en", timeZone: "UTC" };
}

definePlaceAdapterV2Contract(
  "GooglePlaceAdapter with injected fetch",
  () => {
    const payloads: Record<PlaceContractReadyCase, unknown> = {
      primary: { formattedAddress: "1 Primary Way", businessStatus: "OPERATIONAL" },
      alternate: { formattedAddress: "2 Alternate Way", businessStatus: "CLOSED_TEMPORARILY" },
      abandoned: { formattedAddress: "3 Abandoned Way", businessStatus: "CLOSED_PERMANENTLY" },
      replacement: { formattedAddress: "4 Replacement Way", businessStatus: "OPERATIONAL" },
    };
    const expected = {
      primary: { status: "ready", facts: { formattedAddress: "1 Primary Way", businessStatus: "operational" } },
      alternate: { status: "ready", facts: { formattedAddress: "2 Alternate Way", businessStatus: "temporarily-closed" } },
      abandoned: { status: "ready", facts: { formattedAddress: "3 Abandoned Way", businessStatus: "permanently-closed" } },
      replacement: { status: "ready", facts: { formattedAddress: "4 Replacement Way", businessStatus: "operational" } },
    } as const;
    const control = new ControlledFetch((fixture) => payloads[fixture]);
    return {
      adapter: new GooglePlaceAdapter({ apiKey: "synthetic-key", fetch: control.fetch }),
      control,
      expectedReady: (fixture: PlaceContractReadyCase) => structuredClone(expected[fixture]),
      request: placeRequest,
      unsupportedRequest() {
        const request = placeRequest();
        request.providerReference.provider = "unsupported-provider";
        return request;
      },
    };
  },
);

// Shared test runtime is imported above.

const createMarkerContent: MarkerContentFactory = (descriptor) => {
  const element = document.createElement("button");
  element.dataset.testingMarkerOwner = descriptor.ownerId;
  return {
    element,
    update(next) {
      element.dataset.testingMarkerOwner = next.ownerId;
      element.dispatchEvent(new CustomEvent("testing-handle-update", { detail: structuredClone(next) }));
    },
    dispose: vi.fn(() => { element.dataset.disposed = "true"; }),
  };
};

const createUserLocationContent: UserLocationContentFactory = (descriptor) => {
  const element = document.createElement("span");
  element.dataset.testingUserLocation = `${descriptor.coordinates.lat},${descriptor.coordinates.lng}`;
  return {
    element,
    update(next) {
      element.dataset.testingUserLocation = `${next.coordinates.lat},${next.coordinates.lng}`;
      element.dispatchEvent(new CustomEvent("testing-handle-update", { detail: structuredClone(next) }));
    },
    dispose: vi.fn(() => { element.dataset.disposed = "true"; }),
  };
};


for (const advanced of [false, true]) defineMapAdapterV2Contract(
  `GoogleMapAdapter with injected ${advanced ? "AdvancedMarker" : "OverlayView"} runtime`,
  () => new GoogleMapAdapter(createRuntime(), { development: false, ...(advanced ? { mapId: "synthetic-map", cloudStyleProfileId: "contract-profile" } : {}) }),
  createContractHost,
  createMarkerContent,
  createUserLocationContent,
);
