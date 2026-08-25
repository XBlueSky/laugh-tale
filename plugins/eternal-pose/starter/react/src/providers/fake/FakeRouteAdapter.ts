import type {
  RouteAdapter,
  RouteRequest,
  RouteResult,
} from "../../experience-shell/provider-contracts";

function cloneResult(result: RouteResult): RouteResult {
  return result.status === "unavailable"
    ? { ...result }
    : {
        ...result,
        path: result.path.map((point) => ({ ...point })),
        steps: [...result.steps],
      };
}

function cloneRequest(request: RouteRequest): RouteRequest {
  return {
    edge: {
      ...request.edge,
      ...(request.edge.navigation === undefined
        ? {}
        : { navigation: { ...request.edge.navigation } }),
    },
    ...(request.departureAt === undefined
      ? {}
      : { departureAt: request.departureAt }),
    ...(request.transitPreferences === undefined
      ? {}
      : {
          transitPreferences: {
            ...(request.transitPreferences.allowedModes === undefined
              ? {}
              : {
                  allowedModes: [
                    ...request.transitPreferences.allowedModes,
                  ],
                }),
          },
        }),
  };
}

function unavailable(reason: string): RouteResult {
  return { status: "unavailable", reason };
}

function errorReason(error: unknown): string {
  if (error instanceof DOMException && error.name === "AbortError") {
    return "Request aborted";
  }
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }
  return typeof error === "string" && error.trim().length > 0
    ? error
    : "Fake route request failed";
}

export type FakeRouteResolver = (
  request: RouteRequest,
) => RouteResult | Promise<RouteResult>;

export class FakeRouteAdapter implements RouteAdapter {
  readonly loadCalls: RouteRequest[] = [];
  private readonly results:
    | Readonly<Record<string, RouteResult>>
    | FakeRouteResolver;

  constructor(
    results: Readonly<Record<string, RouteResult>> | FakeRouteResolver = {},
  ) {
    if (typeof results === "function") {
      this.results = results;
      return;
    }
    const snapshot = Object.create(null) as Record<string, RouteResult>;
    for (const key of Object.getOwnPropertyNames(results)) {
      const result = results[key];
      if (result !== undefined) {
        Object.defineProperty(snapshot, key, {
          configurable: false,
          enumerable: true,
          value: cloneResult(result),
          writable: false,
        });
      }
    }
    this.results = snapshot;
  }

  load(request: RouteRequest, signal: AbortSignal): Promise<RouteResult> {
    const recordedRequest = cloneRequest(request);
    this.loadCalls.push(recordedRequest);
    if (signal.aborted) {
      return Promise.resolve(unavailable("Request aborted"));
    }

    const resolverRequest = cloneRequest(recordedRequest);
    const work = Promise.resolve()
      .then(() => {
        if (typeof this.results === "function") {
          return this.results(resolverRequest);
        }
        return Object.hasOwn(this.results, resolverRequest.edge.id)
          ? this.results[resolverRequest.edge.id]
          : unavailable(
              `No fake route configured for ${resolverRequest.edge.id}`,
            );
      })
      .then((result) =>
        result === undefined
          ? unavailable(
              `No fake route configured for ${resolverRequest.edge.id}`,
            )
          : cloneResult(result),
      )
      .catch((error: unknown) => unavailable(errorReason(error)));

    return new Promise((resolve) => {
      let settled = false;
      const finish = (result: RouteResult): void => {
        if (settled) {
          return;
        }
        settled = true;
        signal.removeEventListener("abort", onAbort);
        resolve(cloneResult(result));
      };
      const onAbort = (): void => {
        finish(unavailable("Request aborted"));
      };
      signal.addEventListener("abort", onAbort, { once: true });
      if (signal.aborted) {
        onAbort();
        return;
      }
      void work.then(finish);
    });
  }
}
