import {
  isTerminalShoppingStatus,
  resolveShoppingStatus,
} from "../decisions/ShoppingStatusSelect";
import type { RendererProps } from "../timeline/TimelineEntry";

export function ShoppingEntry({ node, state }: RendererProps) {
  if (node.kind !== "shopping") {
    return null;
  }
  const completed = node.payload.items.filter((item) => {
    const status = resolveShoppingStatus(item, state.shoppingStatuses);
    return isTerminalShoppingStatus(status);
  }).length;
  const prioritizedItems = node.payload.items.filter(
    ({ priority }) => priority !== undefined,
  );
  return (
    <span
      className="semantic-entry__body"
      data-semantic="shopping"
      data-shopping-terminal-count={completed}
    >
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
