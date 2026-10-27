import {
  useCallback,
  useEffect,
  useEffectEvent,
  useRef,
  useState,
  type RefCallback,
} from "react";

import type {
  MapPadding,
  MapPresentation,
} from "@laugh-tale-island/core";
import type { MapAdapter } from "@laugh-tale-island/core/browser";

export type MapMountStatus = "mounting" | "ready" | "error";

interface UseMapLifecycleInput {
  adapter: MapAdapter;
  presentation: MapPresentation;
  padding: MapPadding;
  onPlaceSelect: (ownerId: string) => void;
  onRouteSelect: (routeId: string) => void;
  onPresentationRendered: (
    adapter: MapAdapter,
    presentation: MapPresentation,
  ) => void;
}

interface MapLifecycleController {
  ref: RefCallback<HTMLDivElement>;
  status: MapMountStatus;
  readyAdapter: MapAdapter | null;
  retry: () => void;
}

export function useMapLifecycle({
  adapter,
  presentation,
  padding,
  onPlaceSelect,
  onRouteSelect,
  onPresentationRendered,
}: UseMapLifecycleInput): MapLifecycleController {
  const [container, setContainer] = useState<HTMLDivElement | null>(null);
  const [status, setStatus] = useState<MapMountStatus>("mounting");
  const [mountAttempt, setMountAttempt] = useState(0);
  const readyRef = useRef(false);
  const emitPlaceSelect = useEffectEvent(onPlaceSelect);
  const emitRouteSelect = useEffectEvent(onRouteSelect);
  const emitPresentationRendered = useEffectEvent(onPresentationRendered);
  const renderCurrentPresentation = useEffectEvent((): void => {
    adapter.setPadding(padding);
    adapter.render(presentation);
    emitPresentationRendered(adapter, presentation);
  });

  const containerRef = useCallback<RefCallback<HTMLDivElement>>((element) => {
    setContainer(element);
  }, []);

  useEffect(() => {
    if (container === null) return;
    let active = true;
    let released = false;
    const release = (): void => {
      if (released) return;
      released = true;
      adapter.destroy();
    };

    readyRef.current = false;
    void adapter
      .mount(container, {
        onPlaceSelect: emitPlaceSelect,
        onRouteSelect: emitRouteSelect,
      })
      .then(() => {
        if (!active) return;
        readyRef.current = true;
        renderCurrentPresentation();
        setStatus("ready");
      })
      .catch(() => {
        if (!active) return;
        readyRef.current = false;
        release();
        setStatus("error");
      });

    return () => {
      active = false;
      readyRef.current = false;
      release();
    };
  }, [adapter, container, mountAttempt]);

  useEffect(() => {
    if (!readyRef.current) return;
    adapter.render(presentation);
    emitPresentationRendered(adapter, presentation);
  }, [adapter, presentation]);

  useEffect(() => {
    if (readyRef.current) adapter.setPadding(padding);
  }, [adapter, padding]);

  const retry = useCallback((): void => {
    setStatus("mounting");
    setMountAttempt((attempt) => attempt + 1);
  }, []);

  return {
    ref: containerRef,
    status,
    readyAdapter: status === "ready" ? adapter : null,
    retry,
  };
}
