import type { Trip, RouteMode } from "@laugh-tale-island/core";
import { syntheticTripV2 } from "../../../packages/testing/src/fixtures/synthetic-trip-v2.js";
import { oakWashiVisualCases } from "../../../packages/testing/src/fixtures/oak-washi-visual-cases.js";

export type VisualCase = (typeof oakWashiVisualCases)[number];
export type VisualVariant = VisualCase["variants"][number];

export function visualTrip(visualCase: VisualCase, variant: VisualVariant, fixtureOptions: { detailsScenario?: string | null; longDayRail?: boolean; overnightTiming?: boolean; unreviewedContent?: boolean; lodgingOnlyContent?: boolean } = {}): Trip {
  const trip = structuredClone(syntheticTripV2);
  trip.locale = "zh-Hant-TW";
  const day = trip.days[0];
  if (fixtureOptions.detailsScenario === "equivalent") {
    day.nodes.find(node => node.id === "node-shopping")!.title = "Blank field journal";
    trip.reservations[0].title = " Synthetic  workshop ";
  }
  if (fixtureOptions.detailsScenario === "long") {
    day.nodes.find(node => node.id === "node-dining")!.details = Array.from({ length: 12 }, (_, index) => `Authored dining detail ${index + 1}: retain this complete comparison context.`);
  }
  if (fixtureOptions.detailsScenario === "task") {
    day.nodes.find(node => node.id === "node-logistics")!.details = [
      "Complete the synthetic check-in and carry-on handoff.",
      "Synthetic departure process · before the flight",
    ];
  }
  if (fixtureOptions.detailsScenario === "browse") {
    trip.candidateGroups[0].mode = "browse";
    delete trip.candidateGroups[0].defaultOptionId;
  }
  // Synthetic authored facts, never a city/reference itinerary.
  trip.days.push({ id: "day-synthetic-two", date: "2042-03-05", title: "Second synthetic day", nodes: [{ ...structuredClone(day.nodes[5]), id: "node-second-day", dayId: "day-synthetic-two" }] });
  trip.endDate = "2042-03-05";
  if (fixtureOptions.longDayRail) {
    for (const date of ["2042-03-06", "2042-03-07", "2042-03-08", "2042-03-09", "2042-03-10", "2042-03-11", "2042-03-12", "2042-03-13", "2042-03-14", "2042-03-15", "2042-03-16"]) {
      const id = `day-long-rail-${date}`;
      trip.days.push({ id, date, title: `Extended synthetic day ${date}: complete authored title for the coastal gallery journey`, nodes: [{ ...structuredClone(day.nodes[5]), id: `node-long-rail-${date}`, dayId: id }] });
    }
    trip.endDate = "2042-03-16";
  }
  const provider = day.nodes[1].place!;
  provider.identity = { status: "resolved", coordinates: { lat: 10.005, lng: 20.005 }, providerReference: { provider: "synthetic", id: "provider-gate-alpha" } };
  const options = trip.candidateGroups[0].options;
  options[1].place!.identity = { status: "resolved", coordinates: { lat: 10.055, lng: 20.055 }, providerReference: { provider: "synthetic", id: "candidate-annex-b" } };
  day.nodes.push({ ...structuredClone(day.nodes[5]), id: "node-unresolved", title: "Unreviewed synthetic annex", timing: { certainty: "unknown" }, place: { name: "Unreviewed synthetic annex", certainty: "unverified", identity: { status: "unresolved", reason: "not-reviewed" } } });
  if (["experience-expanded-dense", "candidate-zoom-200"].includes(visualCase.id)) {
    day.title = "合成群島第一日：沿岸步道與工藝展示空間的完整行程";
    for (const node of day.nodes) node.title = `合成地點與行程說明：${node.title}，包含較長的繁體中文名稱與無障礙補充資訊`;
    options.forEach((option, index) => { option.title = `合成候選地點${index + 1}：河岸工藝展示空間與沿海閱讀室的比較選擇`; });
    for (let i = 0; i < 8; i++) day.nodes.push({ ...structuredClone(day.nodes[5]), id: `node-dense-${i}`, title: `合成延伸行程${i + 1}：較長的繁體中文展示空間與沿岸步道名稱`, timing: { certainty: "unknown" } });
  }
  if (visualCase.id === "route-state-matrix" || visualCase.id === "camera-adversarial") {
    const state = variant.scenario.state;
    const edge = trip.routes[0];
    edge.source = state === "authored-fallback" ? "manual" : "provider";
    edge.mode = (["walking", "transit", "driving", "flight", "unknown"].includes(state) ? state : "walking") as RouteMode;
    edge.durationMinutes = state === "authored-fallback" ? 12 : undefined;
    edge.navigation = state === "external" ? { origin: "Synthetic gate", destination: "Synthetic transfer" } : undefined;
  }
  if (visualCase.id === "opening-hours-matrix" && variant.scenario.state === "trip-timezone") trip.timezone = "America/New_York";
  if (fixtureOptions.overnightTiming) day.nodes.find(node => node.id === "node-sightseeing")!.timing = { start: "23:30", end: "01:15", dayOffset: 1, certainty: "suggested" };
  if (fixtureOptions.unreviewedContent || fixtureOptions.lodgingOnlyContent) {
    trip.days.splice(1);
    const resolvedBase = structuredClone(day.nodes.find(node => node.kind === "lodging")!.place);
    for (const node of day.nodes) {
      node.timing = { certainty: "unknown" };
      node.place = { name: node.title, certainty: "unverified", identity: { status: "unresolved", reason: "not-reviewed" } };
    }
    for (const option of options) if (option.place) {
      option.place.certainty = "unverified";
      option.place.identity = { status: "unresolved", reason: "not-reviewed" };
    }
    const base = day.nodes.find(node => node.kind === "lodging")!;
    base.payload = { role: "base" };
    if (fixtureOptions.lodgingOnlyContent) {
      base.place = resolvedBase;
      day.nodes = [base, day.nodes.find(node => node.id === "node-unresolved")!];
      trip.routes = [];
      trip.candidateGroups = [];
      trip.reservations = [];
      trip.endDate = day.date;
      return trip;
    }
    for (let index = 1; index <= 10; index++) {
      const date = `2042-03-${String(4 + index).padStart(2, "0")}`, dayId = `day-visit-${index}`;
      trip.days.push({ id: dayId, date, title: `Synthetic lodging visit ${index + 1}`, nodes: [{ ...structuredClone(base), id: `node-visit-${index}`, dayId }] });
    }
    trip.endDate = "2042-03-14";
  }
  if (fixtureOptions.longDayRail && visualCase.id === "experience-expanded-dense") {
    trip.days[1].nodes = Array.from({ length: 16 }, (_, index) => ({
      ...structuredClone(day.nodes[5]),
      id: `node-second-day-dense-${index}`,
      dayId: "day-synthetic-two",
      timing: { certainty: "unknown" },
    }));
  }
  return trip;
}
