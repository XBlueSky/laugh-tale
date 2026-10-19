import type { LoadingViewProps } from "@laugh-tale-island/react";
import { preload } from "react-dom";
import { catalog, locale } from "../copy/catalog.js";

export function OakWashiLoading({ model }: LoadingViewProps) {
  if (model.operation === "progress" && model.owner.kind === "surface" && model.owner.id === "home") {
    preload(new URL("../assets/oak-washi-cartography.webp", import.meta.url).href, { as: "image", fetchPriority: "high" });
  }
  const shape = model.owner.kind === "surface" ? model.owner.id : "owner";
  return <main
    className={`oak-washi oak-state-view oak-loading oak-loading--${shape} oak-locale--${locale.startsWith("zh-Hant") ? "zh-hant" : "en"}`}
    lang={locale}
    aria-busy="true"
    data-state="loading"
    data-loading-operation={model.operation}
    data-loading-owner={`${model.owner.kind}:${model.owner.id}`}
  >
    <section className="oak-state-panel" aria-labelledby="oak-loading-title">
      <h1 id="oak-loading-title">{catalog.loading.title}</h1>
      <p role="status">{catalog.loading[model.operation]}</p>
      <div className="oak-loading-skeleton" data-loading-shape={shape} aria-hidden="true">
        <span className="oak-loading-rule oak-loading-rule--strong" />
        <span className="oak-loading-rule" />
        {shape !== "owner" && <span className="oak-loading-field" />}
      </div>
    </section>
  </main>;
}
