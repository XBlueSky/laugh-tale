export { FakeMapAdapterV2 } from "./fakes/FakeMapAdapterV2.js";
export { alternateTestPresentation } from "./alternate-presentation.js";
export {
  createPresentationDriver,
  renderTripContract,
  type PresentationContractAction,
  type PresentationContractRole,
  type PresentationDriver,
} from "./presentation-driver.js";
export { FakeRouteAdapterV2 } from "./fakes/FakeRouteAdapterV2.js";
export { FakePlaceAdapterV2 } from "./fakes/FakePlaceAdapterV2.js";
export { FakeNavigationAdapterV2 } from "./fakes/FakeNavigationAdapterV2.js";
export { FakeProgressStore } from "./fakes/FakeProgressStore.js";
export { FakeClock, type FakeClockSnapshot } from "./fakes/FakeClock.js";
export { syntheticTripV2 } from "./fixtures/synthetic-trip-v2.js";
export { oakWashiVisualCases } from "./fixtures/oak-washi-visual-cases.js";
export { renderOakWashiCase } from "./visual/render-oak-washi-case.js";
export { adversarialRouteFixtures } from "./fixtures/adversarial-routes.js";
export { adversarialPlaceFixtures } from "./fixtures/adversarial-places.js";
export { createDeterministicLocaleSetup, type DeterministicLocaleSetup } from "./setups/deterministic-locale.js";
export { createDeterministicViewportSetup, type DeterministicViewportSetup } from "./setups/deterministic-viewport.js";
export {
  defineRouteAdapterV2Contract,
  type RouteAdapterV2ContractControl,
  type RouteAdapterV2ContractHarness,
  type RouteContractReadyCase,
} from "./contracts/route-adapter-v2.js";
export {
  definePlaceAdapterV2Contract,
  type PlaceAdapterV2ContractControl,
  type PlaceAdapterV2ContractHarness,
  type PlaceContractReadyCase,
} from "./contracts/place-adapter-v2.js";
export {
  defineMapAdapterV2Contract,
  type MapAdapterV2ContractBridge,
  type MapContractPlacement,
  type MapContractRoute,
  type MapContractRouteMutation,
} from "./contracts/map-adapter-v2.js";
