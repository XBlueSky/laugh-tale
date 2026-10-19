import type { ExperienceModel } from "@laugh-tale-island/react";

export interface MapCoverage {
  mapped: number;
  total: number;
  kind: "none" | "partial" | "complete";
}

export function summarizeMapCoverage(model: Pick<ExperienceModel, "timeline" | "map" | "candidates">): MapCoverage {
  const mappedOwners = new Set(model.map.presentation.markers
    .filter(marker => marker.markerMode === "numbered" && !marker.states.includes("candidate"))
    .map(marker => marker.ownerId));
  const candidateMarkers = new Set(model.map.presentation.markers
    .filter(marker => marker.markerMode === "numbered" && marker.states.includes("candidate"))
    .map(marker => marker.ownerId));
  for (const group of model.candidates) {
    if (group.open && group.options.some(option => candidateMarkers.has(option.id))) mappedOwners.add(group.parentOwnerId);
  }
  const primaryOwners = model.timeline.filter(entry => entry.kind === "node" && entry.role === "primary");
  const mapped = primaryOwners.filter(entry => mappedOwners.has(entry.ownerId)).length;
  const total = primaryOwners.length;
  return { mapped, total, kind: mapped === 0 ? "none" : mapped === total ? "complete" : "partial" };
}
