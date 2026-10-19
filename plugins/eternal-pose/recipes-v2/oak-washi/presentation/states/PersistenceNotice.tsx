import type { PersistenceModel } from "@laugh-tale-island/react";
import { catalog, locale } from "../copy/catalog.js";

export function PersistenceNotice({ state }: { state: PersistenceModel }) {
  if (state.status === "persistent") return null;
  return <p role="status" lang={locale} className={`oak-inline-state oak-locale--${locale.startsWith("zh-Hant") ? "zh-hant" : "en"}`}>{catalog.persistence.memoryOnlyNotice}</p>;
}
