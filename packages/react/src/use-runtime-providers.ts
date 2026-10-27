import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useInsertionEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type {
  PlaceProviderResult,
  PlaceRequestV2,
  ProviderUnavailableResult,
  RouteProviderResult,
  RouteRequestV2,
} from "@laugh-tale-island/core";
import { validateRouteProviderResult } from "@laugh-tale-island/core";
import type {
  ProviderBootstrapState,
  ProviderChannelStateModel,
  TripDiagnosticSink,
  TripRuntimeAdapters,
} from "./presentation-contract.js";
import { emitTripDiagnostic } from "./emit-trip-diagnostic.js";
import { ControllerStateFailure } from "./normalize-controller-error.js";

type Channel = "map" | "route" | "place";
type BootstrapLedger = Map<Channel, string>;
/** Controller-owned lifetime, with at most one current attempt per channel. */
export const BootstrapDiagnosticContext = createContext<BootstrapLedger | null>(
  null,
);

export function sanitizeProviderFailure(
  result: ProviderUnavailableResult,
): ProviderUnavailableResult {
  return {
    status: "unavailable",
    reason: result.reason,
    retryable: result.retryable,
  };
}

export function reportProviderFailure(
  sink: TripDiagnosticSink | undefined,
  channel: Channel,
  phase: "bootstrap" | "request" | "runtime",
  failure: ProviderUnavailableResult,
  ownerId?: string,
  cause?: unknown,
): void {
  emitTripDiagnostic(sink, {
    scope: "provider",
    channel,
    phase,
    reason: failure.reason,
    ...(ownerId === undefined ? {} : { ownerId }),
    ...(failure.diagnostic === undefined
      ? {}
      : { diagnostic: failure.diagnostic }),
    ...(cause === undefined ? {} : { cause }),
  });
}

export function useBootstrapProviders(
  runtime: TripRuntimeAdapters | undefined,
  bootstrap: ProviderBootstrapState | undefined,
  sink: TripDiagnosticSink | undefined,
) {
  const inherited = useContext(BootstrapDiagnosticContext);
  const [local] = useState<BootstrapLedger>(() => new Map());
  const ledger = inherited ?? local;
  const [acknowledged, acknowledge] = useState(() => new Map(ledger));
  const latestSink = useRef(sink);
  useInsertionEffect(() => {
    latestSink.current = sink;
  }, [sink]);
  const { map, routes, places } = bootstrap ?? {};
  if (
    (map !== undefined && runtime?.createMap !== undefined) ||
    (routes !== undefined && runtime?.createRoutes !== undefined) ||
    (places !== undefined && runtime?.createPlaces !== undefined)
  )
    throw new ControllerStateFailure(
      new Error("contradictory-provider-bootstrap"),
    );
  const attempts = [
    ["map", map?.status === "loading" ? undefined : map],
    ["route", routes],
    ["place", places],
  ] as const;
  const keys = new Map<Channel, string>();
  for (const [channel, failure] of attempts) {
    if (failure !== undefined)
      keys.set(
        channel,
        JSON.stringify([failure.reason, failure.retryable, failure.diagnostic]),
      );
  }
  // Only committed semantic attempts report; acknowledgement publishes afterwards.
  // At most one key per channel is retained, including across surface switches.
  useLayoutEffect(() => {
    for (const [channel, failure] of attempts) {
      if (failure === undefined) ledger.delete(channel);
      else if (ledger.get(channel) !== keys.get(channel)) {
        ledger.set(channel, keys.get(channel)!);
        reportProviderFailure(
          latestSink.current,
          channel,
          "bootstrap",
          failure,
        );
      }
    }
    if (
      attempts.some(
        ([channel]) => acknowledged.get(channel) !== keys.get(channel),
      )
    ) {
      acknowledge(keys);
    }
  });
  const pending = {
    map: map?.status === "unavailable" && acknowledged.get("map") !== keys.get("map"),
    routes:
      routes !== undefined && acknowledged.get("route") !== keys.get("route"),
    places:
      places !== undefined && acknowledged.get("place") !== keys.get("place"),
  };
  const published: ProviderBootstrapState = {
    ...(map === undefined || pending.map ? {} : { map }),
    ...(routes === undefined || pending.routes ? {} : { routes }),
    ...(places === undefined || pending.places ? {} : { places }),
  };
  return { published, pending };
}

