function valid(value, low, high) {
    return typeof value === "number" && Number.isFinite(value) && value >= low && value <= high;
}
export function normalizeProviderLocation(value) {
    if (typeof value !== "object" || value === null)
        return undefined;
    try {
        if (Array.isArray(value))
            return undefined;
        const record = value;
        const neutral = Object.hasOwn(record, "lat") || Object.hasOwn(record, "lng");
        const google = Object.hasOwn(record, "latitude") || Object.hasOwn(record, "longitude");
        if (neutral === google)
            return undefined;
        const lat = neutral ? record.lat : record.latitude;
        const lng = neutral ? record.lng : record.longitude;
        return valid(lat, -90, 90) && valid(lng, -180, 180) ? { lat, lng } : undefined;
    }
    catch {
        return undefined;
    }
}
