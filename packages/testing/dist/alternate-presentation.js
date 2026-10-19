import { jsxs as _jsxs, jsx as _jsx } from "react/jsx-runtime";
import { useCallback, useLayoutEffect } from "react";
function FixtureAction({ action, contractRole, ownerId, onClick, children, buttonRef, }) {
    return (_jsxs("button", { type: "button", "data-contract-action": action, ...(contractRole === undefined
            ? {}
            : { "data-contract-role": contractRole }), ...(ownerId === undefined ? {} : { "data-owner-id": ownerId }), onClick: onClick, ref: buttonRef, children: ["Test fixture: ", children] }));
}
function Home({ model, actions }) {
    return (_jsx("main", { "data-contract-role": "home", children: model.days
            .filter((day) => model.capabilities.openExperienceDayIds.includes(day.id))
            .map((day) => (_jsxs(FixtureAction, { action: "open-day", contractRole: "day-choice", ownerId: day.id, onClick: () => actions.openExperience(day.id), children: ["choose synthetic day ", day.ordinal] }, day.id))) }));
}
function stateValue(states) {
    return states.join(" ");
}
function NodeEntry({ node, role, model, actions, bindings, }) {
    const completion = node.completion;
    const completionAllowed = completion !== undefined &&
        model.capabilities.progress.completionIds.includes(completion.id);
    return (_jsxs("article", { "data-contract-role": role, "data-owner-id": node.ownerId, "data-contract-states": stateValue(node.states), children: [_jsxs("p", { children: ["Test fixture: itinerary node ", node.ownerId] }), node.capabilities.select ? (_jsx(FixtureAction, { action: "select-owner", buttonRef: bindings.owners.nodeRef(node.ownerId), ownerId: node.ownerId, onClick: () => actions.selectNode(node.ownerId), children: "select itinerary owner" })) : null, model.capabilities.navigationOwnerIds.includes(node.ownerId) ? (_jsx(FixtureAction, { action: "open-navigation", ownerId: node.ownerId, onClick: () => actions.openNavigation(node.ownerId), children: "open neutral navigation" })) : null, completionAllowed && completion !== undefined ? (_jsx(FixtureAction, { action: "update-completion", ownerId: completion.id, onClick: () => actions.updateProgress({
                    kind: "completion",
                    id: completion.id,
                    completed: !completion.completed,
                }), children: "update completion" })) : null, node.capabilities.skip ? (_jsx(FixtureAction, { action: "update-skipped", ownerId: node.nodeId, onClick: () => actions.updateProgress({
                    kind: "node-skipped",
                    nodeId: node.nodeId,
                    skipped: !node.states.includes("skipped"),
                }), children: "update skipped state" })) : null, node.facts.kind === "shopping"
                ? node.facts.items.map((item) => (_jsx(FixtureAction, { action: "update-shopping", ownerId: item.id, onClick: () => actions.updateProgress({
                        kind: "shopping-status",
                        itemId: item.id,
                        status: item.status === "purchased" ? "pending" : "purchased",
                    }), children: "update shopping status" }, item.id)))
                : null, node.capabilities.candidateGroupId === undefined ? null : (_jsx(FixtureAction, { action: "reopen-candidate", ownerId: node.capabilities.candidateGroupId, onClick: () => actions.reopenCandidate(node.capabilities.candidateGroupId ?? ""), buttonRef: bindings.focus.disclosureTriggerRef(node.capabilities.candidateGroupId), children: "open candidate comparison" }))] }));
}
function CandidateFixture({ candidate, actions, bindings, }) {
    return (_jsxs("section", { "data-contract-role": "candidate-group", "data-owner-id": candidate.groupId, "data-contract-value": candidate.open ? "open" : "closed", ...(candidate.open
            ? { ref: bindings.focus.dialogRef(candidate.groupId) }
            : {}), children: [_jsxs("p", { children: ["Test fixture: candidate comparison ", candidate.groupId] }), candidate.options.map((option) => (_jsxs("div", { "data-contract-role": "candidate-option", "data-owner-id": option.id, "data-contract-value": option.selected ? "selected" : option.draft ? "draft" : "idle", children: [_jsxs("span", { children: ["Test fixture: candidate option ", option.ordinal] }), candidate.capabilities.previewOptionIds.includes(option.id) ? (_jsx(FixtureAction, { action: "preview-candidate", buttonRef: bindings.focus.dialogRef(option.id), ownerId: option.id, onClick: () => actions.previewCandidate(candidate.groupId, option.id), children: "preview candidate option" })) : null] }, option.id))), candidate.capabilities.cancel ? (_jsx(FixtureAction, { action: "cancel-candidate", ownerId: candidate.groupId, onClick: () => actions.cancelCandidate(candidate.groupId), children: "cancel candidate comparison" })) : null, candidate.capabilities.confirm ? (_jsx(FixtureAction, { action: "confirm-candidate", ownerId: candidate.groupId, onClick: () => actions.confirmCandidate(candidate.groupId), children: "confirm candidate option" })) : null] }));
}
function Experience({ model, actions, bindings }) {
    const setMeasuredGeometry = bindings.sheet.setMeasuredGeometry;
    useLayoutEffect(() => {
        setMeasuredGeometry({
            collapsedHeight: 80,
            halfHeight: 180,
            expandedHeight: 420,
        });
    }, [setMeasuredGeometry]);
    const surfaceProps = bindings.sheet.getSurfaceProps();
    const surfaceRef = surfaceProps.ref;
    const occlusionRef = bindings.layout.occlusionRef("alternate-test-fixture-sheet");
    const sheetRef = useCallback((element) => {
        surfaceRef(element);
        occlusionRef(element);
    }, [surfaceRef, occlusionRef]);
    const handleProps = bindings.sheet.getHandleProps();
    const snapOrder = ["collapsed", "half", "expanded"];
    const currentSnapIndex = snapOrder.indexOf(model.sheet.snap);
    const nextSnap = snapOrder[currentSnapIndex + 1];
    const previousSnap = snapOrder[currentSnapIndex - 1];
    const canUseSheetHandle = model.sheet.interactive &&
        snapOrder.every((snap) => model.capabilities.sheetSnaps.includes(snap));
    const canExpandSheet = model.sheet.interactive &&
        nextSnap !== undefined &&
        model.capabilities.sheetSnaps.includes(nextSnap);
    const canCollapseSheet = model.sheet.interactive &&
        previousSnap !== undefined &&
        model.capabilities.sheetSnaps.includes(previousSnap);
    return (_jsxs("main", { "data-contract-role": "experience", "data-selected-owner-id": model.owners.selectedId ?? undefined, children: [_jsxs("section", { "data-contract-role": "itinerary", children: [_jsx("h1", { children: "Test fixture: neutral itinerary" }), model.timeline.map((entry) => {
                        if (entry.kind === "node")
                            return (_jsx(NodeEntry, { node: entry, role: "timeline-node", model: model, actions: actions, bindings: bindings }, entry.ownerId));
                        if (entry.kind === "route")
                            return (_jsxs("article", { "data-contract-role": "timeline-route", "data-owner-id": entry.ownerId, "data-contract-states": stateValue(entry.states), children: [_jsxs("p", { children: ["Test fixture: itinerary route ", entry.ownerId] }), model.capabilities.selectRouteIds.includes(entry.routeId) ? (_jsx(FixtureAction, { action: "select-route", buttonRef: bindings.owners.routeRef(entry.ownerId), ownerId: entry.ownerId, onClick: () => actions.selectRoute(entry.routeId, "list"), children: "select itinerary route" })) : null] }, entry.ownerId));
                        return (_jsxs("section", { "data-contract-role": "logistics-group", "data-owner-id": entry.ownerId, children: [_jsx("h2", { children: "Test fixture: grouped logistics children" }), entry.children.map((child) => (_jsx(NodeEntry, { node: child, role: "logistics-child", model: model, actions: actions, bindings: bindings }, child.ownerId)))] }, entry.ownerId));
                    })] }), _jsx("section", { "data-contract-role": "map", ref: bindings.layout.mapViewportRef, children: "Test fixture: neutral map viewport" }), _jsxs("section", { ...surfaceProps, "data-contract-role": "sheet", "data-contract-value": model.sheet.snap, ref: sheetRef, children: [_jsx("p", { children: "Test fixture: itinerary sheet" }), canUseSheetHandle ? (_jsx("div", { ...handleProps, children: "Test fixture: sheet handle" })) : null, canExpandSheet ? (_jsx(FixtureAction, { action: "step-sheet-expand", onClick: () => actions.stepSheet("expand"), children: "expand sheet" })) : null, canCollapseSheet ? (_jsx(FixtureAction, { action: "step-sheet-collapse", onClick: () => actions.stepSheet("collapse"), children: "collapse sheet" })) : null] }), _jsxs("section", { children: [_jsx("h2", { children: "Test fixture: semantic controls" }), model.capabilities.restoreAutomaticSelection ? (_jsx(FixtureAction, { action: "restore-automatic", onClick: actions.restoreAutomaticSelection, children: "restore automatic owner" })) : null, model.capabilities.returnToCurrent ? (_jsx(FixtureAction, { action: "return-current", onClick: actions.returnToCurrent, children: "return current owner" })) : null, model.capabilities.returnToLodging ? (_jsx(FixtureAction, { action: "return-lodging", onClick: actions.returnToLodging, children: "return lodging owner" })) : null, model.capabilities.restoreFullDay ? (_jsx(FixtureAction, { action: "restore-full-day", onClick: actions.restoreFullDay, children: "restore full day" })) : null, model.capabilities.retryMap ? (_jsx(FixtureAction, { action: "retry-map", onClick: () => actions.retryProvider("map"), children: "retry map" })) : null, model.capabilities.location.begin ? (_jsx(FixtureAction, { action: "begin-location", onClick: actions.beginLocation, children: "begin user location" })) : null, model.capabilities.location.recenter ? (_jsx(FixtureAction, { action: "recenter-location", onClick: actions.recenterLocation, children: "recenter user location" })) : null, model.capabilities.location.stop ? (_jsx(FixtureAction, { action: "stop-location", onClick: actions.stopLocation, children: "stop user location" })) : null] }), _jsxs("section", { children: [_jsx("h2", { children: "Test fixture: progress states" }), model.capabilities.progress.completionIds.map((id) => (_jsx("output", { "data-contract-role": "progress-completion", "data-owner-id": id, "data-contract-value": String(model.progress.completedIds.includes(id)), children: "Test fixture: completion state" }, id))), model.capabilities.progress.skippableNodeIds.map((id) => (_jsx("output", { "data-contract-role": "progress-skipped", "data-owner-id": id, "data-contract-value": String(model.progress.skippedNodeIds.includes(id)), children: "Test fixture: skipped state" }, id))), model.capabilities.progress.shoppingItemIds.map((id) => (_jsx("output", { "data-contract-role": "progress-shopping", "data-owner-id": id, "data-contract-value": model.progress.shopping.find((item) => item.itemId === id)?.status ??
                            "pending", children: "Test fixture: shopping state" }, id)))] }), model.candidates.map((candidate) => (_jsx(CandidateFixture, { candidate: candidate, actions: actions, bindings: bindings }, candidate.groupId)))] }));
}
function markerContent(descriptor) {
    const element = document.createElement("div");
    element.dataset.testFixtureShape = "rectangle";
    let revision = 0;
    const update = (next) => {
        revision += 1;
        element.dataset.testFixtureRevision = String(revision);
        element.dataset.ownerId = next.ownerId;
        element.dataset.contractStates = stateValue(next.states);
        element.textContent = `Test fixture itinerary marker: ${next.ownerId}`;
    };
    update(descriptor);
    return {
        element,
        update,
        dispose() {
            element.dataset.testFixtureDisposed = "true";
        },
    };
}
function userLocationContent(descriptor) {
    const element = document.createElement("span");
    element.dataset.testFixtureShape = "crosshair";
    let revision = 0;
    const update = (next) => {
        revision += 1;
        element.dataset.testFixtureRevision = String(revision);
        element.textContent = `Test fixture user crosshair: ${next.coordinates.lat},${next.coordinates.lng}`;
    };
    update(descriptor);
    return {
        element,
        update,
        dispose() {
            element.dataset.testFixtureDisposed = "true";
        },
    };
}
export const alternateTestPresentation = {
    Home,
    Experience,
    SetupRequired({ model, actions }) {
        return (_jsxs("main", { "data-contract-role": "setup", children: [_jsxs("p", { children: ["Test fixture: setup required (", model.issues.length, ")"] }), model.capabilities.retry ? (_jsx(FixtureAction, { action: "retry-setup", onClick: actions.retrySetup, children: "retry setup" })) : null] }));
    },
    Loading({ model }) {
        return (_jsxs("main", { "data-contract-role": "loading", children: ["Test fixture: loading ", model.operation] }));
    },
    FatalError({ model, actions }) {
        return (_jsxs("main", { "data-contract-role": "fatal", children: [_jsxs("p", { children: ["Test fixture: fatal ", model.category] }), model.capabilities.openHome ? (_jsx(FixtureAction, { action: "open-home", onClick: actions.openHome, children: "open home" })) : null, model.capabilities.retry ? (_jsx(FixtureAction, { action: "retry-fatal", onClick: actions.retryFatal, children: "retry fatal state" })) : null] }));
    },
    mapVisualProfile: {
        id: "alternate-test-fixture-neutral",
        basemap: {
            mode: "neutral",
            density: "low",
            contrast: "standard",
            poi: "minimal",
            stationLabels: "hidden",
            palette: {
                geometry: "gray",
                label: "black",
                labelStroke: "white",
                water: "blue",
                park: "green",
                road: "silver",
            },
        },
        routeStyle: () => null,
    },
    createMarkerContent: markerContent,
    createUserLocationContent: userLocationContent,
};
