import type {
  FatalErrorViewProps,
  LoadingViewProps,
  SetupRequiredViewProps,
} from "../../controllers/presentation-contract";

function setupMessage(issue: SetupRequiredViewProps["issue"]): {
  code: string;
  title: string;
  instruction: string;
} {
  if (issue.kind === "trip-content") {
    return {
      code: "CONTENT",
      title: "Trip content required",
      instruction: "Add real trip content, then reload.",
    };
  }
  if (issue.kind === "provider-key") {
    return {
      code: "MAP KEY",
      title: "Map configuration required",
      instruction: "Set VITE_GOOGLE_MAPS_API_KEY, then restart the app.",
    };
  }
  return {
    code: "MAP LOAD",
    title: "Map unavailable",
    instruction:
      issue.reason.trim().length > 0
        ? issue.reason
        : "Check the provider configuration, then reload.",
  };
}

function SetupRequired({ issue }: SetupRequiredViewProps) {
  const message = setupMessage(issue);
  return (
    <main className="atlas-state" data-state="setup-required">
      <section className="atlas-state__panel" role="alert" aria-labelledby="atlas-setup-title">
        <span className="atlas-state__code">{message.code}</span>
        <h1 id="atlas-setup-title">{message.title}</h1>
        <p>{message.instruction}</p>
      </section>
    </main>
  );
}

function Loading({ kind }: LoadingViewProps) {
  return (
    <main
      className="atlas-state atlas-state--loading"
      data-state="loading"
      data-loading-kind={kind}
      role="status"
      aria-label="Loading trip progress"
    >
      <section className="atlas-state__panel atlas-state__skeleton" aria-hidden="true">
        <span className="atlas-state__code">SYNC</span>
        <span />
        <span />
        <span />
      </section>
      <span className="atlas-visually-hidden">Loading trip progress</span>
    </main>
  );
}

function FatalError({ actions }: FatalErrorViewProps) {
  return (
    <main className="atlas-state" data-state="fatal">
      <section
        className="atlas-state__panel"
        role="alert"
        data-state="fatal"
        data-testid="fatal-presentation-error"
        aria-labelledby="atlas-fatal-title"
      >
        <span className="atlas-state__code">RENDER</span>
        <h1 id="atlas-fatal-title">Trip view unavailable</h1>
        <p>Reload the local presentation.</p>
        <button type="button" data-touch-target="44" onClick={actions.retry}>
          Retry
        </button>
      </section>
    </main>
  );
}

export const AtlasStates = { SetupRequired, Loading, FatalError };
