import type {
  FatalErrorViewProps,
  LoadingViewProps,
  SetupRequiredViewProps,
} from "../../controllers/presentation-contract";

function issueCopy(issue: SetupRequiredViewProps["issue"]): {
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
    instruction: issue.reason.trim().length > 0
      ? issue.reason
      : "Check the provider configuration, then reload.",
  };
}

function SetupRequired({ issue }: SetupRequiredViewProps) {
  const copy = issueCopy(issue);
  return (
    <main className="arcade-state" data-state="setup-required">
      <section className="arcade-state__panel" role="alert" aria-labelledby="arcade-setup-title">
        <span className="arcade-state__code">{copy.code}</span>
        <h1 id="arcade-setup-title">{copy.title}</h1>
        <p>{copy.instruction}</p>
      </section>
    </main>
  );
}

function Loading({ kind }: LoadingViewProps) {
  return (
    <main
      className="arcade-state arcade-state--loading"
      data-state="loading"
      data-loading-kind={kind}
      data-contract-state="loading"
      role="status"
      aria-label="Loading trip progress"
    >
      <section className="arcade-state__panel arcade-skeleton" aria-hidden="true">
        <span className="arcade-state__code">LOADING BOARD</span>
        <span />
        <span />
        <span />
      </section>
      <span className="arcade-visually-hidden">Loading trip progress</span>
    </main>
  );
}

function FatalError({ actions }: FatalErrorViewProps) {
  return (
    <main className="arcade-state" data-state="fatal-error">
      <section
        className="arcade-state__panel"
        role="alert"
        data-state="fatal"
        data-testid="fatal-presentation-error"
        aria-labelledby="arcade-fatal-title"
      >
        <span className="arcade-state__code">RENDER</span>
        <h1 id="arcade-fatal-title">Trip view unavailable</h1>
        <p>Reload the local presentation.</p>
        <button type="button" data-touch-target="44" onClick={actions.retry}>Retry</button>
      </section>
    </main>
  );
}

export const ArcadeStates = { SetupRequired, Loading, FatalError };
