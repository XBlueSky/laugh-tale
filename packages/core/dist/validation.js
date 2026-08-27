function addIssue(target, code, path, message) {
    target.push({ code, path, message });
}
function isNonBlank(value) {
    return value.trim().length > 0;
}
function validateIdentifier(id, path, namespace, errors) {
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
function validateIdReference(id, path, errors) {
    if (isNonBlank(id)) {
        return true;
    }
    addIssue(errors, "BLANK_ID", path, "ID reference must contain a non-whitespace character.");
    return false;
}
function isValidIsoDate(value) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
        return false;
    }
    const year = Number(value.slice(0, 4));
    const month = Number(value.slice(5, 7));
    const day = Number(value.slice(8, 10));
    const parsed = new Date(0);
    parsed.setUTCHours(0, 0, 0, 0);
    parsed.setUTCFullYear(year, month - 1, day);
    return (parsed.getUTCFullYear() === year &&
        parsed.getUTCMonth() === month - 1 &&
        parsed.getUTCDate() === day);
}
function validateDate(value, path, errors) {
    if (isValidIsoDate(value)) {
        return true;
    }
    addIssue(errors, "INVALID_DATE", path, "Date must be a real calendar date in YYYY-MM-DD form.");
    return false;
}
function validateTiming(timing, path, errors) {
    const validTime = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
    if (timing.start !== undefined && !validTime.test(timing.start)) {
        addIssue(errors, "INVALID_TIME", `${path}.start`, "Time must use 24-hour HH:mm form.");
    }
    if (timing.end !== undefined && !validTime.test(timing.end)) {
        addIssue(errors, "INVALID_TIME", `${path}.end`, "Time must use 24-hour HH:mm form.");
    }
    if (timing.dayOffset !== undefined &&
        (!Number.isInteger(timing.dayOffset) || timing.dayOffset < 0)) {
        addIssue(errors, "INVALID_DAY_OFFSET", `${path}.dayOffset`, "Day offset must be a non-negative integer.");
    }
    if (timing.start !== undefined &&
        timing.end !== undefined &&
        validTime.test(timing.start) &&
        validTime.test(timing.end) &&
        (timing.dayOffset ?? 0) === 0 &&
        timing.end < timing.start) {
        addIssue(errors, "INVALID_TIME_RANGE", path, "End time cannot precede start time without a positive day offset.");
    }
}
function isHttpsUrl(value) {
    try {
        return new URL(value).protocol === "https:";
    }
    catch {
        return false;
    }
}
function validateBooking(booking, path, errors) {
    if (booking === undefined) {
        return;
    }
    if (booking.url !== undefined && !isHttpsUrl(booking.url)) {
        addIssue(errors, "UNSAFE_BOOKING_URL", `${path}.url`, "Booking URL must be an absolute HTTPS URL.");
    }
    if (booking.arrivalBufferMinutes !== undefined &&
        (!Number.isInteger(booking.arrivalBufferMinutes) || booking.arrivalBufferMinutes < 0)) {
        addIssue(errors, "INVALID_ARRIVAL_BUFFER", `${path}.arrivalBufferMinutes`, "Arrival buffer must be a non-negative integer number of minutes.");
    }
}
function validatePlace(place, path, errors, warnings) {
    if (place === undefined) {
        return;
    }
    const { coordinates } = place;
    if (coordinates !== undefined) {
        if (!Number.isFinite(coordinates.lat) || coordinates.lat < -90 || coordinates.lat > 90) {
            addIssue(errors, "INVALID_COORDINATE", `${path}.coordinates.lat`, "Latitude must be finite and between -90 and 90.");
        }
        if (!Number.isFinite(coordinates.lng) || coordinates.lng < -180 || coordinates.lng > 180) {
            addIssue(errors, "INVALID_COORDINATE", `${path}.coordinates.lng`, "Longitude must be finite and between -180 and 180.");
        }
    }
    const placeId = place.provider?.placeId;
    if (placeId !== undefined && !isNonBlank(placeId)) {
        addIssue(errors, "BLANK_PROVIDER_PLACE_ID", `${path}.provider.placeId`, "Provider Place ID must be omitted or nonblank.");
    }
    if (coordinates === undefined && (placeId === undefined || !isNonBlank(placeId))) {
        addIssue(warnings, "UNRESOLVED_PLACE", path, "Place has neither coordinates nor a provider Place ID.");
    }
}
function validateChecklist(checklist, path, ids, errors) {
    checklist?.forEach((item, index) => {
        validateIdentifier(item.id, `${path}[${index}].id`, ids, errors);
    });
}
function hasDeclaredCapability(node) {
    return Object.values(node.payload.capabilities).some((enabled) => enabled === true);
}
function validateCandidateGroup(group, index, candidateGroupIds, candidateOptionIds, nodeDayById, errors, warnings) {
    const path = `candidateGroups[${index}]`;
    validateIdentifier(group.id, `${path}.id`, candidateGroupIds, errors);
    validateIdReference(group.parentNodeId, `${path}.parentNodeId`, errors);
    if (!nodeDayById.has(group.parentNodeId)) {
        addIssue(errors, "UNKNOWN_CANDIDATE_PARENT", `${path}.parentNodeId`, "Candidate group parent must resolve to a trip node.");
    }
    if (group.options.length === 0) {
        addIssue(errors, "EMPTY_CANDIDATE_GROUP", `${path}.options`, "Candidate group needs an option.");
    }
    const localOptionIds = new Set();
    group.options.forEach((option, optionIndex) => {
        const optionPath = `${path}.options[${optionIndex}]`;
        validateIdentifier(option.id, `${optionPath}.id`, candidateOptionIds, errors);
        if (isNonBlank(option.id)) {
            localOptionIds.add(option.id);
        }
        validatePlace(option.place, `${optionPath}.place`, errors, warnings);
        validateBooking(option.booking, `${optionPath}.booking`, errors);
    });
    if (group.mode === "browse" && group.defaultOptionId !== undefined) {
        addIssue(errors, "BROWSE_DEFAULT_FORBIDDEN", `${path}.defaultOptionId`, "Browse candidate groups cannot declare a default option.");
    }
    if (group.mode === "single" &&
        group.defaultOptionId !== undefined &&
        !localOptionIds.has(group.defaultOptionId)) {
        addIssue(errors, "UNKNOWN_DEFAULT_OPTION", `${path}.defaultOptionId`, "Single candidate group default must resolve to one of its options.");
    }
}
export function validateTrip(trip) {
    const errors = [];
    const warnings = [];
    const tripIds = new Set();
    const dayIds = new Set();
    const nodeIds = new Set();
    const routeIds = new Set();
    const candidateGroupIds = new Set();
    const candidateOptionIds = new Set();
    const reservationIds = new Set();
    const taskIds = new Set();
    const checklistIds = new Set();
    const shoppingItemIds = new Set();
    const nodeDayById = new Map();
    validateIdentifier(trip.id, "id", tripIds, errors);
    const validStartDate = validateDate(trip.startDate, "startDate", errors);
    const validEndDate = validateDate(trip.endDate, "endDate", errors);
    if (validStartDate && validEndDate && trip.startDate > trip.endDate) {
        addIssue(errors, "INVALID_DATE_RANGE", "startDate", "Trip start date must not follow end date.");
    }
    try {
        new Intl.DateTimeFormat("en", { timeZone: trip.timezone }).format();
    }
    catch {
        addIssue(errors, "INVALID_TIMEZONE", "timezone", "Timezone must be a valid IANA time zone.");
    }
    trip.days.forEach((day, dayIndex) => {
        const dayPath = `days[${dayIndex}]`;
        validateIdentifier(day.id, `${dayPath}.id`, dayIds, errors);
        const validDayDate = validateDate(day.date, `${dayPath}.date`, errors);
        if (validDayDate &&
            validStartDate &&
            validEndDate &&
            (day.date < trip.startDate || day.date > trip.endDate)) {
            addIssue(errors, "DATE_OUTSIDE_TRIP", `${dayPath}.date`, "Day date must fall within the trip date range.");
        }
        day.nodes.forEach((node, nodeIndex) => {
            const nodePath = `${dayPath}.nodes[${nodeIndex}]`;
            const hadNodeId = nodeIds.has(node.id);
            validateIdentifier(node.id, `${nodePath}.id`, nodeIds, errors);
            if (isNonBlank(node.id) && !hadNodeId) {
                nodeDayById.set(node.id, day.id);
            }
            validateIdReference(node.dayId, `${nodePath}.dayId`, errors);
            if (node.dayId !== day.id) {
                addIssue(errors, "NODE_DAY_MISMATCH", `${nodePath}.dayId`, "Node dayId must exactly match its containing day ID.");
            }
            validateTiming(node.timing, `${nodePath}.timing`, errors);
            validatePlace(node.place, `${nodePath}.place`, errors, warnings);
            validateBooking(node.booking, `${nodePath}.booking`, errors);
            if (node.kind === "experience" &&
                node.timing.certainty === "fixed" &&
                node.booking?.status !== "confirmed") {
                addIssue(warnings, "FIXED_EXPERIENCE_WITHOUT_CONFIRMED_BOOKING", `${nodePath}.booking`, "A fixed experience should have a confirmed booking.");
            }
            if (node.kind === "custom") {
                if (!isNonBlank(node.payload.customKind)) {
                    addIssue(errors, "BLANK_CUSTOM_KIND", `${nodePath}.payload.customKind`, "Custom kind must be nonblank.");
                }
                if (!hasDeclaredCapability(node)) {
                    addIssue(errors, "CUSTOM_CAPABILITIES_REQUIRED", `${nodePath}.payload.capabilities`, "Custom nodes must explicitly enable at least one capability.");
                }
            }
            if (node.kind === "lodging" || node.kind === "logistics") {
                validateChecklist(node.payload.checklist, `${nodePath}.payload.checklist`, checklistIds, errors);
            }
            if (node.kind === "shopping") {
                node.payload.items.forEach((item, itemIndex) => {
                    validateIdentifier(item.id, `${nodePath}.payload.items[${itemIndex}].id`, shoppingItemIds, errors);
                });
            }
        });
    });
    trip.routes.forEach((route, routeIndex) => {
        const routePath = `routes[${routeIndex}]`;
        validateIdentifier(route.id, `${routePath}.id`, routeIds, errors);
        validateIdReference(route.dayId, `${routePath}.dayId`, errors);
        if (!dayIds.has(route.dayId)) {
            addIssue(errors, "UNKNOWN_DAY", `${routePath}.dayId`, "Route dayId must resolve to a day.");
        }
        const endpoints = ["fromNodeId", "toNodeId"];
        endpoints.forEach((field) => {
            const endpoint = route[field];
            validateIdReference(endpoint, `${routePath}.${field}`, errors);
            if (nodeDayById.get(endpoint) !== route.dayId) {
                addIssue(errors, "UNKNOWN_ROUTE_ENDPOINT", `${routePath}.${field}`, "Route endpoint must resolve to a node on the route day.");
            }
        });
        if (route.durationMinutes !== undefined &&
            (!Number.isFinite(route.durationMinutes) || route.durationMinutes < 0)) {
            addIssue(errors, "INVALID_ROUTE_DURATION", `${routePath}.durationMinutes`, "Route duration must be finite and non-negative.");
        }
        if (route.distanceMeters !== undefined &&
            (!Number.isFinite(route.distanceMeters) || route.distanceMeters < 0)) {
            addIssue(errors, "INVALID_ROUTE_DISTANCE", `${routePath}.distanceMeters`, "Route distance must be finite and non-negative.");
        }
    });
    const candidateGroupsByParent = new Map();
    trip.candidateGroups.forEach((group, groupIndex) => {
        validateCandidateGroup(group, groupIndex, candidateGroupIds, candidateOptionIds, nodeDayById, errors, warnings);
        const groups = candidateGroupsByParent.get(group.parentNodeId) ?? [];
        groups.push(group);
        candidateGroupsByParent.set(group.parentNodeId, groups);
    });
    trip.days.forEach((day, dayIndex) => {
        day.nodes.forEach((node, nodeIndex) => {
            const nodePath = `days[${dayIndex}].nodes[${nodeIndex}]`;
            if (node.optionality === "candidate" && !candidateGroupsByParent.has(node.id)) {
                addIssue(errors, "CANDIDATE_GROUP_REQUIRED", `${nodePath}.optionality`, "Candidate nodes must own a trip-level candidate group.");
            }
            if (node.kind === "dining" && node.payload.candidateGroupId !== undefined) {
                const group = trip.candidateGroups.find((candidateGroup) => candidateGroup.id === node.payload.candidateGroupId);
                if (group === undefined || group.parentNodeId !== node.id) {
                    addIssue(errors, "UNKNOWN_CANDIDATE_GROUP", `${nodePath}.payload.candidateGroupId`, "Dining candidateGroupId must resolve to a group owned by this node.");
                }
            }
        });
    });
    trip.reservations.forEach((reservation, reservationIndex) => {
        const path = `reservations[${reservationIndex}]`;
        validateIdentifier(reservation.id, `${path}.id`, reservationIds, errors);
        validateIdReference(reservation.ownerId, `${path}.ownerId`, errors);
        if (!nodeDayById.has(reservation.ownerId) && !candidateOptionIds.has(reservation.ownerId)) {
            addIssue(errors, "UNKNOWN_RESERVATION_OWNER", `${path}.ownerId`, "Reservation owner must resolve to a node or candidate option.");
        }
        validateBooking(reservation.booking, `${path}.booking`, errors);
    });
    trip.tasks.forEach((task, taskIndex) => {
        const path = `tasks[${taskIndex}]`;
        validateIdentifier(task.id, `${path}.id`, taskIds, errors);
        if (task.scope === "day") {
            if (task.dayId === undefined || !isNonBlank(task.dayId)) {
                addIssue(errors, "TASK_DAY_REQUIRED", `${path}.dayId`, "Day task requires a day ID.");
            }
            else if (!dayIds.has(task.dayId)) {
                addIssue(errors, "UNKNOWN_DAY", `${path}.dayId`, "Task dayId must resolve to a day.");
            }
        }
        else if (task.dayId !== undefined) {
            addIssue(errors, "TASK_DAY_FORBIDDEN", `${path}.dayId`, "Pretrip task cannot declare a day ID.");
        }
        if (task.children?.length === 1) {
            addIssue(errors, "SINGLE_CHILD_TASK", `${path}.children`, "Nested task disclosure requires zero or at least two children.");
        }
        validateChecklist(task.children, `${path}.children`, checklistIds, errors);
    });
    return { errors, warnings };
}
export function assertValidTrip(trip) {
    const { errors } = validateTrip(trip);
    if (errors.length === 0) {
        return;
    }
    const details = errors
        .map((issue) => `${issue.code} at ${issue.path}: ${issue.message}`)
        .join("\n");
    throw new Error(`Trip validation failed:\n${details}`);
}
