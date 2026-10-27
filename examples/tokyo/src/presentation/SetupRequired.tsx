import type { SetupIssue } from "../controllers/presentation-contract";

export type { SetupIssue } from "../controllers/presentation-contract";

export interface SetupRequiredProps {
  issue: SetupIssue;
}

export function SetupRequired({ issue }: SetupRequiredProps) {
  if (issue.kind === "trip-content") {
    return (
      <main data-testid="setup-required" data-setup-issue="trip-content">
        <h1>Trip content required</h1>
        <p>Add real trip content before using this site.</p>
        <p>The map provider has not been loaded.</p>
      </main>
    );
  }

  if (issue.kind === "provider-key") {
    return (
      <main data-testid="setup-required" data-setup-issue="provider-key">
        <h1>Map configuration required</h1>
        <p>Add VITE_GOOGLE_MAPS_API_KEY to your private .env.local file.</p>
        <p>No fake map is used as a production fallback.</p>
      </main>
    );
  }

  return (
    <main data-testid="setup-required" data-setup-issue="provider-load" role="alert">
      <h1>Map unavailable</h1>
      <p>{issue.reason}</p>
      <p>Check the key restrictions and Maps JavaScript API configuration, then reload.</p>
    </main>
  );
}
