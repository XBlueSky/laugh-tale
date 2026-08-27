import type { Coordinates } from "@laugh-tale/core";
import { type MapAdapter } from "@laugh-tale/core/browser";
export type UserLocationStatus = "idle" | "requesting" | "active" | "denied" | "unavailable";
export interface UserLocationController {
    status: UserLocationStatus;
    location: Coordinates | null;
    start: () => void;
    recenter: () => void;
    stop: () => void;
}
export declare function useUserLocation(adapter: MapAdapter | null, geolocation?: Geolocation | undefined): UserLocationController;
