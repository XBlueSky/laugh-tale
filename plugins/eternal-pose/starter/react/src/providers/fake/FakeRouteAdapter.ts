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

export type FakeRouteResolver = (
  request: RouteRequest,
) => RouteResult | Promise<RouteResult>;

export class FakeRouteAdapter implements RouteAdapter {
  readonly loadCalls: RouteRequest[] = [];

  constructor(
    private readonly results:
      | Readonly<Record<string, RouteResult>>
      | FakeRouteResolver = {},
  ) {}

  async load(request: RouteRequest, signal: AbortSignal): Promise<RouteResult> {
    this.loadCalls.push({
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
    });
    if (signal.aborted) {
      return { status: "unavailable", reason: "Request aborted" };
    }

    const result =
      typeof this.results === "function"
        ? await this.results(request)
        : this.results[request.edge.id] ?? {
            status: "unavailable",
            reason: `No fake route configured for ${request.edge.id}`,
          };
    return signal.aborted
      ? { status: "unavailable", reason: "Request aborted" }
      : cloneResult(result);
  }
}
