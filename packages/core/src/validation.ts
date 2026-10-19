import { Temporal } from "@js-temporal/polyfill";

import type {
  Booking,
  CandidateGroup,
  ChecklistItem,
  PlaceRef,
  Timing,
  Trip,
  TripNode,
} from "./model.js";

export interface ValidationIssue {
  code: string;
  path: string;
  message: string;
}

export interface ValidationResult {
  errors: ValidationIssue[];
  warnings: ValidationIssue[];
}

type IssueTarget = ValidationIssue[];

const TIMEZONE_VALIDATION_INSTANT = new Date("2000-01-01T00:00:00Z");

function addIssue(
  target: IssueTarget,
  code: string,
  path: string,
  message: string,
): void {
  target.push({ code, path, message });
}

function isNonBlank(value: string): boolean {
  return value.trim().length > 0;
}

function validateIdentifier(
  id: string,
  path: string,
  namespace: Set<string>,
  errors: IssueTarget,
): void {
  if (!isNonBlank(id)) {
    addIssue(errors, "BLANK_ID", path, "ID must contain a non-whitespace character.");
    return;
  }

  if (namespace.has(id)) {
    addIssue(errors, "DUPLICATE_ID", path, `ID ${JSON.stringify(id)} is already in use.`);
    return;
  }

  namespace.add(id);
}

function validateItineraryOwnerIdentifier(
  id: string,
  path: string,
  owners: Set<string>,
  errors: IssueTarget,
): void {
  if (!isNonBlank(id)) {
    addIssue(errors, "BLANK_ID", path, "ID must contain a non-whitespace character.");
    return;
  }
  if (owners.has(id)) {
    addIssue(errors, "DUPLICATE_OWNER_ID", path, `Owner ID ${JSON.stringify(id)} is already in use.`);
    return;
  }
  owners.add(id);
}

function validateIdReference(id: string, path: string, errors: IssueTarget): boolean {
  if (isNonBlank(id)) {
    return true;
  }

  addIssue(errors, "BLANK_ID", path, "ID reference must contain a non-whitespace character.");
  return false;
}

function isValidIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const year = Number(value.slice(0, 4));
  const month = Number(value.slice(5, 7));
  const day = Number(value.slice(8, 10));
  const parsed = new Date(0);
  parsed.setUTCHours(0, 0, 0, 0);
  parsed.setUTCFullYear(year, month - 1, day);

  return (
    parsed.getUTCFullYear() === year &&
    parsed.getUTCMonth() === month - 1 &&
    parsed.getUTCDate() === day
  );
}

function validateDate(value: string, path: string, errors: IssueTarget): boolean {
  if (isValidIsoDate(value)) {
    return true;
  }

  addIssue(errors, "INVALID_DATE", path, "Date must be a real calendar date in YYYY-MM-DD form.");
  return false;
}

function validateTiming(timing: Timing, path: string, errors: IssueTarget): void {
  const validTime = /^(?:[01]\d|2[0-3]):[0-5]\d$/;

  if (timing.start !== undefined && !validTime.test(timing.start)) {
    addIssue(errors, "INVALID_TIME", `${path}.start`, "Time must use 24-hour HH:mm form.");
  }
  if (timing.end !== undefined && !validTime.test(timing.end)) {
    addIssue(errors, "INVALID_TIME", `${path}.end`, "Time must use 24-hour HH:mm form.");
  }
  if (
    timing.dayOffset !== undefined &&
    (!Number.isInteger(timing.dayOffset) || timing.dayOffset < 0)
  ) {
    addIssue(
      errors,
      "INVALID_DAY_OFFSET",
      `${path}.dayOffset`,
      "Day offset must be a non-negative integer.",
    );
  }
  if (
    timing.start !== undefined &&
    timing.end !== undefined &&
    validTime.test(timing.start) &&
    validTime.test(timing.end) &&
    (timing.dayOffset ?? 0) === 0 &&
    timing.end < timing.start
  ) {
    addIssue(
      errors,
      "INVALID_TIME_RANGE",
      path,
      "End time cannot precede start time without a positive day offset.",
    );
  }
}

