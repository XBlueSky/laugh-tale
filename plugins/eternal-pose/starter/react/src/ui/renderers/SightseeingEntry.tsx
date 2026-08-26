import type { RendererProps } from "../timeline/TimelineEntry";

export function SightseeingEntry({ node }: RendererProps) {
  if (node.kind !== "sightseeing") {
    return null;
  }
  const place = node.place?.name;
  const area = node.payload.area;
  const placeAndArea =
    place === undefined
      ? area
      : area === undefined
        ? place
        : `${place} · ${area}`;
  return (
    <span className="semantic-entry__body" data-semantic="sightseeing">
      {placeAndArea === undefined ? null : (
        <span className="semantic-entry__meta">{placeAndArea}</span>
      )}
      {node.optionality === "optional" ? <>{placeAndArea === undefined ? null : " · "}<span>Optional stop</span></> : null}
    </span>
  );
}
