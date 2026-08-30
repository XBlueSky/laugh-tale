import type { FatalErrorViewProps, LoadingViewProps, SetupRequiredViewProps } from "../../controllers/presentation-contract";

function copyFor(issue: SetupRequiredViewProps["issue"]): { code: string; title: string; instruction: string } {
  if (issue.kind === "trip-content") return { code: "CONTENT", title: "Trip content required", instruction: "Add real trip content, then reload." };
  if (issue.kind === "provider-key") return { code: "MAP KEY", title: "Map configuration required", instruction: "Set VITE_GOOGLE_MAPS_API_KEY, then restart the app." };
  return { code: "MAP LOAD", title: "Map unavailable", instruction: issue.reason.trim().length > 0 ? issue.reason : "Check the provider configuration, then reload." };
}

function SetupRequired({ issue }: SetupRequiredViewProps) {
  const copy = copyFor(issue);
  return <main className="instrument-state" data-state="setup-required"><section className="instrument-state__panel" role="alert" aria-labelledby="instrument-setup-title"><span className="instrument-state__code">{copy.code}</span><h1 id="instrument-setup-title">{copy.title}</h1><p>{copy.instruction}</p></section></main>;
}

function Loading({ kind }: LoadingViewProps) {
  return <main className="instrument-state instrument-state--loading" data-state="loading" data-loading-kind={kind} data-contract-state="loading" role="status" aria-label="Loading trip instrument"><section className="instrument-state__panel instrument-skeleton" aria-hidden="true"><span className="instrument-state__code">INITIALIZING DISPLAY</span><span /><span /><span /></section><span className="instrument-visually-hidden">Loading trip instrument</span></main>;
}

function FatalError({ actions }: FatalErrorViewProps) {
  return <main className="instrument-state" data-state="fatal-error"><section className="instrument-state__panel" role="alert" data-state="fatal" data-testid="fatal-presentation-error" aria-labelledby="instrument-fatal-title"><span className="instrument-state__code">RENDER</span><h1 id="instrument-fatal-title">Trip display unavailable</h1><p>Reload the local presentation.</p><button type="button" data-touch-target="44" onClick={actions.retry}>Retry</button></section></main>;
}

export const InstrumentStates = { SetupRequired, Loading, FatalError };