const missing: ProviderUnavailableResult = {
  status: "unavailable",
  reason: "missing-configuration",
  retryable: false,
};
const rejected: ProviderUnavailableResult = {
  status: "unavailable",
  reason: "network",
  retryable: true,
};
type RuntimeResult = PlaceProviderResult | RouteProviderResult;
type RequestState<Result> = Result | { status: "idle" | "loading" };
interface RequestRecord<Result> {
  key: string;
  abort: AbortController;
  state: RequestState<Result>;
}

function useProviderRequests<Request, Result extends RuntimeResult>(
  channel: "route" | "place",
  factory:
    | (() => { load(request: Request, signal: AbortSignal): Promise<Result> })
    | undefined,
  requests: readonly Request[],
  ownerFor: (request: Request) => string,
  dayId: string,
  enabled: boolean,
  bootstrap: ProviderUnavailableResult | undefined,
  bootstrapPending: boolean,
  sink: TripDiagnosticSink | undefined,
  validate?: (request: Request, result: Result | ProviderUnavailableResult) => Result | ProviderUnavailableResult,
) {
  const adapter = useRef<{
    load(request: Request, signal: AbortSignal): Promise<Result>;
  } | null>(null);
  const records = useRef(new Map<string, RequestRecord<Result>>());
  const factoryFailure = useRef<ProviderUnavailableResult | null>(null);
  const latestSink = useRef(sink);
  const [, refresh] = useState(0);
  const [factoryAttempt, retryFactory] = useState(0);
  useInsertionEffect(() => {
    latestSink.current = sink;
  }, [sink]);
  const cancel = useCallback(() => {
    for (const record of records.current.values()) record.abort.abort();
    records.current.clear();
  }, []);
  useEffect(() => {
    factoryFailure.current = null;
    if (factory === undefined || !enabled) return;
    try {
      adapter.current = factory();
    } catch (cause) {
      reportProviderFailure(
        latestSink.current,
        channel,
        "runtime",
        rejected,
        undefined,
        cause,
      );
      factoryFailure.current = rejected;
    }
    refresh((revision) => revision + 1);
    return () => {
      cancel();
      adapter.current = null;
    };
  }, [factory, enabled, cancel, channel, factoryAttempt]);

  // Inspect committed request identity: unchanged owners keep their independent request.
  useEffect(() => {
    if (!enabled || adapter.current === null) return;
    const desired = new Map(
      requests.map((request) => [
        ownerFor(request),
        { request, key: JSON.stringify([dayId, request]) },
      ]),
    );
    let changed = false;
    for (const [id, record] of records.current) {
      if (desired.get(id)?.key !== record.key) {
        record.abort.abort();
        records.current.delete(id);
        changed = true;
      }
    }
    for (const [id, { request, key }] of desired) {
      if (records.current.has(id)) continue;
      const record: RequestRecord<Result> = {
        key,
        abort: new AbortController(),
        state: { status: "loading" },
      };
      records.current.set(id, record);
      changed = true;
      const active = () =>
        !record.abort.signal.aborted && records.current.get(id) === record;
      let originalRequest = request;
      const complete = (
        result: Result | ProviderUnavailableResult,
        cause?: unknown,
      ) => {
        if (!active()) return;
        if (validate !== undefined) result = validate(originalRequest, result);
        if (result.status === "unavailable" && result.reason !== "cancelled")
          reportProviderFailure(
            latestSink.current,
            channel,
            "request",
            result,
            id,
            cause,
          );
        record.state = (
          result.status === "unavailable"
            ? sanitizeProviderFailure(result)
            : result
        ) as Result;
        refresh((revision) => revision + 1);
      };
      try {
        // Keep quarantine anchored to the committed request, independent of adapter mutation.
        originalRequest = validate === undefined ? request : structuredClone(request);
        const adapterRequest = validate === undefined ? request : structuredClone(originalRequest);
        void adapter.current.load(adapterRequest, record.abort.signal).then(
          (result) => complete(result),
          (cause: unknown) => complete(rejected, cause),
        );
      } catch (cause) {
        complete(rejected, cause);
      }
    }
    if (changed) refresh((revision) => revision + 1);
  });
  const retry = useCallback((id: string) => {
    if (factoryFailure.current?.retryable) {
      factoryFailure.current = null;
      retryFactory((attempt) => attempt + 1);
      return;
    }
    const record = records.current.get(id);
    if (record?.state.status !== "unavailable" || !record.state.retryable)
      return;
    record.abort.abort();
    records.current.delete(id);
    refresh((revision) => revision + 1);
  }, []);
  const states: Record<string, RequestState<Result>> = Object.create(null) as Record<string, RequestState<Result>>;
  const retryableIds: string[] = [];
  for (const request of requests) {
    const id = ownerFor(request);
    const record = records.current.get(id);
    const current =
      record?.key === JSON.stringify([dayId, request])
        ? record.state
        : undefined;
    if (
      enabled &&
      factory !== undefined &&
      (factoryFailure.current?.retryable === true ||
        (current?.status === "unavailable" && current.retryable))
    )
      retryableIds.push(id);
    states[id] = bootstrapPending
      ? { status: "idle" }
      : (current ??
        ((bootstrap === undefined && factory !== undefined
          ? (factoryFailure.current ?? { status: enabled ? "loading" : "idle" })
          : sanitizeProviderFailure(
              bootstrap ?? missing,
            )) as RequestState<Result>));
  }
  const values = Object.values(states);
  const unavailable = values.find((state) => state.status === "unavailable");
  const status: ProviderChannelStateModel = bootstrapPending
    ? { status: "idle", retryable: false }
    : bootstrap !== undefined || factory === undefined
      ? sanitizeProviderFailure(bootstrap ?? missing)
      : unavailable?.status === "unavailable"
        ? sanitizeProviderFailure(unavailable)
        : {
            status: values.some((state) => state.status === "loading")
              ? "loading"
              : values.length > 0
                ? "ready"
                : "idle",
            retryable: false,
          };
  return { states, retry, status, retryableIds };
}

