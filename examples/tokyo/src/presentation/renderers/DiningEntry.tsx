import type { RendererProps } from "../timeline/TimelineEntry";

export function DiningEntry({ node, state }: RendererProps) {
  if (node.kind !== "dining") {
    return null;
  }
  const choice =
    state.selectedCandidateId !== undefined
      ? `Selected · ${node.place?.name ?? node.title}`
      : node.payload.candidateGroupId !== undefined
        ? "Compare meal options"
        : `Planned · ${node.place?.name ?? node.title}`;
  const choiceState =
    state.selectedCandidateId !== undefined
      ? "committed"
      : node.payload.candidateGroupId !== undefined
        ? "available"
        : "planned";
  return (
    <span
      className="semantic-entry__body"
      data-semantic="dining"
      data-choice-state={choiceState}
    >
      <span className="semantic-entry__meta">{choice}</span>
      {node.payload.cuisine === undefined ? null : <>{" · "}<span>{node.payload.cuisine}</span></>}
    </span>
  );
}