function isHttpsUrl(value: string): boolean {
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

function validateBooking(booking: Booking | undefined, path: string, errors: IssueTarget): void {
  if (booking === undefined) {
    return;
  }

  if (booking.url !== undefined && !isHttpsUrl(booking.url)) {
    addIssue(
      errors,
      "UNSAFE_BOOKING_URL",
      `${path}.url`,
      "Booking URL must be an absolute HTTPS URL.",
    );
  }

  if (
    booking.arrivalBufferMinutes !== undefined &&
    (!Number.isInteger(booking.arrivalBufferMinutes) || booking.arrivalBufferMinutes < 0)
  ) {
    addIssue(
      errors,
      "INVALID_ARRIVAL_BUFFER",
      `${path}.arrivalBufferMinutes`,
      "Arrival buffer must be a non-negative integer number of minutes.",
    );
  }
}

function validateLocale(value: unknown, errors: IssueTarget): void {
  if (typeof value !== "string" || !isNonBlank(value)) {
    addIssue(errors, "INVALID_LOCALE", "locale", "Locale must be a valid BCP 47 language tag.");
    return;
  }

  try {
    const canonical = Intl.getCanonicalLocales([value]);
    if (canonical.length !== 1 || canonical[0] !== value) {
      addIssue(
        errors,
        "NONCANONICAL_LOCALE",
        "locale",
        "Locale must use its canonical BCP 47 form.",
      );
    }
  } catch {
    addIssue(errors, "INVALID_LOCALE", "locale", "Locale must be a valid BCP 47 language tag.");
  }
}

function validateTimezone(value: unknown, errors: IssueTarget): void {
  if (
    typeof value !== "string" ||
    !isNonBlank(value) ||
    /^[+-]\d{2}(?::?\d{2})?$/.test(value.trim())
  ) {
    addIssue(errors, "INVALID_TIMEZONE", "timezone", "Timezone must be a valid IANA time zone.");
    return;
  }

  try {
    new Intl.DateTimeFormat("en", { timeZone: value }).format(TIMEZONE_VALIDATION_INSTANT);
    Temporal.Instant.from("2000-01-01T00:00:00Z").toZonedDateTimeISO(value);
  } catch {
    addIssue(errors, "INVALID_TIMEZONE", "timezone", "Timezone must be a valid IANA time zone.");
  }
}

function validateCoordinates(value: unknown, path: string, errors: IssueTarget): boolean {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    addIssue(errors, "INVALID_COORDINATE", path, "Coordinates must contain finite latitude and longitude.");
    return false;
  }
  const coordinates = value as { lat?: unknown; lng?: unknown };
  let valid = true;
  if (!Number.isFinite(coordinates.lat) || (coordinates.lat as number) < -90 || (coordinates.lat as number) > 90) {
    addIssue(errors, "INVALID_COORDINATE", `${path}.lat`, "Latitude must be finite and between -90 and 90.");
    valid = false;
  }
  if (!Number.isFinite(coordinates.lng) || (coordinates.lng as number) < -180 || (coordinates.lng as number) > 180) {
    addIssue(errors, "INVALID_COORDINATE", `${path}.lng`, "Longitude must be finite and between -180 and 180.");
    valid = false;
  }
  return valid;
}

function validatePlace(
  place: PlaceRef | undefined,
  path: string,
  errors: IssueTarget,
): void {
  if (place === undefined) {
    return;
  }
  const identity = place.identity as unknown;
  if (typeof identity !== "object" || identity === null) {
    addIssue(errors, "INVALID_PLACE_IDENTITY", `${path}.identity`, "Place identity must be resolved or unresolved.");
    return;
  }
  const record = identity as Record<string, unknown>;
  if (record.status === "unresolved") {
    const allowedReasons = new Set(["not-reviewed", "no-accepted-candidate", "ambiguous"]);
    const onlyUnresolvedFields = Object.keys(record).every((key) => key === "status" || key === "reason");
    if (!onlyUnresolvedFields || typeof record.reason !== "string" || !allowedReasons.has(record.reason)) {
      addIssue(errors, "INVALID_PLACE_IDENTITY", `${path}.identity`, "Unresolved place identity may contain only a valid reason.");
    }
    return;
  }
  if (record.status !== "resolved") {
    addIssue(errors, "INVALID_PLACE_IDENTITY", `${path}.identity`, "Place identity must be resolved or unresolved.");
    return;
  }

  const hasCoordinates = record.coordinates !== undefined;
  const coordinatesValid = hasCoordinates
    ? validateCoordinates(record.coordinates, `${path}.identity.coordinates`, errors)
    : false;
  const providerReference = record.providerReference;
  let providerValid = false;
  if (providerReference !== undefined) {
    if (typeof providerReference === "object" && providerReference !== null) {
      const { provider, id } = providerReference as { provider?: unknown; id?: unknown };
      providerValid =
        typeof provider === "string" && isNonBlank(provider) && typeof id === "string" && isNonBlank(id);
    }
    if (!providerValid) {
      addIssue(errors, "INVALID_PROVIDER_REFERENCE", `${path}.identity.providerReference`, "Provider reference requires nonblank provider and ID.");
    }
  }
  if (!coordinatesValid && !providerValid) {
    addIssue(errors, "INVALID_PLACE_IDENTITY", `${path}.identity`, "Resolved place identity requires valid coordinates or a provider reference.");
  }
}

