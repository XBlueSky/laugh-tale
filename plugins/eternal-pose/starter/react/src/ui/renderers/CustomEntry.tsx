import type { ComponentType } from "react";

import type { TripNode } from "../../trip-core/model";
import type { RendererProps } from "../timeline/TimelineEntry";
import { DiningEntry } from "./DiningEntry";
import { ExperienceEntry } from "./ExperienceEntry";
import { LodgingEntry } from "./LodgingEntry";
import { LogisticsEntry } from "./LogisticsEntry";
import { ShoppingEntry } from "./ShoppingEntry";
import { SightseeingEntry } from "./SightseeingEntry";
import { TransferEntry } from "./TransferEntry";
import { TransportEntry } from "./TransportEntry";

export function CustomEntry({ node }: RendererProps) {
  if (node.kind !== "custom") {
    return null;
  }
  const capabilities = Object.entries(node.payload.capabilities)
    .filter(([, enabled]) => enabled)
    .map(([capability]) => `${capability[0]?.toUpperCase() ?? ""}${capability.slice(1)} enabled`);
  const fieldCount = Object.keys(node.payload.data).length;
  return (
    <span className="semantic-entry__body" data-semantic="custom">
      <span className="semantic-entry__meta">{node.payload.customKind}</span>
      {capabilities.map((capability) => (
        <span key={capability}> · <span>{capability}</span></span>
      ))}
      {" · "}
      <span>{fieldCount} declared {fieldCount === 1 ? "field" : "fields"}</span>
    </span>
  );
}

export const rendererRegistry = {
  transport: TransportEntry,
  transfer: TransferEntry,
  lodging: LodgingEntry,
  dining: DiningEntry,
  shopping: ShoppingEntry,
  sightseeing: SightseeingEntry,
  experience: ExperienceEntry,
  logistics: LogisticsEntry,
  custom: CustomEntry,
} satisfies Record<TripNode["kind"], ComponentType<RendererProps>>;

export function rendererFor(node: TripNode): ComponentType<RendererProps> {
  return rendererRegistry[node.kind] ?? CustomEntry;
}
