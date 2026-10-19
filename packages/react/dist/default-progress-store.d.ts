import { type ProgressStore } from "@laugh-tale-island/core/browser";
/** Called only inside the validated, Trip-ID-keyed owner. */
export declare function useDefaultProgressStore(tripId: string, injected?: ProgressStore): ProgressStore;
