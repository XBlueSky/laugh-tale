import type { RendererProps } from "../timeline/TimelineEntry";
import {
  arrivalSummary,
  bookingSummary,
} from "../timeline/TimelineEntry";

export function TransportEntry({ node }: RendererProps) {
  if (node.kind !== "transport") {
    return null;
  }
  const booking = bookingSummary(node.booking);
  const arrival = arrivalSummary(node.booking);
  return (
    <span className="semantic-entry__body" data-semantic="transport">
      <span className="semantic-entry__meta">{node.payload.mode}</span>
      {node.payload.plan === undefined ? null : (
        <>
          {" · "}
          <span className="semantic-entry__detail">{node.payload.plan}</span>
        </>
      )}
      {booking === undefined ? null : <>{" · "}<span>{booking}</span></>}
      {arrival === undefined ? null : <>{" · "}<span>{arrival}</span></>}
    </span>
  );
}
