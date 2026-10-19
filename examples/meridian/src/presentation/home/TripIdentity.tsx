import type { HomeModel } from "@laugh-tale-island/react";
import { catalog } from "../copy/catalog.js";

export function TripIdentity({ identity }: { identity: HomeModel["identity"] }) {
  return <header className="oak-home-identity">
    <h1>{identity.title}</h1>
    <p className="oak-home-dates"><span>{catalog.home.dates}</span> <time dateTime={identity.startDate}>{identity.startDate}</time> – <time dateTime={identity.endDate}>{identity.endDate}</time></p>
    {(identity.destinationLabel !== undefined || identity.travelerLabel !== undefined) && <dl className="oak-home-context">
      {identity.destinationLabel !== undefined && <div><dt>{catalog.home.destination}</dt><dd>{identity.destinationLabel}</dd></div>}
      {identity.travelerLabel !== undefined && <div><dt>{catalog.home.travelers}</dt><dd>{identity.travelerLabel}</dd></div>}
    </dl>}
  </header>;
}
