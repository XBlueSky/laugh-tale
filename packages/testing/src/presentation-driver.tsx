import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import {
  TripController,
  type TripControllerProps,
} from "@laugh-tale-island/react";

export type PresentationContractRole =
  | "home"
  | "experience"
  | "loading"
  | "setup"
  | "fatal"
  | "day-choice"
  | "itinerary"
  | "map"
  | "timeline-node"
  | "timeline-route"
  | "logistics-group"
  | "logistics-child"
  | "candidate-group"
  | "candidate-option"
  | "progress-completion"
  | "progress-skipped"
  | "progress-shopping"
  | "sheet";

export type PresentationContractAction =
  | "open-day"
  | "open-home"
  | "select-owner"
  | "select-route"
  | "open-navigation"
  | "restore-automatic"
  | "return-current"
  | "return-lodging"
  | "restore-full-day"
  | "retry-map"
  | "retry-route"
  | "retry-place"
  | "step-sheet-expand"
  | "step-sheet-collapse"
  | "begin-location"
  | "recenter-location"
  | "stop-location"
  | "reopen-candidate"
  | "preview-candidate"
  | "cancel-candidate"
  | "confirm-candidate"
  | "update-completion"
  | "update-skipped"
  | "update-shopping"
  | "reset-trip"
  | "reset-day"
  | "retry-setup"
  | "retry-fatal";

export interface PresentationDriver {
  query(
    role: PresentationContractRole,
    ownerId?: string,
  ): HTMLElement | null;
  get(role: PresentationContractRole, ownerId?: string): HTMLElement;
  all(role: PresentationContractRole): readonly HTMLElement[];
  ownerIds(role: PresentationContractRole): readonly string[];
  states(role: PresentationContractRole, ownerId: string): readonly string[];
  value(role: PresentationContractRole, ownerId?: string): string | null;
  selectedOwnerId(): string | null;
  activate(action: PresentationContractAction, ownerId?: string): void;
  settle(): Promise<void>;
  dispose(): void;
}

function elementsWith(
  container: HTMLElement,
  attribute: "data-contract-role" | "data-contract-action",
  value: string,
): HTMLElement[] {
  return Array.from(
    container.querySelectorAll<HTMLElement>(`[${attribute}]`),
  ).filter(
    (element) => element.getAttribute(attribute) === value,
  );
}

function owned(
  elements: readonly HTMLElement[],
  ownerId: string | undefined,
): HTMLElement | null {
  return (
    elements.find(
      (element) =>
        ownerId === undefined || element.dataset.ownerId === ownerId,
    ) ?? null
  );
}

function driverFor(
  container: HTMLElement,
  disposeMounted: () => void,
): PresentationDriver {
  let disposed = false;
  const query = (
    role: PresentationContractRole,
    ownerId?: string,
  ): HTMLElement | null =>
    owned(elementsWith(container, "data-contract-role", role), ownerId);
  return {
    query,
    get(role, ownerId) {
      const element = query(role, ownerId);
      if (element === null)
        throw new Error(
          `No test fixture contract role ${role}${ownerId === undefined ? "" : ` for owner ${ownerId}`}`,
        );
      return element;
    },
    all: (role) => elementsWith(container, "data-contract-role", role),
    ownerIds: (role) =>
      elementsWith(container, "data-contract-role", role).flatMap((element) =>
        element.dataset.ownerId === undefined ? [] : [element.dataset.ownerId],
      ),
    states: (role, ownerId) => {
      const state = query(role, ownerId)?.dataset.contractStates;
      return state === undefined || state === "" ? [] : state.split(" ");
    },
    value: (role, ownerId) =>
      query(role, ownerId)?.dataset.contractValue ?? null,
    selectedOwnerId: () =>
      query("experience")?.dataset.selectedOwnerId ?? null,
    activate(action, ownerId) {
      const element = owned(
        elementsWith(container, "data-contract-action", action),
        ownerId,
      );
      if (!(element instanceof HTMLButtonElement))
        throw new Error(
          `No test fixture contract action ${action}${ownerId === undefined ? "" : ` for owner ${ownerId}`}`,
        );
      act(() => element.click());
    },
    async settle() {
      await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
      });
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      disposeMounted();
    },
  };
}

export function createPresentationDriver(
  container: HTMLElement,
): PresentationDriver {
  return driverFor(container, () => container.replaceChildren());
}

export function renderTripContract(
  props: TripControllerProps,
): PresentationDriver {
  const container = document.createElement("div");
  container.dataset.testFixture = "trip-contract";
  document.body.append(container);
  let root: Root | null = createRoot(container);
  act(() => root?.render(createElement(TripController, props)));
  return driverFor(container, () => {
    const mounted = root;
    root = null;
    if (mounted !== null) act(() => mounted.unmount());
    container.remove();
  });
}
