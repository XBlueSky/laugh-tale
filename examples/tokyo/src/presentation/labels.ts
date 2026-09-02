import type { UserLocationStatus } from "@laugh-tale-island/react";

export const USER_LOCATION_LABELS: Record<UserLocationStatus, string> = {
  idle: "Location off",
  requesting: "Requesting location",
  active: "Location active",
  denied: "Location permission denied",
  unavailable: "Location unavailable",
};

export const ROUTE_PROVIDER_UNAVAILABLE = "Route provider unavailable";

export function routeAdapterErrorReason(error: unknown): string {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }
  return ROUTE_PROVIDER_UNAVAILABLE;
}
