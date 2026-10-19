import { checklistCompletionKey, collectDayProgressScope, nodeCompletionKey, selectEffectiveDay, taskCompletionKey, } from "@laugh-tale-island/core";
export function bookingFact(booking) {
    return {
        status: booking.status,
        ...(booking.reference === undefined ? {} : { reference: booking.reference }),
        ...(booking.url === undefined ? {} : { url: booking.url }),
        ...(booking.arrivalBufferMinutes === undefined ? {} : { arrivalBufferMinutes: booking.arrivalBufferMinutes }),
    };
}
export function timingFact(timing) {
    return {
        certainty: timing.certainty,
        ...(timing.start === undefined ? {} : { start: timing.start }),
        ...(timing.end === undefined ? {} : { end: timing.end }),
        ...(timing.dayOffset === undefined ? {} : { dayOffset: timing.dayOffset }),
    };
}
function providerState(failure) {
    return failure === undefined
        ? { status: "idle", retryable: false }
        : failure.status === "loading" ? { status: "loading", retryable: false }
            : { status: failure.status, reason: failure.reason, retryable: failure.retryable };
}
export function projectHomeModel({ trip, progress, persistenceStatus, instant, manualDayId, providerBootstrap, }) {
    const effective = selectEffectiveDay(trip, instant, manualDayId);
    if (effective === null)
        throw new Error("missing-effective-day");
    const scopes = trip.days.map((day) => collectDayProgressScope(trip, day.id));
    const unsupportedCompletionIds = new Set(trip.days.flatMap((day) => day.nodes.flatMap((node) => node.kind === "custom" && node.payload.capabilities.completion !== true
        ? [nodeCompletionKey(node.id)] : [])));
    const actionableCompletionIds = scopes.map((scope) => scope.completionIds.filter((id) => !unsupportedCompletionIds.has(id)));
    const completionIds = [...new Set([
            ...actionableCompletionIds.flat(),
            ...trip.tasks.filter((task) => task.scope === "pretrip").flatMap((task) => [
                taskCompletionKey(task.id),
                ...(task.children ?? []).map((child) => checklistCompletionKey(child.id)),
            ]),
        ])];
    const completed = new Set(progress.completedIds);
    const count = (ids) => ({
        completed: ids.filter((id) => completed.has(id)).length,
        total: ids.length,
    });
    const days = trip.days.map((day, index) => ({
        id: day.id, date: day.date, title: day.title,
        ...(day.summary === undefined ? {} : { summary: day.summary }),
        ...(day.routeLabel === undefined ? {} : { routeLabel: day.routeLabel }),
        ordinal: index + 1, effective: day.id === effective.id,
        progress: count(actionableCompletionIds[index]),
    }));
    return {
        identity: {
            tripId: trip.id, title: trip.title, startDate: trip.startDate, endDate: trip.endDate,
            locale: trip.locale, timezone: trip.timezone,
            ...(trip.destinationLabel === undefined ? {} : { destinationLabel: trip.destinationLabel }),
            ...(trip.travelerLabel === undefined ? {} : { travelerLabel: trip.travelerLabel }),
        },
        effectiveEntryDayId: effective.id,
        days,
        lodging: trip.days.flatMap((day) => day.nodes.flatMap((node) => node.kind !== "lodging" ? [] : [{
                ownerId: node.id, dayId: day.id, title: node.title, role: node.payload.role,
                timing: timingFact(node.timing),
                ...(node.booking === undefined ? {} : { booking: bookingFact(node.booking) }),
                ...(node.place === undefined ? {} : { place: {
                        label: node.place.name, certainty: node.place.certainty,
                        resolution: node.place.identity.status === "resolved"
                            ? { status: "resolved" }
                            : { status: "unresolved", reason: node.place.identity.reason },
                    } }),
            }])),
        tasks: trip.tasks.map((task) => ({
            id: taskCompletionKey(task.id), title: task.title, scope: task.scope,
            ...(task.dayId === undefined ? {} : { dayId: task.dayId }),
            ...(task.note === undefined ? {} : { note: task.note }),
            completed: completed.has(taskCompletionKey(task.id)),
            children: (task.children ?? []).map((child) => ({
                id: checklistCompletionKey(child.id), title: child.title,
                completed: completed.has(checklistCompletionKey(child.id)),
            })),
        })),
        reservations: trip.reservations.map((reservation) => {
            const candidateParent = trip.candidateGroups.find(group => group.options.some(option => option.id === reservation.ownerId))?.parentNodeId;
            const nodeId = candidateParent ?? reservation.ownerId;
            const day = trip.days.find(day => day.nodes.some(node => node.id === nodeId));
            return {
                id: reservation.id, title: reservation.title, ownerId: reservation.ownerId,
                booking: bookingFact(reservation.booking),
                ...(day === undefined ? {} : { destination: { dayId: day.id, nodeId } }),
            };
        }),
        progress: {
            trip: count(completionIds),
            days: days.map((day) => ({ dayId: day.id, ...day.progress })),
            selectedCandidates: Object.entries(progress.selectedCandidateIds).map(([groupId, optionId]) => ({ groupId, optionId })),
            shopping: Object.entries(progress.shoppingStatuses).map(([itemId, status]) => ({ itemId, status })),
            skippedNodeIds: [...progress.skippedNodeIds], completedIds: [...progress.completedIds],
        },
        persistence: { status: persistenceStatus, writable: persistenceStatus === "persistent" },
        providers: { map: providerState(providerBootstrap?.map), routes: providerState(providerBootstrap?.routes), places: providerState(providerBootstrap?.places) },
        capabilities: {
            openExperienceDayIds: trip.days.map((day) => day.id),
            progress: {
                completionIds,
                skippableNodeIds: scopes.flatMap((scope) => scope.skippedNodeIds),
                shoppingItemIds: scopes.flatMap((scope) => scope.shoppingItemIds),
                resetTrip: true,
                resetDayIds: trip.days.map((day) => day.id),
            },
        },
    };
}
