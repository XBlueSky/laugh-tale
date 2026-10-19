import { configureGoogleMaps } from "@laugh-tale-island/adapters/google";

globalThis.document.querySelector("button").addEventListener("click", async () => {
  const state = await configureGoogleMaps({
    apiKey: "set-at-runtime",
    development: true,
  });
  const result = state.status === "ready"
    ? { status: state.status, createMap: typeof state.createMap, adapter: typeof state.createMap().mount }
    : state;
  globalThis.document.querySelector("output").textContent = JSON.stringify(result);
});
