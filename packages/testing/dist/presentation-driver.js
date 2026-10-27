import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { TripController, } from "@laugh-tale-island/react";
function elementsWith(container, attribute, value) {
    return Array.from(container.querySelectorAll(`[${attribute}]`)).filter((element) => element.getAttribute(attribute) === value);
}
function owned(elements, ownerId) {
    return (elements.find((element) => ownerId === undefined || element.dataset.ownerId === ownerId) ?? null);
}
function driverFor(container, disposeMounted) {
    let disposed = false;
    const query = (role, ownerId) => owned(elementsWith(container, "data-contract-role", role), ownerId);
    return {
        query,
        get(role, ownerId) {
            const element = query(role, ownerId);
            if (element === null)
                throw new Error(`No test fixture contract role ${role}${ownerId === undefined ? "" : ` for owner ${ownerId}`}`);
            return element;
        },
        all: (role) => elementsWith(container, "data-contract-role", role),
        ownerIds: (role) => elementsWith(container, "data-contract-role", role).flatMap((element) => element.dataset.ownerId === undefined ? [] : [element.dataset.ownerId]),
        states: (role, ownerId) => {
            const state = query(role, ownerId)?.dataset.contractStates;
            return state === undefined || state === "" ? [] : state.split(" ");
        },
        value: (role, ownerId) => query(role, ownerId)?.dataset.contractValue ?? null,
        selectedOwnerId: () => query("experience")?.dataset.selectedOwnerId ?? null,
        activate(action, ownerId) {
            const element = owned(elementsWith(container, "data-contract-action", action), ownerId);
            if (!(element instanceof HTMLButtonElement))
                throw new Error(`No test fixture contract action ${action}${ownerId === undefined ? "" : ` for owner ${ownerId}`}`);
            act(() => element.click());
        },
        async settle() {
            await act(async () => {
                await Promise.resolve();
                await Promise.resolve();
            });
        },
        dispose() {
            if (disposed)
                return;
            disposed = true;
            disposeMounted();
        },
    };
}
export function createPresentationDriver(container) {
    return driverFor(container, () => container.replaceChildren());
}
export function renderTripContract(props) {
    const container = document.createElement("div");
    container.dataset.testFixture = "trip-contract";
    document.body.append(container);
    let root = createRoot(container);
    act(() => root?.render(createElement(TripController, props)));
    return driverFor(container, () => {
        const mounted = root;
        root = null;
        if (mounted !== null)
            act(() => mounted.unmount());
        container.remove();
    });
}
