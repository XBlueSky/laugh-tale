import type { SetupIssue, SetupRequiredViewProps } from "@laugh-tale-island/react";
import { catalog, locale } from "../copy/catalog.js";

const issueCopy = {
  "setup.missingTrip": catalog.setup.missingTrip,
  "setup.invalidTrip": catalog.setup.invalidTrip,
} satisfies Record<SetupIssue["copyKey"], string>;

export function OakWashiSetupRequired({ model, actions }: SetupRequiredViewProps) {
  return <main className={`oak-washi oak-state-view oak-setup-required oak-locale--${locale.startsWith("zh-Hant") ? "zh-hant" : "en"}`} lang={locale} data-state="setup-required">
    <section className="oak-state-panel" aria-labelledby="oak-setup-title">
      <h1 id="oak-setup-title">{catalog.setup.title}</h1>
      <ul className="oak-state-issues">
        {model.issues.map((issue, index) => <li key={`${issue.kind}-${index}`} data-setup-issue={issue.kind}>
          <p>{issueCopy[issue.copyKey]}</p>
          {issue.kind === "invalid-trip" && issue.paths.length > 0 && <ul className="oak-state-paths">{issue.paths.map((path, pathIndex) => <li key={`${path}-${pathIndex}`}><code>{path}</code></li>)}</ul>}
        </li>)}
      </ul>
      {model.capabilities.retry && <button type="button" className="oak-control" onClick={() => actions.retrySetup()}>{catalog.setup.retry}</button>}
    </section>
  </main>;
}
