import { type TripControllerProps } from "@laugh-tale-island/react";
export type PresentationContractRole = "home" | "experience" | "loading" | "setup" | "fatal" | "day-choice" | "itinerary" | "map" | "timeline-node" | "timeline-route" | "logistics-group" | "logistics-child" | "candidate-group" | "candidate-option" | "progress-completion" | "progress-skipped" | "progress-shopping" | "sheet";
export type PresentationContractAction = "open-day" | "open-home" | "select-owner" | "select-route" | "open-navigation" | "restore-automatic" | "return-current" | "return-lodging" | "restore-full-day" | "retry-map" | "retry-route" | "retry-place" | "step-sheet-expand" | "step-sheet-collapse" | "begin-location" | "recenter-location" | "stop-location" | "reopen-candidate" | "preview-candidate" | "cancel-candidate" | "confirm-candidate" | "update-completion" | "update-skipped" | "update-shopping" | "reset-trip" | "reset-day" | "retry-setup" | "retry-fatal";
export interface PresentationDriver {
    query(role: PresentationContractRole, ownerId?: string): HTMLElement | null;
    get(role: PresentationContractRole, ownerId?: string): HTMLElement;
    all(role: PresentationContractRole): readonly HTMLElement[];
    ownerIds(role: PresentationContractRole): readonly string[];
    states(role: PresentationContractRole, ownerId: string): readonly string[];
    value(role: PresentationContractRole, ownerId?: string): string | null;
    selectedOwnerId(): string | null;
    activate(action: PresentationContractAction, ownerId?: string): void;
    settle(): Promise<void>;
    dispose(): void;
}
export declare function createPresentationDriver(container: HTMLElement): PresentationDriver;
export declare function renderTripContract(props: TripControllerProps): PresentationDriver;
