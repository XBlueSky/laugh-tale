import {
  useCallback,
  useInsertionEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  type RefCallback,
} from "react";

export type FocusRegistrySlot =
  | "node"
  | "route"
  | "dialog"
  | "disclosure-trigger";

export type OwnerFocusTarget =
  | { slot: "node"; ownerId: string }
  | { slot: "route"; ownerId: string }
  | { slot: "dialog"; ownerId: string }
  | { slot: "disclosure-trigger"; ownerId: string };

export interface OwnerFocusRegistry {
  nodeRef(ownerId: string): RefCallback<HTMLElement>;
  routeRef(ownerId: string): RefCallback<HTMLElement>;
  dialogRef(ownerId: string): RefCallback<HTMLElement>;
  disclosureTriggerRef(ownerId: string): RefCallback<HTMLElement>;
  fallbackSurfaceRef: RefCallback<HTMLElement>;
  focus(target: OwnerFocusTarget, nextOwnershipKey?: string): void;
  revealAndFocus(target: Extract<OwnerFocusTarget, { slot: "dialog" }>): void;
  reveal(this: void, target: Extract<OwnerFocusTarget, { slot: "node" | "route" }>, nextOwnershipKey?: string): void;
  restoreTrigger(
    ownerId: string,
    fallbackOwner?: Extract<OwnerFocusTarget, { slot: "node" | "route" }>,
  ): void;
  cancelPendingFocus(): void;
}

interface RegisteredElement {
  ownershipKey: string;
  element: HTMLElement;
}

type ElementRegistry = Record<
  FocusRegistrySlot,
  Map<string, RegisteredElement>
>;

interface PendingFocus {
  target: OwnerFocusTarget;
  ownershipKey: string;
  mode: "focus" | "reveal" | "reveal-and-focus";
}

interface CommittedFocusPolicy {
  ownershipKey: string;
  reducedMotion: boolean;
}

function createElementRegistry(): ElementRegistry {
  return {
    node: new Map(),
    route: new Map(),
    dialog: new Map(),
    "disclosure-trigger": new Map(),
  };
}

