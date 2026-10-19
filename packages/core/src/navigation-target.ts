import type { Coordinates, PlaceRef, ProviderReference } from "./model.js";

export type NavigationTargetV2 =
  | {
      kind: "coordinates";
      label: string;
      coordinates: Coordinates;
    }
  | {
      kind: "provider-reference";
      label: string;
      providerReference: ProviderReference;
    };

function validCoordinates(value: unknown): value is Coordinates {
  if (typeof value !== "object" || value === null) return false;
  const { lat, lng } = value as { lat?: unknown; lng?: unknown };
  return (
    Number.isFinite(lat) &&
    (lat as number) >= -90 &&
    (lat as number) <= 90 &&
    Number.isFinite(lng) &&
    (lng as number) >= -180 &&
    (lng as number) <= 180
  );
}

function validProviderReference(value: unknown): value is ProviderReference {
  if (typeof value !== "object" || value === null) return false;
  const { provider, id } = value as { provider?: unknown; id?: unknown };
  return (
    typeof provider === "string" && provider.trim().length > 0 &&
    typeof id === "string" && id.trim().length > 0
  );
}

export function deriveNavigationTarget(
  place: PlaceRef | undefined,
  supportedProviders: readonly string[],
): NavigationTargetV2 | null {
  if (
    place === undefined ||
    typeof place.name !== "string" ||
    place.name.trim().length === 0 ||
    place.identity?.status !== "resolved"
  ) {
    return null;
  }

  const supported = new Set(
    supportedProviders.filter(
      (provider): provider is string => typeof provider === "string" && provider.trim().length > 0,
    ),
  );
  const reference = place.identity.providerReference;
  if (validProviderReference(reference) && supported.has(reference.provider)) {
    return {
      kind: "provider-reference",
      label: place.name,
      providerReference: { provider: reference.provider, id: reference.id },
    };
  }

  const coordinates = place.identity.coordinates;
  return validCoordinates(coordinates)
    ? { kind: "coordinates", label: place.name, coordinates: { lat: coordinates.lat, lng: coordinates.lng } }
    : null;
}
