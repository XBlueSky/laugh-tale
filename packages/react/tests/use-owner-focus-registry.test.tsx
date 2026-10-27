import {
  Suspense,
  startTransition,
  useLayoutEffect,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import { act, cleanup, render, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  useOwnerFocusRegistry,
  type OwnerFocusRegistry,
  type OwnerFocusTarget,
} from "../src/use-owner-focus-registry.js";

interface FocusSurfaceState {
  ownershipKey: string;
  reducedMotion: boolean;
  suspended: boolean;
  targetMounted: boolean;
}

interface ControlledFocusSurfaceProps {
  initialSurface?: FocusSurfaceState;
  onCommit: (registry: OwnerFocusRegistry) => void;
  onControl: (update: Dispatch<SetStateAction<FocusSurfaceState>>) => void;
}

const INITIAL_SURFACE_STATE: FocusSurfaceState = {
  ownershipKey: "day-a",
  reducedMotion: false,
  suspended: false,
  targetMounted: true,
};
const SUSPENDED_PROMISE = new Promise<never>(() => undefined);
const SUSPENDED_RENDER = Object.assign(
  new Error("synthetic suspended focus render"),
  { then: SUSPENDED_PROMISE.then.bind(SUSPENDED_PROMISE) },
);

function ControlledFocusSurface({
  initialSurface = INITIAL_SURFACE_STATE,
  onCommit,
  onControl,
}: ControlledFocusSurfaceProps) {
  const [surface, setSurface] = useState<FocusSurfaceState>(initialSurface);
  const registry = useOwnerFocusRegistry(
    surface.ownershipKey,
    surface.reducedMotion,
  );

  useLayoutEffect(() => {
    onControl(setSurface);
  }, [onControl]);
  useLayoutEffect(() => {
    onCommit(registry);
  }, [onCommit, registry, surface.ownershipKey, surface.reducedMotion]);

  if (surface.suspended) throw SUSPENDED_RENDER;
  if (!surface.targetMounted) return null;

  return (
    <button
      key={surface.ownershipKey}
      ref={registry.nodeRef("node-a")}
      type="button"
    />
  );
}

interface FocusableElement {
  element: HTMLElement;
  focus: ReturnType<typeof vi.fn>;
  scrollIntoView: ReturnType<typeof vi.fn>;
}

function focusableElement(connected = true): FocusableElement {
  const element = document.createElement("button");
  const focus = vi.fn();
  const scrollIntoView = vi.fn();
  element.focus = focus;
  element.scrollIntoView = scrollIntoView;
  if (connected) document.body.append(element);
  return { element, focus, scrollIntoView };
}

function installScrollIntoView(
  scrollIntoView: HTMLElement["scrollIntoView"],
): () => void {
  const previous = Object.getOwnPropertyDescriptor(
    HTMLElement.prototype,
    "scrollIntoView",
  );
  Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
    configurable: true,
    value: scrollIntoView,
    writable: true,
  });
  return () => {
    if (previous === undefined) {
      Reflect.deleteProperty(HTMLElement.prototype, "scrollIntoView");
    } else {
      Object.defineProperty(HTMLElement.prototype, "scrollIntoView", previous);
    }
  };
}

afterEach(() => {
  cleanup();
  document.body.replaceChildren();
});