export function useOwnerFocusRegistry(
  ownershipKey: string,
  reducedMotion: boolean,
): OwnerFocusRegistry {
  const elementsByOwnershipRef = useRef(new Map<string, ElementRegistry>());
  const callbacksRef = useRef(new Map<string, RefCallback<HTMLElement>>());
  const fallbackElementRef = useRef<HTMLElement | null>(null);
  const pendingRef = useRef<PendingFocus | null>(null);
  const activeRef = useRef(true);
  const committedPolicyRef = useRef<CommittedFocusPolicy>({
    ownershipKey,
    reducedMotion,
  });

  const elementsFor = useCallback((key: string): ElementRegistry => {
    const existing = elementsByOwnershipRef.current.get(key);
    if (existing !== undefined) return existing;
    const created = createElementRegistry();
    elementsByOwnershipRef.current.set(key, created);
    return created;
  }, []);

  const focusElement = useCallback((
    target: OwnerFocusTarget,
    registered: RegisteredElement | undefined,
    expectedOwnershipKey: string,
    mode: PendingFocus["mode"] = "focus",
  ): boolean => {
    const policy = committedPolicyRef.current;
    if (
      !activeRef.current
      || expectedOwnershipKey !== policy.ownershipKey
      || registered?.ownershipKey !== expectedOwnershipKey
      || !registered.element.isConnected
    ) {
      return false;
    }

    if (target.slot === "node" || target.slot === "route" || mode === "reveal-and-focus") {
      registered.element.scrollIntoView?.({
        block: "nearest",
        behavior: policy.reducedMotion ? "auto" : "smooth",
      });
    }
    if (mode !== "reveal") registered.element.focus({ preventScroll: true });
    pendingRef.current = null;
    return true;
  }, []);

  useInsertionEffect(() => {
    const ownershipChanged =
      committedPolicyRef.current.ownershipKey !== ownershipKey;
    committedPolicyRef.current = { ownershipKey, reducedMotion };
    if (ownershipChanged) {
      for (const key of elementsByOwnershipRef.current.keys()) {
        if (key !== ownershipKey) elementsByOwnershipRef.current.delete(key);
      }
      if (pendingRef.current?.ownershipKey !== ownershipKey) {
        pendingRef.current = null;
      }
    }
  }, [ownershipKey, reducedMotion]);

  useLayoutEffect(() => {
    activeRef.current = true;
    return () => {
      activeRef.current = false;
      pendingRef.current = null;
      elementsByOwnershipRef.current.clear();
      fallbackElementRef.current = null;
    };
  }, []);

  useLayoutEffect(() => {
    const pending = pendingRef.current;
    if (pending?.ownershipKey !== ownershipKey) return;
    focusElement(
      pending.target,
      elementsByOwnershipRef.current
        .get(ownershipKey)?.[pending.target.slot]
        .get(pending.target.ownerId),
      ownershipKey,
      pending.mode,
    );
  }, [focusElement, ownershipKey, reducedMotion]);

  const refFor = useCallback((
    slot: FocusRegistrySlot,
    ownerId: string,
  ): RefCallback<HTMLElement> => {
    const callbackOwnershipKey = ownershipKey;
    const callbackKey = JSON.stringify([callbackOwnershipKey, slot, ownerId]);
    const cached = callbacksRef.current.get(callbackKey);
    if (cached !== undefined) return cached;

    let callbackElement: HTMLElement | null = null;
    const callback: RefCallback<HTMLElement> = (element) => {
      if (element === null) {
        const elements = elementsByOwnershipRef.current.get(
          callbackOwnershipKey,
        )?.[slot];
        const registered = elements?.get(ownerId);
        if (
          callbackElement !== null
          && registered?.ownershipKey === callbackOwnershipKey
          && registered.element === callbackElement
        ) {
          elements?.delete(ownerId);
        }
        callbackElement = null;
        return;
      }

      callbackElement = element;
      const elements = elementsFor(callbackOwnershipKey)[slot];
      const registered = { ownershipKey: callbackOwnershipKey, element };
      elements.set(ownerId, registered);
      const pending = pendingRef.current;
      if (
        pending?.ownershipKey === callbackOwnershipKey
        && pending.target.slot === slot
        && pending.target.ownerId === ownerId
      ) {
        focusElement(pending.target, registered, callbackOwnershipKey, pending.mode);
      }
    };

    callbacksRef.current.set(callbackKey, callback);
    return callback;
  }, [elementsFor, focusElement, ownershipKey]);

  const nodeRef = useCallback(
    (ownerId: string) => refFor("node", ownerId),
    [refFor],
  );
  const routeRef = useCallback(
    (ownerId: string) => refFor("route", ownerId),
    [refFor],
  );
  const dialogRef = useCallback(
    (ownerId: string) => refFor("dialog", ownerId),
    [refFor],
  );
  const disclosureTriggerRef = useCallback(
    (ownerId: string) => refFor("disclosure-trigger", ownerId),
    [refFor],
  );

  const fallbackSurfaceRef = useCallback<RefCallback<HTMLElement>>((element) => {
    fallbackElementRef.current = element;
  }, []);

  const request = useCallback((
    target: OwnerFocusTarget,
    mode: PendingFocus["mode"],
    nextOwnershipKey?: string,
  ): void => {
    if (!activeRef.current) return;
    const currentOwnershipKey = committedPolicyRef.current.ownershipKey;
    const requestedOwnershipKey = nextOwnershipKey ?? currentOwnershipKey;
    const registered = elementsByOwnershipRef.current
      .get(currentOwnershipKey)?.[target.slot]
      .get(target.ownerId);
    if (
      requestedOwnershipKey === currentOwnershipKey
      && focusElement(target, registered, requestedOwnershipKey, mode)
    ) {
      return;
    }
    pendingRef.current = {
      target: { ...target },
      ownershipKey: requestedOwnershipKey,
      mode,
    };
  }, [focusElement]);

  const focus = useCallback((target: OwnerFocusTarget, nextOwnershipKey?: string) => {
    request(target, "focus", nextOwnershipKey);
  }, [request]);
  const reveal = useCallback((target: Extract<OwnerFocusTarget, { slot: "node" | "route" }>, nextOwnershipKey?: string) => {
    request(target, "reveal", nextOwnershipKey);
  }, [request]);
  const revealAndFocus = useCallback((target: Extract<OwnerFocusTarget, { slot: "dialog" }>) => {
    request(target, "reveal-and-focus");
  }, [request]);

  const restoreTrigger = useCallback((
    ownerId: string,
    fallbackOwner?: Extract<OwnerFocusTarget, { slot: "node" | "route" }>,
  ): void => {
    pendingRef.current = null;
    const currentOwnershipKey = committedPolicyRef.current.ownershipKey;
    const currentElements = elementsByOwnershipRef.current.get(
      currentOwnershipKey,
    );
    const triggerTarget: OwnerFocusTarget = {
      slot: "disclosure-trigger",
      ownerId,
    };
    if (focusElement(
      triggerTarget,
      currentElements?.["disclosure-trigger"].get(ownerId),
      currentOwnershipKey,
    )) {
      return;
    }
    if (
      fallbackOwner !== undefined
      && focusElement(
        fallbackOwner,
        currentElements?.[fallbackOwner.slot].get(fallbackOwner.ownerId),
        currentOwnershipKey,
      )
    ) {
      return;
    }
    const fallback = fallbackElementRef.current;
    if (fallback?.isConnected) fallback.focus({ preventScroll: true });
  }, [focusElement]);

  const cancelPendingFocus = useCallback((): void => {
    pendingRef.current = null;
  }, []);

  return useMemo(() => ({
    nodeRef,
    routeRef,
    dialogRef,
    disclosureTriggerRef,
    fallbackSurfaceRef,
    focus,
    reveal,
    revealAndFocus,
    restoreTrigger,
    cancelPendingFocus,
  }), [
    nodeRef,
    routeRef,
    dialogRef,
    disclosureTriggerRef,
    fallbackSurfaceRef,
    focus,
    reveal,
    revealAndFocus,
    restoreTrigger,
    cancelPendingFocus,
  ]);
}
