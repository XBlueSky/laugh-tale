import type { RendererProps } from "../timeline/TimelineEntry";
import {
  arrivalSummary,
  bookingSummary,
} from "../timeline/TimelineEntry";

export function TransferEntry({ node }: RendererProps) {
  if (node.kind !== "transfer") {
    return null;
  }
  const booking = bookingSummary(node.booking);
  const arrival = arrivalSummary(node.booking);
  return (
    <span className="semantic-entry__body" data-semantic="transfer">
      <span className="semantic-entry__meta">
        {node.payload.mode}
        {node.payload.terminal === undefined ? "" : ` · ${node.payload.terminal}`}
      </span>
      {booking === undefined ? null : <>{" · "}<span>{booking}</span></>}
      {arrival === undefined ? null : <>{" · "}<span>{arrival}</span></>}
    </span>
  );
}
