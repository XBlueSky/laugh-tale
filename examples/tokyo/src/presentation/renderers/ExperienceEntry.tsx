import type { RendererProps } from "../timeline/TimelineEntry";
import { bookingSummary } from "../timeline/TimelineEntry";

function absoluteDate(date: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${date}T00:00:00Z`));
}

export function ExperienceEntry({ node, state }: RendererProps) {
  if (node.kind !== "experience") {
    return null;
  }
  const booking = bookingSummary(node.booking);
  return (
    <span className="semantic-entry__body" data-semantic="experience">
      {state.dayDate === undefined ? null : (
        <time className="semantic-entry__meta" dateTime={state.dayDate}>
          {absoluteDate(state.dayDate)}
        </time>
      )}
      {node.payload.durationMinutes === undefined ? null : (
        <>{state.dayDate === undefined ? null : " · "}<span>{node.payload.durationMinutes} min</span></>
      )}
      {booking === undefined ? null : <>{state.dayDate === undefined && node.payload.durationMinutes === undefined ? null : " · "}<span>{booking}</span></>}
    </span>
  );
}
