import type { RendererProps } from "../timeline/TimelineEntry";

export function LogisticsEntry({ node, state }: RendererProps) {
  if (node.kind !== "logistics") {
    return null;
  }
  const completedSteps = node.payload.checklist.filter(({ id }) =>
    state.completedChecklistIds.has(id),
  ).length;
  const singleStep = node.payload.checklist.length === 1
    ? node.payload.checklist[0]
    : undefined;
  return (
    <span className="semantic-entry__body" data-semantic="logistics">
      <span className="semantic-entry__meta">
        {state.completed ? "Completed" : "In progress"}
      </span>
      {" · "}
      <span>{completedSteps} / {node.payload.checklist.length} steps complete</span>
      {singleStep === undefined ? null : (
        <>
          {" · "}
          <span data-completed={state.completedChecklistIds.has(singleStep.id) ? "true" : "false"}>
            {singleStep.title}
          </span>
        </>
      )}
    </span>
  );
}
