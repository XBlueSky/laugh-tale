import type { FatalErrorModel, FatalErrorViewProps } from "@laugh-tale-island/react";
import { catalog, locale } from "../copy/catalog.js";

const fatalCopy = {
  "fatal.render": catalog.fatal.render,
  "fatal.state": catalog.fatal.state,
  "fatal.provider": catalog.fatal.provider,
} satisfies Record<FatalErrorModel["copyKey"], string>;

const retainedCopy = {
  home: catalog.fatal.homeRetained,
  itinerary: catalog.fatal.itineraryRetained,
  externalNavigation: catalog.fatal.externalNavigationRetained,
} as const;

export function OakWashiFatalError({ model, actions }: FatalErrorViewProps) {
  const retained = (Object.keys(retainedCopy) as (keyof typeof retainedCopy)[]).filter(key => model.retained[key]);
  return <main className={`oak-washi oak-state-view oak-fatal-error oak-locale--${locale.startsWith("zh-Hant") ? "zh-hant" : "en"}`} lang={locale} data-state="fatal-error" data-fatal-category={model.category}>
    <section className="oak-state-panel" aria-labelledby="oak-fatal-title">
      <h1 id="oak-fatal-title">{catalog.fatal.title}</h1>
      <p role="alert">{fatalCopy[model.copyKey]}</p>
      {retained.length > 0 && <ul className="oak-state-retained">{retained.map(key => <li key={key}>{retainedCopy[key]}</li>)}</ul>}
      {(model.capabilities.openHome || model.capabilities.retry) && <div className="oak-state-actions">
        {model.capabilities.openHome && <button type="button" className="oak-control" onClick={() => actions.openHome()}>{catalog.fatal.openHome}</button>}
        {model.capabilities.retry && <button type="button" className="oak-control" onClick={() => actions.retryFatal()}>{catalog.fatal.retry}</button>}
      </div>}
    </section>
  </main>;
}
