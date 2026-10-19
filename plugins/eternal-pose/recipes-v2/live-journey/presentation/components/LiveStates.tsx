import type {
  FatalErrorViewProps,
  LoadingViewProps,
  SetupRequiredViewProps,
} from "../../controllers/presentation-contract";

function setupCopy(issue: SetupRequiredViewProps["issue"]): { code: string; title: string; instruction: string } {
  if (issue.kind === "trip-content") {
    return { code: "CONTENT", title: "Trip content required", instruction: "Add real trip content, then reload." };
  }
  if (issue.kind === "provider-key") {
    return { code: "MAP KEY", title: "Map configuration required", instruction: "Set VITE_GOOGLE_MAPS_API_KEY, then restart the app." };
  }
  return {
    code: "MAP LOAD",
    title: "Map unavailable",
    instruction: issue.reason.trim().length > 0 ? issue.reason : "Check the provider configuration, then reload.",
  };
}

function SetupRequired({ issue }: SetupRequiredViewProps) {
  const copy = setupCopy(issue);
  return (
    <main className="live-state" data-state="setup-required">
      <section className="live-state__panel" role="alert" aria-labelledby="live-setup-title">
        <span className="live-state__code">{copy.code}</span>
        <h1 id="live-setup-title">{copy.title}</h1>
        <p>{copy.instruction}</p>
      </section>
    </main>
  );
}

function Loading({ kind }: LoadingViewProps) {
  return (
    <main className="live-state live-state--loading" data-state="loading" data-loading-kind={kind} data-contract-state="loading" role="status" aria-label="Loading journey facts">
      <section className="live-state__panel live-skeleton" aria-hidden="true">
        <span className="live-state__code">READING JOURNEY</span>
        <span />
        <span />
        <span />
      </section>
      <span className="live-visually-hidden">Loading journey facts</span>
    </main>
  );
}

function FatalError({ actions }: FatalErrorViewProps) {
  return (
    <main className="live-state" data-state="fatal-error">
      <section className="live-state__panel" role="alert" data-state="fatal" data-testid="fatal-presentation-error" aria-labelledby="live-fatal-title">
        <span className="live-state__code">RENDER</span>
        <h1 id="live-fatal-title">Journey view unavailable</h1>
        <p>Reload the local presentation.</p>
        <button type="button" data-touch-target="44" onClick={actions.retry}>Retry</button>
      </section>
    </main>
  );
}

export const LiveStates = { SetupRequired, Loading, FatalError };
