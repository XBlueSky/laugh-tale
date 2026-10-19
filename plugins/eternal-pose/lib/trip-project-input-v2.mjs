import { canonicalizeJson } from "./canonical-json.mjs";
import { createPortablePlaceSearchQuery } from "./portable-enrichment-contract.mjs";

function fail(message) { throw new Error(message); }
function object(value, field) { if (value === null || typeof value !== "object" || Array.isArray(value)) fail(`${field} must be an object`); return value; }
function keys(value, allowed, field) { object(value, field); for (const key of Object.keys(value)) if (!allowed.includes(key)) fail(`unknown field ${field === "input" ? "" : `${field}.`}${key}`); }
function text(value, field) { if (typeof value !== "string" || value.trim() === "") fail(`${field} must be nonblank`); return value; }
function stringValue(value, field) { if (typeof value !== "string") fail(`${field} must be a string`); return value; }
function array(value, field) { if (!Array.isArray(value)) fail(`${field} must be an array`); return value; }
function freeze(value) { if (value && typeof value === "object") { for (const child of Object.values(value)) freeze(child); Object.freeze(value); } return value; }
function oneOf(value, values, field) { if (!values.includes(value)) fail(`${field} must be one of ${values.join(", ")}`); }
function optionalText(value, field) { if (value !== undefined) stringValue(value, field); }
function optionalNumber(value, field) { if (value !== undefined && !Number.isFinite(value)) fail(`${field} must be a finite number`); }
function stringArray(value, field) { array(value, field).forEach((item, index) => stringValue(item, `${field}[${index}]`)); }
function checklist(value, field) { array(value, field).forEach((item, index) => { object(item, `${field}[${index}]`); text(item.id, `${field}[${index}].id`); stringValue(item.title, `${field}[${index}].title`); }); }
function coordinates(value, field) {
  object(value, field);
  if (!Number.isFinite(value.lat) || !Number.isFinite(value.lng) || value.lat < -90 || value.lat > 90 || value.lng < -180 || value.lng > 180) fail(`${field} coordinates out of range`);
}
function booking(value, field) {
  object(value, field);
  oneOf(value.status, ["confirmed", "pending", "none"], `${field}.status`);
  optionalText(value.reference, `${field}.reference`); optionalText(value.url, `${field}.url`);
  optionalNumber(value.arrivalBufferMinutes, `${field}.arrivalBufferMinutes`);
}
function place(value, field) {
  object(value, field); stringValue(value.name, `${field}.name`);
  oneOf(value.certainty, ["confirmed", "suggested", "candidate", "unverified"], `${field}.certainty`);
  object(value.identity, `${field}.identity`);
  const identity = value.identity;
  if (identity.status === "unresolved") oneOf(identity.reason, ["not-reviewed", "no-accepted-candidate", "ambiguous"], `${field}.identity.reason`);
  else if (identity.status === "resolved") {
    if (identity.coordinates !== undefined) coordinates(identity.coordinates, `${field}.identity.coordinates`);
    if (identity.providerReference !== undefined) {
      object(identity.providerReference, `${field}.identity.providerReference`);
      text(identity.providerReference.provider, `${field}.identity.providerReference.provider`);
      text(identity.providerReference.id, `${field}.identity.providerReference.id`);
    }
    if (identity.coordinates === undefined && identity.providerReference === undefined) fail(`${field}.identity requires coordinates or providerReference`);
  } else fail(`${field}.identity.status invalid`);
}
function nodePayload(node, field) {
  const payload = object(node.payload, `${field}.payload`);
  switch (node.kind) {
    case "transport": oneOf(payload.mode, ["walking", "transit", "driving"], `${field}.payload.mode`); optionalText(payload.plan, `${field}.payload.plan`); break;
    case "transfer": oneOf(payload.mode, ["unknown", "flight", "rail", "bus"], `${field}.payload.mode`); optionalText(payload.terminal, `${field}.payload.terminal`); break;
    case "lodging": oneOf(payload.role, ["base", "check-in", "check-out", "return"], `${field}.payload.role`); if (payload.checklist !== undefined) checklist(payload.checklist, `${field}.payload.checklist`); break;
    case "dining": optionalText(payload.cuisine, `${field}.payload.cuisine`); optionalText(payload.candidateGroupId, `${field}.payload.candidateGroupId`); break;
    case "shopping": array(payload.items, `${field}.payload.items`).forEach((item, index) => {
      const itemField = `${field}.payload.items[${index}]`;
      object(item, itemField); text(item.id, `${itemField}.id`); stringValue(item.title, `${itemField}.title`);
      if (item.priority !== undefined) oneOf(item.priority, ["must", "nice"], `${itemField}.priority`);
      optionalText(item.note, `${itemField}.note`);
      if (item.initialStatus !== undefined) oneOf(item.initialStatus, ["pending", "purchased", "unavailable", "skipped"], `${itemField}.initialStatus`);
    }); break;
    case "sightseeing": optionalText(payload.area, `${field}.payload.area`); break;
    case "experience": optionalNumber(payload.durationMinutes, `${field}.payload.durationMinutes`); break;
    case "logistics": checklist(payload.checklist, `${field}.payload.checklist`); break;
    case "custom": {
      text(payload.customKind, `${field}.payload.customKind`);
      oneOf(payload.presentationRole, ["primary", "journey", "task"], `${field}.payload.presentationRole`);
      object(payload.capabilities, `${field}.payload.capabilities`);
      for (const [name, enabled] of Object.entries(payload.capabilities)) if (!["place", "booking", "choice", "completion", "shopping"].includes(name) || typeof enabled !== "boolean") fail(`${field}.payload.capabilities.${name} invalid`);
      object(payload.data, `${field}.payload.data`);
      for (const [name, datum] of Object.entries(payload.data)) if (!["string", "number", "boolean"].includes(typeof datum) || (typeof datum === "number" && !Number.isFinite(datum))) fail(`${field}.payload.data.${name} invalid`);
      break;
    }
    default: fail(`${field}.kind invalid`);
  }
}
function validateTripShape(trip) {
  for (const name of ["id", "timezone", "startDate", "endDate"]) text(trip[name], `trip.${name}`);
  stringValue(trip.title, "trip.title");
  for (const name of ["destinationLabel", "travelerLabel", "clockPlaceLabel"]) optionalText(trip[name], `trip.${name}`);
  array(trip.days, "trip.days").forEach((day, dayIndex) => {
    const field = `trip.days[${dayIndex}]`;
    object(day, field); text(day.id, `${field}.id`); text(day.date, `${field}.date`); stringValue(day.title, `${field}.title`);
    optionalText(day.summary, `${field}.summary`);
    optionalText(day.routeLabel, `${field}.routeLabel`);
    array(day.nodes, `${field}.nodes`).forEach((node, nodeIndex) => {
      const nodeField = `${field}.nodes[${nodeIndex}]`;
      object(node, nodeField); text(node.id, `${nodeField}.id`); text(node.dayId, `${nodeField}.dayId`); stringValue(node.title, `${nodeField}.title`);
      object(node.timing, `${nodeField}.timing`);
      oneOf(node.timing.certainty, ["fixed", "suggested", "unknown"], `${nodeField}.timing.certainty`);
      optionalText(node.timing.start, `${nodeField}.timing.start`); optionalText(node.timing.end, `${nodeField}.timing.end`);
      optionalNumber(node.timing.dayOffset, `${nodeField}.timing.dayOffset`);
      oneOf(node.optionality, ["core", "optional", "candidate"], `${nodeField}.optionality`);
      if (node.place !== undefined) place(node.place, `${nodeField}.place`);
      if (node.booking !== undefined) booking(node.booking, `${nodeField}.booking`);
      if (node.details !== undefined) stringArray(node.details, `${nodeField}.details`);
      nodePayload(node, nodeField);
    });
  });
  array(trip.routes, "trip.routes").forEach((route, index) => {
    const field = `trip.routes[${index}]`; object(route, field);
    for (const name of ["id", "dayId", "fromNodeId", "toNodeId"]) text(route[name], `${field}.${name}`);
    oneOf(route.mode, ["walking", "transit", "driving", "flight", "unknown"], `${field}.mode`);
    oneOf(route.source, ["manual", "provider", "recomposed"], `${field}.source`);
    oneOf(route.certainty, ["confirmed", "suggested", "candidate", "unverified"], `${field}.certainty`);
    optionalNumber(route.durationMinutes, `${field}.durationMinutes`); optionalNumber(route.distanceMeters, `${field}.distanceMeters`);
    optionalText(route.summary, `${field}.summary`);
    if (route.navigation !== undefined) { object(route.navigation, `${field}.navigation`); stringValue(route.navigation.origin, `${field}.navigation.origin`); stringValue(route.navigation.destination, `${field}.navigation.destination`); }
  });
  array(trip.candidateGroups, "trip.candidateGroups").forEach((group, index) => {
    const field = `trip.candidateGroups[${index}]`; object(group, field);
    text(group.id, `${field}.id`); text(group.parentNodeId, `${field}.parentNodeId`);
    oneOf(group.mode, ["single", "browse"], `${field}.mode`);
    optionalText(group.defaultOptionId, `${field}.defaultOptionId`);
    array(group.options, `${field}.options`).forEach((option, optionIndex) => {
      const optionField = `${field}.options[${optionIndex}]`; object(option, optionField);
      text(option.id, `${optionField}.id`); stringValue(option.title, `${optionField}.title`);
      if (option.place !== undefined) place(option.place, `${optionField}.place`);
      if (option.booking !== undefined) booking(option.booking, `${optionField}.booking`);
      if (option.metadata !== undefined) { object(option.metadata, `${optionField}.metadata`); for (const [name, datum] of Object.entries(option.metadata)) if (typeof datum !== "string") fail(`${optionField}.metadata.${name} must be a string`); }
    });
  });
  array(trip.reservations, "trip.reservations").forEach((reservation, index) => {
    const field = `trip.reservations[${index}]`; object(reservation, field);
    text(reservation.id, `${field}.id`); stringValue(reservation.title, `${field}.title`); text(reservation.ownerId, `${field}.ownerId`);
    booking(reservation.booking, `${field}.booking`);
  });
  array(trip.tasks, "trip.tasks").forEach((task, index) => {
    const field = `trip.tasks[${index}]`; object(task, field);
    text(task.id, `${field}.id`); stringValue(task.title, `${field}.title`); oneOf(task.scope, ["pretrip", "day"], `${field}.scope`);
    optionalText(task.dayId, `${field}.dayId`); optionalText(task.note, `${field}.note`);
    if (task.children !== undefined) checklist(task.children, `${field}.children`);
  });
}
function locale(value, field) {
  text(value, field);
  let canonical;
  try { canonical = Intl.getCanonicalLocales(value)[0]; } catch { fail(`${field} must be a canonical BCP-47 locale`); }
  if (canonical !== value) fail(`${field} must be a canonical BCP-47 locale`);
  return value;
}
function bias(value, field) {
  keys(value, ["center", "radiusMeters"], field);
  keys(value.center, ["lat", "lng"], `${field}.center`);
  const { lat, lng } = value.center;
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) fail(`${field}.center coordinates out of range`);
  if (!Number.isFinite(value.radiusMeters) || value.radiusMeters < 1 || value.radiusMeters > 50000) fail(`${field}.radiusMeters outside 1–50000`);
}
function query(value, ownerId, tripLocale) {
  keys(value, ["ownerId", "text", "locale", "regionCode", "locationBias", "maxCandidates"], "query");
  if (value.ownerId !== ownerId) fail("query ownerId must match owner");
  if (value.locale !== tripLocale) fail("query locale must match trip.locale");
  if (value.maxCandidates !== 3) fail("query maxCandidates must be 3");
  if (value.locationBias !== undefined) bias(value.locationBias, "query.locationBias");
  const normalized = createPortablePlaceSearchQuery(value);
  if (canonicalizeJson(normalized) !== canonicalizeJson(value)) fail("query must be normalized and complete");
  return normalized;
}

