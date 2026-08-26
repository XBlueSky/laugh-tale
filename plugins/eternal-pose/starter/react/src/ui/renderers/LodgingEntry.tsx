import type { RendererProps } from "../timeline/TimelineEntry";

function baseLabel(position: RendererProps["state"]["position"]): string {
  if (position === "only") {
    return "Day start & end · Stay base";
  }
  if (position === "first") {
    return "Day start · Stay base";
  }
  if (position === "last") {
    return "Day end · Stay base";
  }
  return "Stay base";
}

export function LodgingEntry({ node, state }: RendererProps) {
  if (node.kind !== "lodging") {
    return null;
  }
  const role =
    node.payload.role === "base"
      ? baseLabel(state.position)
      : node.payload.role === "check-in"
        ? "Check in"
        : node.payload.role === "check-out"
          ? "Check out"
          : "Rest / drop off bags";
  return (
    <span className="semantic-entry__body" data-semantic="lodging">
      <span className="semantic-entry__meta">{role}</span>
      {node.place?.name === undefined ? null : <>{" · "}<span>{node.place.name}</span></>}
    </span>
  );
}
