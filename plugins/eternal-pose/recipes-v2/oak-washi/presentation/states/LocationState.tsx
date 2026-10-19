import type { LocationModel } from "@laugh-tale-island/react";
import { catalog, locale } from "../copy/catalog.js";

export function LocationState({ state }: { state: LocationModel }) {
  return <p role="status" lang={locale} className={`oak-inline-state oak-locale--${locale.startsWith("zh-Hant") ? "zh-hant" : "en"}`}>{state.status === "active" && !state.hasFix ? catalog.location.waitingForFix : catalog.location[state.status]}</p>;
}