function validateAuthoredLocationEvidence(evidence, trip) {
  keys(evidence, ["schemaVersion", "sourceSha256", "entries"], "authored location evidence");
  if (evidence.schemaVersion !== 1) fail("authored location evidence schemaVersion must be 1");
  if (typeof evidence.sourceSha256 !== "string" || !/^[a-f0-9]{64}$/.test(evidence.sourceSha256)) fail("authored location evidence sourceSha256 must be lowercase SHA-256");
  const places = new Map();
  for (const day of trip.days) for (const node of day.nodes) places.set(`node:${node.id}`, node.place);
  for (const group of trip.candidateGroups) for (const option of group.options) places.set(`candidate:${option.id}`, option.place);
  const seen = new Set();
  array(evidence.entries, "authored location evidence.entries").forEach((entry, index) => {
    const field = `authored location evidence.entries[${index}]`;
    keys(entry, ["binding", "sourceTitle", "coordinates"], field);
    keys(entry.binding, ["kind", "id"], `${field}.binding`);
    oneOf(entry.binding.kind, ["node", "candidate"], `${field}.binding.kind`);
    text(entry.binding.id, `${field}.binding.id`);
    text(entry.sourceTitle, `${field}.sourceTitle`);
    coordinates(entry.coordinates, `${field}.coordinates`);
    const binding = `${entry.binding.kind}:${entry.binding.id}`;
    if (seen.has(binding)) fail(`authored location evidence duplicate binding ${binding}`);
    seen.add(binding);
    const place = places.get(binding);
    if (place?.identity?.status !== "resolved" ||
      place.identity.coordinates?.lat !== entry.coordinates.lat ||
      place.identity.coordinates?.lng !== entry.coordinates.lng) fail(`authored location evidence ${binding} must match a resolved place coordinate`);
  });
}

