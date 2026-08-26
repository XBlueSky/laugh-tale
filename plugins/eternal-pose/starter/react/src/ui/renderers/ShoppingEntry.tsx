import type { ShoppingStatus } from "../../trip-core/model";
import type { RendererProps } from "../timeline/TimelineEntry";

function itemStatus(
  item: Extract<RendererProps["node"], { kind: "shopping" }>["payload"]["items"][number],
  state: RendererProps["state"],
): ShoppingStatus {
  return state.shoppingStatuses[item.id] ?? item.initialStatus ?? "pending";
}

export function ShoppingEntry({ node, state }: RendererProps) {
  if (node.kind !== "shopping") {
    return null;
  }
  const completed = node.payload.items.filter((item) => {
    const status = itemStatus(item, state);
    return status === "purchased" || status === "skipped";
  }).length;
  const prioritizedItems = node.payload.items.filter(
    ({ priority }) => priority !== undefined,
  );
  return (
    <span className="semantic-entry__body" data-semantic="shopping">
      <span className="semantic-entry__meta">{node.place?.name ?? "Shopping stop"}</span>
      {" · "}
      <span>{completed} / {node.payload.items.length} complete</span>
      {prioritizedItems.map((item) => (
        <span key={item.id}>
          {" · "}
          <span>{item.priority === "must" ? "Must" : "Nice"} · {item.title}</span>
        </span>
      ))}
    </span>
  );
}