interface RuntimeProviderInput {
  dayId: string;
  routeRequests: readonly RouteRequestV2[];
  placeRequests: readonly PlaceRequestV2[];
  runtime?: TripRuntimeAdapters;
  providerBootstrap?: ProviderBootstrapState;
  onDiagnostic?: TripDiagnosticSink;
  enabled: boolean;
}
const routeOwner = (request: RouteRequestV2) => request.edge.id;
const placeOwner = (request: PlaceRequestV2) => request.ownerId;

export function useRuntimeProviders(input: RuntimeProviderInput) {
  const bootstrap = useBootstrapProviders(
    input.runtime,
    input.providerBootstrap,
    input.onDiagnostic,
  );
  // Factory identity is the lifecycle key; the invoked function remains bound to its receiver.
  const createRoutes = useMemo(
    () => input.runtime?.createRoutes?.bind(input.runtime),
    // eslint-disable-next-line @typescript-eslint/unbound-method
    [input.runtime?.createRoutes],
  );
  const createPlaces = useMemo(
    () => input.runtime?.createPlaces?.bind(input.runtime),
    // eslint-disable-next-line @typescript-eslint/unbound-method
    [input.runtime?.createPlaces],
  );
  const routes = useProviderRequests<RouteRequestV2, RouteProviderResult>(
    "route",
    createRoutes,
    input.routeRequests,
    routeOwner,
    input.dayId,
    input.enabled,
    bootstrap.published.routes,
    bootstrap.pending.routes,
    input.onDiagnostic,
    validateRouteProviderResult,
  );
  const places = useProviderRequests(
    "place",
    createPlaces,
    input.placeRequests,
    placeOwner,
    input.dayId,
    input.enabled,
    bootstrap.published.places,
    bootstrap.pending.places,
    input.onDiagnostic,
  );
  return {
    bootstrap,
    routeStates: routes.states,
    placeStates: places.states,
    retryRouteIds: routes.retryableIds,
    retryPlaceOwnerIds: places.retryableIds,
    providers: { routes: routes.status, places: places.status },
    retry: (kind: "route" | "place", id: string) =>
      (kind === "route" ? routes : places).retry(id),
  };
}