export function parseTripProjectInputV2(value) {
  const input = JSON.parse(canonicalizeJson(value));
  keys(input, ["schemaVersion", "trip", "setupLocale", "enrichmentPolicy", "placeOwners", "authoredLocationEvidence"], "input");
  if (input.schemaVersion !== 2) fail("schemaVersion must be 2");
  if (input.trip === null) {
    if (input.authoredLocationEvidence !== undefined) fail("empty trip cannot carry authored location evidence");
    locale(input.setupLocale, "setupLocale");
    if (input.enrichmentPolicy !== null || array(input.placeOwners, "placeOwners").length !== 0) fail("empty trip requires null policy and zero owners");
    return freeze(input);
  }
  if (Object.hasOwn(input, "setupLocale")) fail("setupLocale is allowed only when trip is null");
  const trip = object(input.trip, "trip");
  validateTripShape(trip);
  if (input.authoredLocationEvidence !== undefined) validateAuthoredLocationEvidence(input.authoredLocationEvidence, trip);
  locale(trip.locale, "trip.locale");
  const nodeIds = new Set(); const candidateIds = new Set();
  for (const day of array(trip.days, "trip.days")) {
    object(day, "trip.day"); text(day.id, "trip.day.id");
    for (const node of array(day.nodes, "trip.day.nodes")) {
      object(node, "trip.node"); text(node.id, "trip.node.id");
      if (nodeIds.has(node.id)) fail("duplicate node id");
      nodeIds.add(node.id);
    }
  }
  for (const group of array(trip.candidateGroups, "trip.candidateGroups")) {
    object(group, "trip.candidateGroup");
    for (const option of array(group.options, "trip.candidateGroup.options")) {
      object(option, "trip.candidate"); text(option.id, "trip.candidate.id");
      if (candidateIds.has(option.id)) fail("duplicate candidate id");
      candidateIds.add(option.id);
    }
  }
  for (const name of ["routes", "reservations", "tasks"]) array(trip[name], `trip.${name}`);
  if (input.enrichmentPolicy !== null) {
    const policy = input.enrichmentPolicy;
    keys(policy, ["provider", "regionCode", "locationBias"], "enrichmentPolicy");
    if (policy.provider !== "google" || !/^[A-Z]{2}$/.test(policy.regionCode)) fail("enrichmentPolicy requires google and a two-letter regionCode");
    bias(policy.locationBias, "enrichmentPolicy.locationBias");
  }
  const ownerIds = new Set(); const bindingIds = new Set();
  for (const owner of array(input.placeOwners, "placeOwners")) {
    keys(owner, ["ownerId", "source", "query", "bindings"], "placeOwner");
    text(owner.ownerId, "placeOwner.ownerId"); text(owner.source, "placeOwner.source");
    if (ownerIds.has(owner.ownerId)) fail("duplicate owner ID");
    ownerIds.add(owner.ownerId);
    owner.query = query(owner.query, owner.ownerId, trip.locale);
    if (array(owner.bindings, "bindings").length === 0) fail("owner requires a binding");
    const localBindings = new Set();
    for (const binding of owner.bindings) {
      keys(binding, ["kind", "id"], "binding"); text(binding.id, "binding.id");
      if (binding.kind !== "node" && binding.kind !== "candidate") fail("binding.kind must be node or candidate");
      const identity = `${binding.kind}:${binding.id}`;
      if (localBindings.has(identity)) fail("duplicate binding");
      if (bindingIds.has(identity)) fail("binding used by two owners");
      localBindings.add(identity); bindingIds.add(identity);
      if (binding.kind === "node" && !nodeIds.has(binding.id)) fail("missing referenced node ID");
      if (binding.kind === "candidate" && !candidateIds.has(binding.id)) fail("missing referenced candidate ID");
    }
  }
  return freeze(input);
}

export function emptyTripProjectInputV2(setupLocale) {
  return parseTripProjectInputV2({ schemaVersion: 2, trip: null, setupLocale, enrichmentPolicy: null, placeOwners: [] });
}
