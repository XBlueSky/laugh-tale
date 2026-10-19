import type { ExperienceBindings, ProviderChannelStateModel } from "@laugh-tale-island/react";
import { catalog, locale } from "../copy/catalog.js";
import { InlineProviderState } from "../states/InlineProviderState.js";

export interface OakWashiMapSurfaceProps {
  provider: ProviderChannelStateModel;
  mapViewportRef: ExperienceBindings["layout"]["mapViewportRef"];
  onRetry?: () => void;
}

export function OakWashiMapSurface({ provider, mapViewportRef, onRetry }: OakWashiMapSurfaceProps) {
  return <>
    <div className="oak-map-content" ref={mapViewportRef} role="region" aria-label={catalog.accessibleNames.map} lang={locale} />
    <div className="oak-map-status"><InlineProviderState channel="map" state={provider} onRetry={onRetry} /></div>
  </>;
}
