import type { Coordinates } from "@laugh-tale-island/core";
export type UserLocationStatus = "idle" | "requesting" | "active" | "denied" | "unavailable";
export interface UserLocationController {
    status: UserLocationStatus;
    location: Coordinates | null;
    start: () => void;
    recenter: () => void;
    stop: () => void;
}
export declare function useUserLocation(onRecenter: () => void, geolocation?: Geolocation | undefined): UserLocationController;