function validateChecklist(
  checklist: ChecklistItem[] | undefined,
  path: string,
  ids: Set<string>,
  errors: IssueTarget,
): void {
  checklist?.forEach((item, index) => {
    validateIdentifier(item.id, `${path}[${index}].id`, ids, errors);
  });
}

function hasRequiredRoleCapability(node: Extract<TripNode, { kind: "custom" }>): boolean {
  const { capabilities, presentationRole } = node.payload;
  return presentationRole === "primary"
    ? capabilities.place === true
    : presentationRole === "journey"
      ? capabilities.place === true || capabilities.booking === true
      : presentationRole === "task"
        ? capabilities.completion === true || capabilities.shopping === true
        : false;
}

function validateCandidateGroup(
  group: CandidateGroup,
  index: number,
  candidateGroupIds: Set<string>,
  candidateOptionIds: Set<string>,
  itineraryOwners: Set<string>,
  nodeDayById: Map<string, string>,
  errors: IssueTarget,
): void {
  const path = `candidateGroups[${index}]`;
  validateIdentifier(group.id, `${path}.id`, candidateGroupIds, errors);
  validateIdReference(group.parentNodeId, `${path}.parentNodeId`, errors);

  if (!nodeDayById.has(group.parentNodeId)) {
    addIssue(
      errors,
      "UNKNOWN_CANDIDATE_PARENT",
      `${path}.parentNodeId`,
      "Candidate group parent must resolve to a trip node.",
    );
  }

  if (group.options.length === 0) {
    addIssue(errors, "EMPTY_CANDIDATE_GROUP", `${path}.options`, "Candidate group needs an option.");
  }

  const localOptionIds = new Set<string>();
  group.options.forEach((option, optionIndex) => {
    const optionPath = `${path}.options[${optionIndex}]`;
    validateIdentifier(option.id, `${optionPath}.id`, candidateOptionIds, errors);
    validateItineraryOwnerIdentifier(option.id, `${optionPath}.id`, itineraryOwners, errors);
    if (isNonBlank(option.id)) {
      localOptionIds.add(option.id);
    }
    validatePlace(option.place, `${optionPath}.place`, errors);
    validateBooking(option.booking, `${optionPath}.booking`, errors);
  });

  if (group.mode === "browse" && group.defaultOptionId !== undefined) {
    addIssue(
      errors,
      "BROWSE_DEFAULT_FORBIDDEN",
      `${path}.defaultOptionId`,
      "Browse candidate groups cannot declare a default option.",
    );
  }

  if (
    group.mode === "single" &&
    group.defaultOptionId !== undefined &&
    !localOptionIds.has(group.defaultOptionId)
  ) {
    addIssue(
      errors,
      "UNKNOWN_DEFAULT_OPTION",
      `${path}.defaultOptionId`,
      "Single candidate group default must resolve to one of its options.",
    );
  }
}

