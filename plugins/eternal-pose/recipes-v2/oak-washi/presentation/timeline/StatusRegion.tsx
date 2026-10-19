import type { TimelineNodeModel } from "@laugh-tale-island/react";
import { catalog } from "../copy/catalog.js";

export function ownerStateAttributes(states: TimelineNodeModel["states"]) {
  return { ...Object.fromEntries(states.map(state => [`data-${state}`, "true"])), "aria-current": states.includes("current") ? "step" as const : undefined };
}
export function StatusRegion({ states }: { states: TimelineNodeModel["states"] }) {
  // Selection/viewing already have pressed and highlighted states; unresolved
  // locations are explained alongside the place fact. Keep one travel state.
  const primary = (["skipped", "completed", "current", "next", "candidate"] as const).find(state => states.includes(state));
  return <span className="oak-row-status" data-scan="status" role="status">
    {primary && <span data-state={primary}>{catalog.status[primary]}</span>}
  </span>;
}
