function validCoordinates(value) {
    if (typeof value !== "object" || value === null)
        return false;
    const { lat, lng } = value;
    return (Number.isFinite(lat) &&
        lat >= -90 &&
        lat <= 90 &&
        Number.isFinite(lng) &&
        lng >= -180 &&
        lng <= 180);
}
function validProviderReference(value) {
    if (typeof value !== "object" || value === null)
        return false;
    const { provider, id } = value;
    return (typeof provider === "string" && provider.trim().length > 0 &&
        typeof id === "string" && id.trim().length > 0);
}
export function deriveNavigationTarget(place, supportedProviders) {
    if (place === undefined ||
        typeof place.name !== "string" ||
        place.name.trim().length === 0 ||
        place.identity?.status !== "resolved") {
        return null;
    }
    const supported = new Set(supportedProviders.filter((provider) => typeof provider === "string" && provider.trim().length > 0));
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
