import type { ProviderChannelStateModel } from "@laugh-tale-island/react";
import type { ProviderFailureReason } from "@laugh-tale-island/core";
import { catalog, locale } from "../copy/catalog.js";

const reasons = {
  "missing-configuration": catalog.provider.missingConfiguration,
  "loader-failed": catalog.provider.loaderFailed,
  "request-denied": catalog.provider.requestDenied,
  "not-found": catalog.provider.notFound,
  "malformed-response": catalog.provider.malformedResponse,
  "implausible-result": catalog.provider.implausibleResult,
  network: catalog.provider.network, cancelled: catalog.provider.cancelled, unsupported: catalog.provider.unsupported,
} satisfies Record<ProviderFailureReason, string>;

export interface InlineProviderStateProps {
  channel: "map" | "routes" | "places";
  state: ProviderChannelStateModel;
  onRetry?: () => void;
}

export function InlineProviderState({ channel, state, onRetry }: InlineProviderStateProps) {
  if (state.status === "idle" || state.status === "ready") return null;
  return <div className={`oak-inline-state oak-locale--${locale.startsWith("zh-Hant") ? "zh-hant" : "en"}`} lang={locale} data-provider-state={state.status}>
    <p role="status">{catalog.provider[channel]} · {catalog.provider[state.status]}{state.status === "unavailable" ? ` · ${reasons[state.reason]}` : ""}</p>
    {state.status === "unavailable" && state.retryable && onRetry && <button type="button" className="oak-control" onClick={onRetry}>{catalog.provider.retry}</button>}
  </div>;
}
