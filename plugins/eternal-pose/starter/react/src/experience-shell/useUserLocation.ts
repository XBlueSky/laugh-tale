import { useCallback, useEffect, useRef, useState } from "react";

import type { Coordinates } from "@laugh-tale/core";
import { USER_LOCATION_OWNER_ID } from "@laugh-tale/core";
import { type MapAdapter } from "@laugh-tale/core/browser";

export type UserLocationStatus =
  | "idle"
  | "requesting"
  | "active"
  | "denied"
  | "unavailable";

export interface UserLocationController {
  status: UserLocationStatus;
  label: string;
  location: Coordinates | null;
  start: () => void;
  recenter: () => void;
  stop: () => void;
}

interface ActiveWatch {
  id: number;
  generation: number;
  geolocation: Geolocation;
}

const STATUS_LABELS: Record<UserLocationStatus, string> = {
  idle: "Location off",
  requesting: "Requesting location",
  active: "Location active",
  denied: "Location permission denied",
  unavailable: "Location unavailable",
};

function browserGeolocation(): Geolocation | undefined {
  return typeof navigator === "undefined" ? undefined : navigator.geolocation;
}

function coordinatesFrom(position: GeolocationPosition): Coordinates | undefined {
  const lat = position.coords.latitude;
  const lng = position.coords.longitude;
  return Number.isFinite(lat) &&
    lat >= -90 &&
    lat <= 90 &&
    Number.isFinite(lng) &&
    lng >= -180 &&
    lng <= 180
    ? { lat, lng }
    : undefined;
}

export function useUserLocation(
  adapter: MapAdapter | null,
  geolocation: Geolocation | undefined = browserGeolocation(),
): UserLocationController {
  const adapterRef = useRef(adapter);
  const mountedRef = useRef(false);
  const generationRef = useRef(0);
  const watchRef = useRef<ActiveWatch | null>(null);
  const latestLocationRef = useRef<Coordinates | null>(null);
  const pendingFirstFocusRef = useRef<number | null>(null);
  const [status, setStatus] = useState<UserLocationStatus>("idle");
  const [location, setLocation] = useState<Coordinates | null>(null);

  useEffect(() => {
    adapterRef.current = adapter;
  }, [adapter]);

  const clearActiveWatch = useCallback((): void => {
    const active = watchRef.current;
    if (active !== null) {
      active.geolocation.clearWatch(active.id);
      watchRef.current = null;
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      generationRef.current += 1;
      pendingFirstFocusRef.current = null;
      clearActiveWatch();
    };
  }, [clearActiveWatch]);

  useEffect(() => {
    if (adapter === null || location === null || !mountedRef.current) {
      return;
    }
    adapter.setUserLocation(location);
    if (pendingFirstFocusRef.current === generationRef.current) {
      adapter.focus({ kind: "place", id: USER_LOCATION_OWNER_ID });
      pendingFirstFocusRef.current = null;
    }
  }, [adapter, location]);

  const start = useCallback((): void => {
    clearActiveWatch();
    const generation = generationRef.current + 1;
    generationRef.current = generation;
    pendingFirstFocusRef.current = generation;
    if (latestLocationRef.current !== null) {
      adapterRef.current?.setUserLocation(null);
    }
    latestLocationRef.current = null;
    setLocation(null);

    if (geolocation === undefined) {
      pendingFirstFocusRef.current = null;
      setStatus("unavailable");
      return;
    }

    setStatus("requesting");
    const failGeneration = (nextStatus: "denied" | "unavailable"): void => {
      if (!mountedRef.current || generationRef.current !== generation) {
        return;
      }
      const active = watchRef.current;
      if (active?.generation === generation) {
        active.geolocation.clearWatch(active.id);
        watchRef.current = null;
      }
      generationRef.current += 1;
      pendingFirstFocusRef.current = null;
      latestLocationRef.current = null;
      setLocation(null);
      adapterRef.current?.setUserLocation(null);
      setStatus(nextStatus);
    };

    try {
      const id = geolocation.watchPosition(
        (position) => {
          if (!mountedRef.current || generationRef.current !== generation) {
            return;
          }
          const nextLocation = coordinatesFrom(position);
          if (nextLocation === undefined) {
            failGeneration("unavailable");
            return;
          }
          latestLocationRef.current = nextLocation;
          setLocation(nextLocation);
          setStatus("active");
        },
        (error) => {
          failGeneration(error.code === 1 ? "denied" : "unavailable");
        },
        { enableHighAccuracy: true, maximumAge: 15_000, timeout: 15_000 },
      );
      if (generationRef.current === generation) {
        watchRef.current = { id, generation, geolocation };
      } else {
        geolocation.clearWatch(id);
      }
    } catch {
      failGeneration("unavailable");
    }
  }, [clearActiveWatch, geolocation]);

  const recenter = useCallback((): void => {
    if (latestLocationRef.current !== null) {
      adapterRef.current?.focus({
        kind: "place",
        id: USER_LOCATION_OWNER_ID,
      });
    }
  }, []);

  const stop = useCallback((): void => {
    clearActiveWatch();
    generationRef.current += 1;
    pendingFirstFocusRef.current = null;
    latestLocationRef.current = null;
    setLocation(null);
    adapterRef.current?.setUserLocation(null);
    setStatus("idle");
  }, [clearActiveWatch]);

  return {
    status,
    label: STATUS_LABELS[status],
    location,
    start,
    recenter,
    stop,
  };
}
