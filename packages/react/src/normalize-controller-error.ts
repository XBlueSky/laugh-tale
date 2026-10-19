import type { FatalErrorModel } from "./presentation-contract.js";

export class ControllerStateFailure extends Error {
  constructor(override readonly cause: unknown) { super("controller-state-failure", { cause }); }
}

export function controllerStateOperation<T>(operation: () => T): T {
  try { return operation(); } catch (cause) {
    throw cause instanceof ControllerStateFailure ? cause : new ControllerStateFailure(cause);
  }
}

export function normalizeControllerError(
  category: FatalErrorModel["category"], retry: boolean, home: boolean,
): FatalErrorModel {
  return {
    category, copyKey: `fatal.${category}`,
    retained: { home, itinerary: false, externalNavigation: false },
    capabilities: { retry, openHome: home },
  };
}
