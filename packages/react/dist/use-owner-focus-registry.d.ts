import { type RefCallback } from "react";
export type FocusRegistrySlot = "node" | "route" | "dialog" | "disclosure-trigger";
export type OwnerFocusTarget = {
    slot: "node";
    ownerId: string;
} | {
    slot: "route";
    ownerId: string;
} | {
    slot: "dialog";
    ownerId: string;
} | {
    slot: "disclosure-trigger";
    ownerId: string;
};
export interface OwnerFocusRegistry {
    nodeRef(ownerId: string): RefCallback<HTMLElement>;
    routeRef(ownerId: string): RefCallback<HTMLElement>;
    dialogRef(ownerId: string): RefCallback<HTMLElement>;
    disclosureTriggerRef(ownerId: string): RefCallback<HTMLElement>;
    fallbackSurfaceRef: RefCallback<HTMLElement>;
    focus(target: OwnerFocusTarget, nextOwnershipKey?: string): void;
    revealAndFocus(target: Extract<OwnerFocusTarget, {
        slot: "dialog";
    }>): void;
    reveal(this: void, target: Extract<OwnerFocusTarget, {
        slot: "node" | "route";
    }>, nextOwnershipKey?: string): void;
    restoreTrigger(ownerId: string, fallbackOwner?: Extract<OwnerFocusTarget, {
        slot: "node" | "route";
    }>): void;
    cancelPendingFocus(): void;
}
export declare function useOwnerFocusRegistry(ownershipKey: string, reducedMotion: boolean): OwnerFocusRegistry;