export function validateTrip(trip: Trip): ValidationResult {
  const errors: ValidationIssue[] = [];
  const warnings: ValidationIssue[] = [];
  const tripIds = new Set<string>();
  const dayIds = new Set<string>();
  const nodeIds = new Set<string>();
  const itineraryOwners = new Set<string>();
  const candidateGroupIds = new Set<string>();
  const candidateOptionIds = new Set<string>();
  const reservationIds = new Set<string>();
  const taskIds = new Set<string>();
  const checklistIds = new Set<string>();
  const shoppingItemIds = new Set<string>();
  const nodeDayById = new Map<string, string>();

  validateIdentifier(trip.id, "id", tripIds, errors);
  validateLocale(trip.locale, errors);
  const validStartDate = validateDate(trip.startDate, "startDate", errors);
  const validEndDate = validateDate(trip.endDate, "endDate", errors);
  if (validStartDate && validEndDate && trip.startDate > trip.endDate) {
    addIssue(errors, "INVALID_DATE_RANGE", "startDate", "Trip start date must not follow end date.");
  }

  validateTimezone(trip.timezone, errors);

  trip.days.forEach((day, dayIndex) => {
    const dayPath = `days[${dayIndex}]`;
    validateIdentifier(day.id, `${dayPath}.id`, dayIds, errors);
    if (day.routeLabel !== undefined && typeof day.routeLabel !== "string") {
      addIssue(errors, "INVALID_ROUTE_LABEL", `${dayPath}.routeLabel`, "Route label must be a string.");
    }
    const validDayDate = validateDate(day.date, `${dayPath}.date`, errors);
    if (
      validDayDate &&
      validStartDate &&
      validEndDate &&
      (day.date < trip.startDate || day.date > trip.endDate)
    ) {
      addIssue(
        errors,
        "DATE_OUTSIDE_TRIP",
        `${dayPath}.date`,
        "Day date must fall within the trip date range.",
      );
    }

    day.nodes.forEach((node, nodeIndex) => {
      const nodePath = `${dayPath}.nodes[${nodeIndex}]`;
      const hadNodeId = nodeIds.has(node.id);
      validateIdentifier(node.id, `${nodePath}.id`, nodeIds, errors);
      validateItineraryOwnerIdentifier(node.id, `${nodePath}.id`, itineraryOwners, errors);
      if (isNonBlank(node.id) && !hadNodeId) {
        nodeDayById.set(node.id, day.id);
      }

      validateIdReference(node.dayId, `${nodePath}.dayId`, errors);
      if (node.dayId !== day.id) {
        addIssue(
          errors,
          "NODE_DAY_MISMATCH",
          `${nodePath}.dayId`,
          "Node dayId must exactly match its containing day ID.",
        );
      }

      validateTiming(node.timing, `${nodePath}.timing`, errors);
      validatePlace(node.place, `${nodePath}.place`, errors);
      validateBooking(node.booking, `${nodePath}.booking`, errors);

      if (
        node.kind === "experience" &&
        node.timing.certainty === "fixed" &&
        node.booking?.status !== "confirmed"
      ) {
        addIssue(
          warnings,
          "FIXED_EXPERIENCE_WITHOUT_CONFIRMED_BOOKING",
          `${nodePath}.booking`,
          "A fixed experience should have a confirmed booking.",
        );
      }

      if (node.kind === "custom") {
        if (!isNonBlank(node.payload.customKind)) {
          addIssue(
            errors,
            "BLANK_CUSTOM_KIND",
            `${nodePath}.payload.customKind`,
            "Custom kind must be nonblank.",
          );
        }
        if (
          node.payload.presentationRole !== "primary" &&
          node.payload.presentationRole !== "journey" &&
          node.payload.presentationRole !== "task"
        ) {
          addIssue(
            errors,
            "INVALID_PRESENTATION_ROLE",
            `${nodePath}.payload.presentationRole`,
            "Custom presentationRole must be primary, journey, or task.",
          );
        }
        if (
          (node.payload.presentationRole === "primary" ||
            node.payload.presentationRole === "journey" ||
            node.payload.presentationRole === "task") &&
          !hasRequiredRoleCapability(node)
        ) {
          addIssue(
            errors,
            "INCOMPATIBLE_PRESENTATION_ROLE",
            `${nodePath}.payload.capabilities`,
            "Custom presentationRole requires a compatible capability.",
          );
        }
      }

      if (node.kind === "lodging" || node.kind === "logistics") {
        validateChecklist(
          node.payload.checklist,
          `${nodePath}.payload.checklist`,
          checklistIds,
          errors,
        );
      }
      if (node.kind === "shopping") {
        node.payload.items.forEach((item, itemIndex) => {
          validateIdentifier(
            item.id,
            `${nodePath}.payload.items[${itemIndex}].id`,
            shoppingItemIds,
            errors,
          );
          if (item.note !== undefined && typeof item.note !== "string") {
            addIssue(errors, "INVALID_SHOPPING_NOTE", `${nodePath}.payload.items[${itemIndex}].note`, "Shopping note must be a string.");
          }
        });
      }
    });
  });

  trip.routes.forEach((route, routeIndex) => {
    const routePath = `routes[${routeIndex}]`;
    validateItineraryOwnerIdentifier(route.id, `${routePath}.id`, itineraryOwners, errors);
    validateIdReference(route.dayId, `${routePath}.dayId`, errors);
    if (!dayIds.has(route.dayId)) {
      addIssue(errors, "UNKNOWN_DAY", `${routePath}.dayId`, "Route dayId must resolve to a day.");
    }

    const endpoints = ["fromNodeId", "toNodeId"] as const;
    endpoints.forEach((field) => {
      const endpoint = route[field];
      validateIdReference(endpoint, `${routePath}.${field}`, errors);
      if (nodeDayById.get(endpoint) !== route.dayId) {
        addIssue(
          errors,
          "UNKNOWN_ROUTE_ENDPOINT",
          `${routePath}.${field}`,
          "Route endpoint must resolve to a node on the route day.",
        );
      }
    });

    if (
      route.durationMinutes !== undefined &&
      (!Number.isFinite(route.durationMinutes) || route.durationMinutes < 0)
    ) {
      addIssue(
        errors,
        "INVALID_ROUTE_DURATION",
        `${routePath}.durationMinutes`,
        "Route duration must be finite and non-negative.",
      );
    }
    if (
      route.distanceMeters !== undefined &&
      (!Number.isFinite(route.distanceMeters) || route.distanceMeters < 0)
    ) {
      addIssue(
        errors,
        "INVALID_ROUTE_DISTANCE",
        `${routePath}.distanceMeters`,
        "Route distance must be finite and non-negative.",
      );
    }
  });

  const candidateGroupsByParent = new Map<string, CandidateGroup[]>();
  trip.candidateGroups.forEach((group, groupIndex) => {
    validateCandidateGroup(
      group,
      groupIndex,
      candidateGroupIds,
      candidateOptionIds,
      itineraryOwners,
      nodeDayById,
      errors,
    );
    const groups = candidateGroupsByParent.get(group.parentNodeId) ?? [];
    groups.push(group);
    candidateGroupsByParent.set(group.parentNodeId, groups);
  });

  trip.days.forEach((day, dayIndex) => {
    day.nodes.forEach((node, nodeIndex) => {
      const nodePath = `days[${dayIndex}].nodes[${nodeIndex}]`;
      if (node.optionality === "candidate" && !candidateGroupsByParent.has(node.id)) {
        addIssue(
          errors,
          "CANDIDATE_GROUP_REQUIRED",
          `${nodePath}.optionality`,
          "Candidate nodes must own a trip-level candidate group.",
        );
      }

      if (node.kind === "dining" && node.payload.candidateGroupId !== undefined) {
        const group = trip.candidateGroups.find(
          (candidateGroup) => candidateGroup.id === node.payload.candidateGroupId,
        );
        if (group === undefined || group.parentNodeId !== node.id) {
          addIssue(
            errors,
            "UNKNOWN_CANDIDATE_GROUP",
            `${nodePath}.payload.candidateGroupId`,
            "Dining candidateGroupId must resolve to a group owned by this node.",
          );
        }
      }
    });
  });

  trip.reservations.forEach((reservation, reservationIndex) => {
    const path = `reservations[${reservationIndex}]`;
    validateIdentifier(reservation.id, `${path}.id`, reservationIds, errors);
    validateIdReference(reservation.ownerId, `${path}.ownerId`, errors);
    if (!nodeDayById.has(reservation.ownerId) && !candidateOptionIds.has(reservation.ownerId)) {
      addIssue(
        errors,
        "UNKNOWN_RESERVATION_OWNER",
        `${path}.ownerId`,
        "Reservation owner must resolve to a node or candidate option.",
      );
    }
    validateBooking(reservation.booking, `${path}.booking`, errors);
  });

  trip.tasks.forEach((task, taskIndex) => {
    const path = `tasks[${taskIndex}]`;
    validateIdentifier(task.id, `${path}.id`, taskIds, errors);

    if (task.scope === "day") {
      if (task.dayId === undefined || !isNonBlank(task.dayId)) {
        addIssue(errors, "TASK_DAY_REQUIRED", `${path}.dayId`, "Day task requires a day ID.");
      } else if (!dayIds.has(task.dayId)) {
        addIssue(errors, "UNKNOWN_DAY", `${path}.dayId`, "Task dayId must resolve to a day.");
      }
    } else if (task.dayId !== undefined) {
      addIssue(
        errors,
        "TASK_DAY_FORBIDDEN",
        `${path}.dayId`,
        "Pretrip task cannot declare a day ID.",
      );
    }

    if (task.children?.length === 1) {
      addIssue(
        errors,
        "SINGLE_CHILD_TASK",
        `${path}.children`,
        "Nested task disclosure requires zero or at least two children.",
      );
    }
    validateChecklist(task.children, `${path}.children`, checklistIds, errors);
  });

  return { errors, warnings };
}

export function assertValidTrip(trip: Trip): void {
  const { errors } = validateTrip(trip);
  if (errors.length === 0) {
    return;
  }

  const details = errors
    .map((issue) => `${issue.code} at ${issue.path}: ${issue.message}`)
    .join("\n");
  throw new Error(`Trip validation failed:\n${details}`);
}
