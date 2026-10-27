/** Google-only operator declaration; equality does not verify cloud style bytes. */
export interface GoogleMapStyleConfiguration {
    mapId?: string;
    cloudStyleProfileId?: string;
}
export declare function normalizeGoogleMapStyle(input: unknown): GoogleMapStyleConfiguration | undefined;