describe("useOwnerFocusRegistry", () => {
  it.each([false, true])("explicitly reveals and focuses deferred option controls with reduced motion %s", (reducedMotion) => {
    const { result, rerender, unmount } = renderHook(({ day }) => useOwnerFocusRegistry(day, reducedMotion), { initialProps: { day: "day-a" } });
    const option = focusableElement();
    act(() => result.current.revealAndFocus({ slot: "dialog", ownerId: "option" }));
    act(() => { result.current.dialogRef("option")(option.element); });
    expect(option.scrollIntoView).toHaveBeenCalledExactlyOnceWith({ block: "nearest", behavior: reducedMotion ? "auto" : "smooth" });
    expect(option.focus).toHaveBeenCalledExactlyOnceWith({ preventScroll: true });
    option.scrollIntoView.mockClear();
    act(() => result.current.focus({ slot: "dialog", ownerId: "option" }));
    expect(option.scrollIntoView).not.toHaveBeenCalled();
    const late = focusableElement();
    act(() => result.current.revealAndFocus({ slot: "dialog", ownerId: "late" }));
    rerender({ day: "day-b" });
    act(() => { result.current.dialogRef("late")(late.element); });
    expect(late.focus).not.toHaveBeenCalled();
    const registry = result.current;
    act(() => registry.revealAndFocus({ slot: "dialog", ownerId: "unmounted" }));
    unmount();
    act(() => { registry.dialogRef("unmounted")(late.element); });
    expect(late.scrollIntoView).not.toHaveBeenCalled();
  });
  it.each([false, true])("reveals registered owners without focus with reduced motion %s", (reducedMotion) => {
    const { result } = renderHook(() => useOwnerFocusRegistry("day-a", reducedMotion));
    const node = focusableElement();
    act(() => {
      result.current.nodeRef("node-a")(node.element);
      result.current.reveal({ slot: "node", ownerId: "node-a" });
    });
    expect(node.scrollIntoView).toHaveBeenCalledExactlyOnceWith({ block: "nearest", behavior: reducedMotion ? "auto" : "smooth" });
    expect(node.focus).not.toHaveBeenCalled();
  });

  it("fulfills deferred scroll-only reveal once and shares supersession/cancellation with focus", () => {
    const { result } = renderHook(() => useOwnerFocusRegistry("day-a", false));
    const node = focusableElement();
    const stale = focusableElement();
    act(() => {
      result.current.focus({ slot: "node", ownerId: "stale" });
      result.current.reveal({ slot: "node", ownerId: "node-a" });
      result.current.nodeRef("stale")(stale.element);
      result.current.nodeRef("node-a")(node.element);
      result.current.nodeRef("node-a")(node.element);
    });
    expect(node.scrollIntoView).toHaveBeenCalledOnce();
    expect(node.focus).not.toHaveBeenCalled();
    expect(stale.scrollIntoView).not.toHaveBeenCalled();
    act(() => {
      result.current.reveal({ slot: "node", ownerId: "cancelled" });
      result.current.cancelPendingFocus();
      result.current.nodeRef("cancelled")(stale.element);
    });
    expect(stale.scrollIntoView).not.toHaveBeenCalled();
  });

  it("cancels stale day and unmounted reveal requests before late registration", () => {
    const { result, rerender, unmount } = renderHook(({ key }) => useOwnerFocusRegistry(key, false), { initialProps: { key: "day-a" } });
    const oldRef = result.current.nodeRef("late");
    act(() => result.current.reveal({ slot: "node", ownerId: "late" }));
    rerender({ key: "day-b" });
    const stale = focusableElement();
    act(() => { oldRef(stale.element); });
    expect(stale.scrollIntoView).not.toHaveBeenCalled();
    const registry = result.current;
    const lateRef = registry.nodeRef("late");
    act(() => registry.reveal({ slot: "node", ownerId: "late" }));
    unmount();
    act(() => {
      lateRef(stale.element);
      registry.reveal({ slot: "node", ownerId: "late" });
    });
    expect(stale.scrollIntoView).not.toHaveBeenCalled();
    expect(stale.focus).not.toHaveBeenCalled();
  });

  it("keeps committed registrations and motion policy when a proposed render suspends", () => {
    let committedRegistry: OwnerFocusRegistry | undefined;
    let updateSurface: Dispatch<SetStateAction<FocusSurfaceState>> | undefined;
    const view = render(
      <Suspense fallback={null}>
        <ControlledFocusSurface
          onCommit={(registry) => {
            committedRegistry = registry;
          }}
          onControl={(update) => {
            updateSurface = update;
          }}
        />
      </Suspense>,
    );
    if (committedRegistry === undefined || updateSurface === undefined) {
      throw new Error("initial focus surface did not commit");
    }
    const registry = committedRegistry;
    const update = updateSurface;
    const button = view.getByRole("button");
    const focus = vi.fn();
    const scrollIntoView = vi.fn();
    button.focus = focus;
    button.scrollIntoView = scrollIntoView;

    act(() => {
      startTransition(() => {
        update({
          ownershipKey: "day-a",
          reducedMotion: true,
          suspended: true,
          targetMounted: true,
        });
      });
    });
    expect(view.getByRole("button")).toBe(button);

    act(() => registry.focus({ slot: "node", ownerId: "node-a" }));

    expect(scrollIntoView).toHaveBeenCalledExactlyOnceWith({
      block: "nearest",
      behavior: "smooth",
    });
    expect(focus).toHaveBeenCalledExactlyOnceWith({ preventScroll: true });
  });

  it("keeps committed ownership after a future-key render is suspended and abandoned", () => {
    let committedRegistry: OwnerFocusRegistry | undefined;
    let updateSurface: Dispatch<SetStateAction<FocusSurfaceState>> | undefined;
    const view = render(
      <Suspense fallback={null}>
        <ControlledFocusSurface
          onCommit={(registry) => {
            committedRegistry = registry;
          }}
          onControl={(update) => {
            updateSurface = update;
          }}
        />
      </Suspense>,
    );
    if (committedRegistry === undefined || updateSurface === undefined) {
      throw new Error("initial focus surface did not commit");
    }
    const registry = committedRegistry;
    const update = updateSurface;
    const button = view.getByRole("button");
    const focus = vi.fn();
    const scrollIntoView = vi.fn();
    button.focus = focus;
    button.scrollIntoView = scrollIntoView;

    act(() => {
      startTransition(() => {
        update({
          ownershipKey: "day-b",
          reducedMotion: true,
          suspended: true,
          targetMounted: true,
        });
      });
    });
    expect(view.getByRole("button")).toBe(button);

    act(() => registry.focus(
      { slot: "node", ownerId: "node-a" },
      "day-a",
    ));

    expect(scrollIntoView).toHaveBeenCalledExactlyOnceWith({
      block: "nearest",
      behavior: "smooth",
    });
    expect(focus).toHaveBeenCalledExactlyOnceWith({ preventScroll: true });

    act(() => {
      update({ ...INITIAL_SURFACE_STATE });
    });
    act(() => registry.focus({ slot: "node", ownerId: "node-a" }));

    expect(focus).toHaveBeenCalledTimes(2);
  });

  it("attaches a future owner in the successful commit before fulfilling its pending focus", () => {
    let committedRegistry: OwnerFocusRegistry | undefined;
    let updateSurface: Dispatch<SetStateAction<FocusSurfaceState>> | undefined;
    const view = render(
      <ControlledFocusSurface
        onCommit={(registry) => {
          committedRegistry = registry;
        }}
        onControl={(update) => {
          updateSurface = update;
        }}
      />,
    );
    if (committedRegistry === undefined || updateSurface === undefined) {
      throw new Error("initial focus surface did not commit");
    }
    const registry = committedRegistry;
    const update = updateSurface;
    const initialButton = view.getByRole("button");

    act(() => registry.focus(
      { slot: "node", ownerId: "node-a" },
      "day-b",
    ));
    act(() => {
      update({
        ownershipKey: "day-b",
        reducedMotion: false,
        suspended: false,
        targetMounted: true,
      });
    });

    const nextButton = view.getByRole("button");
    expect(nextButton).not.toBe(initialButton);
    expect(document.activeElement).toBe(nextButton);
  });

  it("preserves future-owned pending focus through a motion-only commit", () => {
    const scrollIntoView = vi.fn();
    const restoreScrollIntoView = installScrollIntoView(scrollIntoView);
    try {
      let committedRegistry: OwnerFocusRegistry | undefined;
      let updateSurface: Dispatch<SetStateAction<FocusSurfaceState>> | undefined;
      const view = render(
        <ControlledFocusSurface
          onCommit={(registry) => {
            committedRegistry = registry;
          }}
          onControl={(update) => {
            updateSurface = update;
          }}
        />,
      );
      if (committedRegistry === undefined || updateSurface === undefined) {
        throw new Error("initial focus surface did not commit");
      }
      const registry = committedRegistry;
      const update = updateSurface;
      const initialButton = view.getByRole("button");

      act(() => registry.focus(
        { slot: "node", ownerId: "node-a" },
        "day-b",
      ));
      act(() => {
        update({
          ownershipKey: "day-a",
          reducedMotion: true,
          suspended: false,
          targetMounted: true,
        });
      });
      expect(view.getByRole("button")).toBe(initialButton);

      act(() => {
        update({
          ownershipKey: "day-b",
          reducedMotion: true,
          suspended: false,
          targetMounted: true,
        });
      });

      const nextButton = view.getByRole("button");
      expect(nextButton).not.toBe(initialButton);
      expect(document.activeElement).toBe(nextButton);
      expect(scrollIntoView).toHaveBeenCalledExactlyOnceWith({
        block: "nearest",
        behavior: "auto",
      });
    } finally {
      restoreScrollIntoView();
    }
  });

  it("uses newly committed motion policy when a same-key target attaches", () => {
    const scrollIntoView = vi.fn();
    const restoreScrollIntoView = installScrollIntoView(scrollIntoView);
    try {
      let committedRegistry: OwnerFocusRegistry | undefined;
      let updateSurface: Dispatch<SetStateAction<FocusSurfaceState>> | undefined;
      const view = render(
        <ControlledFocusSurface
          initialSurface={{
            ownershipKey: "day-a",
            reducedMotion: false,
            suspended: false,
            targetMounted: false,
          }}
          onCommit={(registry) => {
            committedRegistry = registry;
          }}
          onControl={(update) => {
            updateSurface = update;
          }}
        />,
      );
      if (committedRegistry === undefined || updateSurface === undefined) {
        throw new Error("initial focus surface did not commit");
      }
      const registry = committedRegistry;
      const update = updateSurface;
      expect(view.queryByRole("button")).toBeNull();

      act(() => registry.focus({ slot: "node", ownerId: "node-a" }));
      act(() => {
        update({
          ownershipKey: "day-a",
          reducedMotion: true,
          suspended: false,
          targetMounted: true,
        });
      });

      const button = view.getByRole("button");
      expect(document.activeElement).toBe(button);
      expect(scrollIntoView).toHaveBeenCalledExactlyOnceWith({
        block: "nearest",
        behavior: "auto",
      });
    } finally {
      restoreScrollIntoView();
    }
  });

  it("keeps all four callbacks stable per owner and ownership key", () => {
    const { result, rerender } = renderHook(
      ({ ownershipKey, reducedMotion }) =>
        useOwnerFocusRegistry(ownershipKey, reducedMotion),
      { initialProps: { ownershipKey: "day-a", reducedMotion: false } },
    );
    const callbacks = {
      node: result.current.nodeRef("node-a"),
      route: result.current.routeRef("route-a"),
      dialog: result.current.dialogRef("dialog-a"),
      trigger: result.current.disclosureTriggerRef("dialog-a"),
    };

    rerender({ ownershipKey: "day-a", reducedMotion: true });

    expect(result.current.nodeRef("node-a")).toBe(callbacks.node);
    expect(result.current.routeRef("route-a")).toBe(callbacks.route);
    expect(result.current.dialogRef("dialog-a")).toBe(callbacks.dialog);
    expect(result.current.disclosureTriggerRef("dialog-a")).toBe(callbacks.trigger);
    expect(result.current.nodeRef("node-b")).not.toBe(callbacks.node);

    rerender({ ownershipKey: "day-b", reducedMotion: true });

    expect(result.current.nodeRef("node-a")).not.toBe(callbacks.node);
    expect(result.current.routeRef("route-a")).not.toBe(callbacks.route);
    expect(result.current.dialogRef("dialog-a")).not.toBe(callbacks.dialog);
    expect(result.current.disclosureTriggerRef("dialog-a")).not.toBe(callbacks.trigger);
  });

  it("lets an old null callback unregister only its exact element", () => {
    const { result, rerender } = renderHook(
      ({ ownershipKey }) => useOwnerFocusRegistry(ownershipKey, false),
      { initialProps: { ownershipKey: "day-a" } },
    );
    const oldRef = result.current.nodeRef("shared-owner");
    const oldElement = focusableElement();
    act(() => {
      oldRef(oldElement.element);
    });

    rerender({ ownershipKey: "day-b" });
    const currentRef = result.current.nodeRef("shared-owner");
    const currentElement = focusableElement();
    act(() => {
      currentRef(currentElement.element);
      oldRef(null);
      result.current.focus({ slot: "node", ownerId: "shared-owner" });
    });

    expect(oldElement.focus).not.toHaveBeenCalled();
    expect(currentElement.focus).toHaveBeenCalledExactlyOnceWith({ preventScroll: true });

    currentElement.focus.mockClear();
    currentElement.scrollIntoView.mockClear();
    act(() => {
      currentRef(null);
      result.current.focus({ slot: "node", ownerId: "shared-owner" });
    });

    expect(currentElement.focus).not.toHaveBeenCalled();

    const laterElement = focusableElement();
    act(() => {
      currentRef(laterElement.element);
    });

    expect(laterElement.focus).toHaveBeenCalledExactlyOnceWith({ preventScroll: true });
  });

  it("scrolls node and route owners before focusing but never scrolls dialog owners", () => {
    const { result } = renderHook(() => useOwnerFocusRegistry("day-a", false));
    const node = focusableElement();
    const route = focusableElement();
    const dialog = focusableElement();
    const trigger = focusableElement();
    act(() => {
      result.current.nodeRef("node-a")(node.element);
      result.current.routeRef("route-a")(route.element);
      result.current.dialogRef("dialog-a")(dialog.element);
      result.current.disclosureTriggerRef("dialog-a")(trigger.element);
      result.current.focus({ slot: "node", ownerId: "node-a" });
      result.current.focus({ slot: "route", ownerId: "route-a" });
      result.current.focus({ slot: "dialog", ownerId: "dialog-a" });
      result.current.focus({ slot: "disclosure-trigger", ownerId: "dialog-a" });
    });

    expect(node.scrollIntoView).toHaveBeenCalledExactlyOnceWith({
      block: "nearest",
      behavior: "smooth",
    });
    expect(route.scrollIntoView).toHaveBeenCalledExactlyOnceWith({
      block: "nearest",
      behavior: "smooth",
    });
    expect(node.scrollIntoView.mock.invocationCallOrder[0]).toBeLessThan(
      node.focus.mock.invocationCallOrder[0] ?? Number.POSITIVE_INFINITY,
    );
    expect(route.scrollIntoView.mock.invocationCallOrder[0]).toBeLessThan(
      route.focus.mock.invocationCallOrder[0] ?? Number.POSITIVE_INFINITY,
    );
    expect(dialog.scrollIntoView).not.toHaveBeenCalled();
    expect(trigger.scrollIntoView).not.toHaveBeenCalled();
    for (const owner of [node, route, dialog, trigger]) {
      expect(owner.focus).toHaveBeenCalledExactlyOnceWith({ preventScroll: true });
    }
  });

  it("uses nonanimated scrolling after reduced motion changes without replacing refs", () => {
    const { result, rerender } = renderHook(
      ({ reducedMotion }) => useOwnerFocusRegistry("day-a", reducedMotion),
      { initialProps: { reducedMotion: false } },
    );
    const nodeRef = result.current.nodeRef("node-a");
    const node = focusableElement();
    act(() => {
      nodeRef(node.element);
    });

    rerender({ reducedMotion: true });
    act(() => result.current.focus({ slot: "node", ownerId: "node-a" }));

    expect(result.current.nodeRef("node-a")).toBe(nodeRef);
    expect(node.scrollIntoView).toHaveBeenCalledExactlyOnceWith({
      block: "nearest",
      behavior: "auto",
    });
  });

  it("keeps one pending request and fulfills only its matching slot and owner", () => {
    const { result } = renderHook(() => useOwnerFocusRegistry("day-a", false));
    const supersededNode = focusableElement();
    const requestedRoute = focusableElement();
    act(() => {
      result.current.focus({ slot: "node", ownerId: "node-a" });
      result.current.focus({ slot: "route", ownerId: "route-a" });
      result.current.nodeRef("node-a")(supersededNode.element);
    });

    expect(supersededNode.focus).not.toHaveBeenCalled();

    act(() => {
      result.current.routeRef("route-a")(requestedRoute.element);
    });

    expect(requestedRoute.focus).toHaveBeenCalledExactlyOnceWith({ preventScroll: true });
  });

  it("defers a future-owned request past current elements and fulfills it after the matching transition", () => {
    const { result, rerender } = renderHook(
      ({ ownershipKey }) => useOwnerFocusRegistry(ownershipKey, false),
      { initialProps: { ownershipKey: "day-a" } },
    );
    const current = focusableElement();
    act(() => {
      result.current.nodeRef("shared-owner")(current.element);
    });

    act(() => {
      result.current.focus({ slot: "node", ownerId: "shared-owner" }, "day-b");
    });

    expect(current.focus).not.toHaveBeenCalled();

    rerender({ ownershipKey: "day-b" });
    const next = focusableElement();
    act(() => {
      result.current.nodeRef("shared-owner")(next.element);
    });

    expect(current.focus).not.toHaveBeenCalled();
    expect(next.focus).toHaveBeenCalledExactlyOnceWith({ preventScroll: true });
  });

  it("cancels current-key and unrelated future requests on an ownership transition", () => {
    const { result, rerender } = renderHook(
      ({ ownershipKey }) => useOwnerFocusRegistry(ownershipKey, false),
      { initialProps: { ownershipKey: "day-a" } },
    );
    act(() => result.current.focus({ slot: "node", ownerId: "stale-current" }));

    rerender({ ownershipKey: "day-b" });
    const staleCurrent = focusableElement();
    act(() => {
      result.current.nodeRef("stale-current")(staleCurrent.element);
    });
    expect(staleCurrent.focus).not.toHaveBeenCalled();

    act(() => {
      result.current.focus({ slot: "route", ownerId: "unrelated-future" }, "day-d");
    });
    rerender({ ownershipKey: "day-c" });
    rerender({ ownershipKey: "day-d" });
    const unrelatedFuture = focusableElement();
    act(() => {
      result.current.routeRef("unrelated-future")(unrelatedFuture.element);
    });

    expect(unrelatedFuture.focus).not.toHaveBeenCalled();
  });

  it("treats a disconnected registration as absent until a connected match mounts", () => {
    const { result } = renderHook(() => useOwnerFocusRegistry("day-a", false));
    const disconnected = focusableElement(false);
    act(() => {
      result.current.nodeRef("node-a")(disconnected.element);
      result.current.focus({ slot: "node", ownerId: "node-a" });
    });

    expect(disconnected.focus).not.toHaveBeenCalled();

    const connected = focusableElement();
    act(() => {
      result.current.nodeRef("node-a")(connected.element);
    });

    expect(connected.focus).toHaveBeenCalledExactlyOnceWith({ preventScroll: true });
  });

  it("restores to the connected trigger before explicit and surface fallbacks", () => {
    const { result } = renderHook(() => useOwnerFocusRegistry("day-a", false));
    const trigger = focusableElement();
    const explicitFallback = focusableElement();
    const surface = focusableElement();
    act(() => {
      result.current.disclosureTriggerRef("dialog-a")(trigger.element);
      result.current.nodeRef("node-a")(explicitFallback.element);
      result.current.fallbackSurfaceRef(surface.element);
      result.current.restoreTrigger("dialog-a", { slot: "node", ownerId: "node-a" });
    });

    expect(trigger.focus).toHaveBeenCalledExactlyOnceWith({ preventScroll: true });
    expect(explicitFallback.focus).not.toHaveBeenCalled();
    expect(surface.focus).not.toHaveBeenCalled();
  });

  it("skips a removed trigger and restores through explicit then surface fallbacks", () => {
    const { result } = renderHook(() => useOwnerFocusRegistry("day-a", true));
    const removedTrigger = focusableElement();
    const routeFallback = focusableElement();
    const surface = focusableElement();
    const triggerRef = result.current.disclosureTriggerRef("dialog-a");
    act(() => {
      triggerRef(removedTrigger.element);
      result.current.routeRef("route-a")(routeFallback.element);
      result.current.fallbackSurfaceRef(surface.element);
      triggerRef(null);
      removedTrigger.element.remove();
      result.current.restoreTrigger("dialog-a", { slot: "route", ownerId: "route-a" });
    });

    expect(removedTrigger.focus).not.toHaveBeenCalled();
    expect(routeFallback.scrollIntoView).toHaveBeenCalledExactlyOnceWith({
      block: "nearest",
      behavior: "auto",
    });
    expect(routeFallback.focus).toHaveBeenCalledExactlyOnceWith({ preventScroll: true });
    expect(surface.focus).not.toHaveBeenCalled();

    routeFallback.element.remove();
    act(() => result.current.restoreTrigger("dialog-a", { slot: "route", ownerId: "route-a" }));

    expect(surface.focus).toHaveBeenCalledExactlyOnceWith({ preventScroll: true });
  });

  it("does nothing without a connected restoration target", () => {
    const { result } = renderHook(() => useOwnerFocusRegistry("day-a", false));
    const surface = focusableElement(false);
    act(() => {
      result.current.fallbackSurfaceRef(surface.element);
      result.current.restoreTrigger("missing", { slot: "node", ownerId: "missing" });
    });

    expect(surface.focus).not.toHaveBeenCalled();
  });

  it("cancels pending focus before restoration and through the explicit cancel method", () => {
    const { result } = renderHook(() => useOwnerFocusRegistry("day-a", false));
    const trigger = focusableElement();
    act(() => {
      result.current.focus({ slot: "node", ownerId: "pending-map-owner" });
      result.current.disclosureTriggerRef("dialog-a")(trigger.element);
      result.current.restoreTrigger("dialog-a");
    });
    const lateMapOwner = focusableElement();
    act(() => {
      result.current.nodeRef("pending-map-owner")(lateMapOwner.element);
    });

    expect(trigger.focus).toHaveBeenCalledExactlyOnceWith({ preventScroll: true });
    expect(lateMapOwner.focus).not.toHaveBeenCalled();

    const cancelledTarget: OwnerFocusTarget = { slot: "dialog", ownerId: "dialog-b" };
    act(() => {
      result.current.focus(cancelledTarget);
      result.current.cancelPendingFocus();
    });
    const lateDialog = focusableElement();
    act(() => {
      result.current.dialogRef("dialog-b")(lateDialog.element);
    });

    expect(lateDialog.focus).not.toHaveBeenCalled();
  });
});
