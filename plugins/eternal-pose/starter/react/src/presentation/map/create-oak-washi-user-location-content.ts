import type { UserLocationContentFactory } from "@laugh-tale-island/core/browser";

export const createOakWashiUserLocationContent: UserLocationContentFactory = () => {
  const element = document.createElement("span");
  element.className = "oak-user-location";
  element.setAttribute("aria-hidden", "true");
  const halo = document.createElement("span");
  halo.className = "oak-location-halo";
  const core = document.createElement("span");
  core.className = "oak-location-core";
  element.append(halo, core);
  let disposed = false;
  return { element, update() { /* Coordinates belong exclusively to the map adapter. */ }, dispose() {
    if (disposed) return;
    disposed = true;
    element.replaceChildren();
    element.remove();
  } };
};
