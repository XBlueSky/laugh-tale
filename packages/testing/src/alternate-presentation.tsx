import { useCallback, useLayoutEffect, type ReactNode } from "react";
import type {
  CandidateDecisionModel,
  ExperienceBindings,
  ExperienceModel,
  ExperienceViewProps,
  HomeViewProps,
  TimelineNodeModel,
  TripActions,
  TripPresentationV2,
} from "@laugh-tale-island/react";
import type {
  MarkerContentHandle,
  MarkerDescriptor,
  UserLocationContentHandle,
  UserLocationDescriptor,
} from "@laugh-tale-island/core/browser";
import type {
  PresentationContractAction,
  PresentationContractRole,
} from "./presentation-driver.js";

interface ActionProps {
  action: PresentationContractAction;
  contractRole?: PresentationContractRole;
  ownerId?: string;
  onClick(): void;
  children: ReactNode;
  buttonRef?: (element: HTMLButtonElement | null) => void;
}

function FixtureAction({
  action,
  contractRole,
  ownerId,
  onClick,
  children,
  buttonRef,
}: ActionProps) {
  return (
    <button
      type="button"
      data-contract-action={action}
      {...(contractRole === undefined
        ? {}
        : { "data-contract-role": contractRole })}
      {...(ownerId === undefined ? {} : { "data-owner-id": ownerId })}
      onClick={onClick}
      ref={buttonRef}
    >
      Test fixture: {children}
    </button>
  );
}

function Home({ model, actions }: HomeViewProps) {
  return (
    <main data-contract-role="home">
      {model.days
        .filter((day) =>
          model.capabilities.openExperienceDayIds.includes(day.id),
        )
        .map((day) => (
          <FixtureAction
            key={day.id}
            action="open-day"
            contractRole="day-choice"
            ownerId={day.id}
            onClick={() => actions.openExperience(day.id)}
          >
            choose synthetic day {day.ordinal}
          </FixtureAction>
        ))}
    </main>
  );
}

function stateValue(states: readonly string[]): string {
  return states.join(" ");
}

function NodeEntry({
  node,
  role,
  model,
  actions,
  bindings,
}: {
  node: TimelineNodeModel;
  role: "timeline-node" | "logistics-child";
  model: ExperienceModel;
  actions: TripActions;
  bindings: ExperienceBindings;
}) {
  const completion = node.completion;
  const completionAllowed =
    completion !== undefined &&
    model.capabilities.progress.completionIds.includes(completion.id);
  return (
    <article
      data-contract-role={role}
      data-owner-id={node.ownerId}
      data-contract-states={stateValue(node.states)}
    >
      <p>Test fixture: itinerary node {node.ownerId}</p>
      {node.capabilities.select ? (
        <FixtureAction
          action="select-owner"
          buttonRef={bindings.owners.nodeRef(node.ownerId)}
          ownerId={node.ownerId}
          onClick={() => actions.selectNode(node.ownerId)}
        >
          select itinerary owner
        </FixtureAction>
      ) : null}
      {model.capabilities.navigationOwnerIds.includes(node.ownerId) ? (
        <FixtureAction
          action="open-navigation"
          ownerId={node.ownerId}
          onClick={() => actions.openNavigation(node.ownerId)}
        >
          open neutral navigation
        </FixtureAction>
      ) : null}
      {completionAllowed && completion !== undefined ? (
        <FixtureAction
          action="update-completion"
          ownerId={completion.id}
          onClick={() =>
            actions.updateProgress({
              kind: "completion",
              id: completion.id,
              completed: !completion.completed,
            })
          }
        >
          update completion
        </FixtureAction>
      ) : null}
      {node.capabilities.skip ? (
        <FixtureAction
          action="update-skipped"
          ownerId={node.nodeId}
          onClick={() =>
            actions.updateProgress({
              kind: "node-skipped",
              nodeId: node.nodeId,
              skipped: !node.states.includes("skipped"),
            })
          }
        >
          update skipped state
        </FixtureAction>
      ) : null}
      {node.facts.kind === "shopping"
        ? node.facts.items.map((item) => (
            <FixtureAction
              key={item.id}
              action="update-shopping"
              ownerId={item.id}
              onClick={() =>
                actions.updateProgress({
                  kind: "shopping-status",
                  itemId: item.id,
                  status: item.status === "purchased" ? "pending" : "purchased",
                })
              }
            >
              update shopping status
            </FixtureAction>
          ))
        : null}
      {node.capabilities.candidateGroupId === undefined ? null : (
        <FixtureAction
          action="reopen-candidate"
          ownerId={node.capabilities.candidateGroupId}
          onClick={() =>
            actions.reopenCandidate(node.capabilities.candidateGroupId ?? "")
          }
          buttonRef={bindings.focus.disclosureTriggerRef(
            node.capabilities.candidateGroupId,
          )}
        >
          open candidate comparison
        </FixtureAction>
      )}
    </article>
  );
}

function CandidateFixture({
  candidate,
  actions,
  bindings,
}: {
  candidate: CandidateDecisionModel;
  actions: TripActions;
  bindings: ExperienceBindings;
}) {
  return (
    <section
      data-contract-role="candidate-group"
      data-owner-id={candidate.groupId}
      data-contract-value={candidate.open ? "open" : "closed"}
      {...(candidate.open
        ? { ref: bindings.focus.dialogRef(candidate.groupId) }
        : {})}
    >
      <p>Test fixture: candidate comparison {candidate.groupId}</p>
      {candidate.options.map((option) => (
        <div
          key={option.id}
          data-contract-role="candidate-option"
          data-owner-id={option.id}
          data-contract-value={
            option.selected ? "selected" : option.draft ? "draft" : "idle"
          }
        >
          <span>Test fixture: candidate option {option.ordinal}</span>
          {candidate.capabilities.previewOptionIds.includes(option.id) ? (
            <FixtureAction
              action="preview-candidate"
              buttonRef={bindings.focus.dialogRef(option.id)}
              ownerId={option.id}
              onClick={() =>
                actions.previewCandidate(candidate.groupId, option.id)
              }
            >
              preview candidate option
            </FixtureAction>
          ) : null}
        </div>
      ))}
      {candidate.capabilities.cancel ? (
        <FixtureAction
          action="cancel-candidate"
          ownerId={candidate.groupId}
          onClick={() => actions.cancelCandidate(candidate.groupId)}
        >
          cancel candidate comparison
        </FixtureAction>
      ) : null}
      {candidate.capabilities.confirm ? (
        <FixtureAction
          action="confirm-candidate"
          ownerId={candidate.groupId}
          onClick={() => actions.confirmCandidate(candidate.groupId)}
        >
          confirm candidate option
        </FixtureAction>
      ) : null}
    </section>
  );
}

function Experience({ model, actions, bindings }: ExperienceViewProps) {
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
  const sheetRef = useCallback((element: HTMLElement | null) => {
    surfaceRef(element);
    occlusionRef(element);
  }, [surfaceRef, occlusionRef]);
  const handleProps = bindings.sheet.getHandleProps();
  const snapOrder = ["collapsed", "half", "expanded"] as const;
  const currentSnapIndex = snapOrder.indexOf(model.sheet.snap);
  const nextSnap = snapOrder[currentSnapIndex + 1];
  const previousSnap = snapOrder[currentSnapIndex - 1];
  const canUseSheetHandle =
    model.sheet.interactive &&
    snapOrder.every((snap) => model.capabilities.sheetSnaps.includes(snap));
  const canExpandSheet =
    model.sheet.interactive &&
    nextSnap !== undefined &&
    model.capabilities.sheetSnaps.includes(nextSnap);
  const canCollapseSheet =
    model.sheet.interactive &&
    previousSnap !== undefined &&
    model.capabilities.sheetSnaps.includes(previousSnap);
  return (
    <main
      data-contract-role="experience"
      data-selected-owner-id={model.owners.selectedId ?? undefined}
    >
      <section data-contract-role="itinerary">
        <h1>Test fixture: neutral itinerary</h1>
        {model.timeline.map((entry) => {
          if (entry.kind === "node")
            return (
              <NodeEntry
                key={entry.ownerId}
                node={entry}
                role="timeline-node"
                model={model}
                actions={actions}
                bindings={bindings}
              />
            );
          if (entry.kind === "route")
            return (
              <article
                key={entry.ownerId}
                data-contract-role="timeline-route"
                data-owner-id={entry.ownerId}
                data-contract-states={stateValue(entry.states)}
              >
                <p>Test fixture: itinerary route {entry.ownerId}</p>
                {model.capabilities.selectRouteIds.includes(entry.routeId) ? (
                  <FixtureAction
                    action="select-route"
                    buttonRef={bindings.owners.routeRef(entry.ownerId)}
                    ownerId={entry.ownerId}
                    onClick={() => actions.selectRoute(entry.routeId, "list")}
                  >
                    select itinerary route
                  </FixtureAction>
                ) : null}
              </article>
            );
          return (
            <section
              key={entry.ownerId}
              data-contract-role="logistics-group"
              data-owner-id={entry.ownerId}
            >
              <h2>Test fixture: grouped logistics children</h2>
              {entry.children.map((child) => (
                <NodeEntry
                  key={child.ownerId}
                  node={child}
                  role="logistics-child"
                  model={model}
                  actions={actions}
                  bindings={bindings}
                />
              ))}
            </section>
          );
        })}
      </section>

      <section data-contract-role="map" ref={bindings.layout.mapViewportRef}>
        Test fixture: neutral map viewport
      </section>

      <section
        {...surfaceProps}
        data-contract-role="sheet"
        data-contract-value={model.sheet.snap}
        ref={sheetRef}
      >
        <p>Test fixture: itinerary sheet</p>
        {canUseSheetHandle ? (
          <div {...handleProps}>
            Test fixture: sheet handle
          </div>
        ) : null}
        {canExpandSheet ? (
          <FixtureAction
            action="step-sheet-expand"
            onClick={() => actions.stepSheet("expand")}
          >
            expand sheet
          </FixtureAction>
        ) : null}
        {canCollapseSheet ? (
          <FixtureAction
            action="step-sheet-collapse"
            onClick={() => actions.stepSheet("collapse")}
          >
            collapse sheet
          </FixtureAction>
        ) : null}
      </section>

      <section>
        <h2>Test fixture: semantic controls</h2>
        {model.capabilities.restoreAutomaticSelection ? (
          <FixtureAction
            action="restore-automatic"
            onClick={actions.restoreAutomaticSelection}
          >
            restore automatic owner
          </FixtureAction>
        ) : null}
        {model.capabilities.returnToCurrent ? (
          <FixtureAction action="return-current" onClick={actions.returnToCurrent}>
            return current owner
          </FixtureAction>
        ) : null}
        {model.capabilities.returnToLodging ? (
          <FixtureAction action="return-lodging" onClick={actions.returnToLodging}>
            return lodging owner
          </FixtureAction>
        ) : null}
        {model.capabilities.restoreFullDay ? (
          <FixtureAction action="restore-full-day" onClick={actions.restoreFullDay}>
            restore full day
          </FixtureAction>
        ) : null}
        {model.capabilities.retryMap ? (
          <FixtureAction
            action="retry-map"
            onClick={() => actions.retryProvider("map")}
          >
            retry map
          </FixtureAction>
        ) : null}
        {model.capabilities.location.begin ? (
          <FixtureAction action="begin-location" onClick={actions.beginLocation}>
            begin user location
          </FixtureAction>
        ) : null}
        {model.capabilities.location.recenter ? (
          <FixtureAction
            action="recenter-location"
            onClick={actions.recenterLocation}
          >
            recenter user location
          </FixtureAction>
        ) : null}
        {model.capabilities.location.stop ? (
          <FixtureAction action="stop-location" onClick={actions.stopLocation}>
            stop user location
          </FixtureAction>
        ) : null}
      </section>

      <section>
        <h2>Test fixture: progress states</h2>
        {model.capabilities.progress.completionIds.map((id) => (
          <output
            key={id}
            data-contract-role="progress-completion"
            data-owner-id={id}
            data-contract-value={String(model.progress.completedIds.includes(id))}
          >
            Test fixture: completion state
          </output>
        ))}
        {model.capabilities.progress.skippableNodeIds.map((id) => (
          <output
            key={id}
            data-contract-role="progress-skipped"
            data-owner-id={id}
            data-contract-value={String(model.progress.skippedNodeIds.includes(id))}
          >
            Test fixture: skipped state
          </output>
        ))}
        {model.capabilities.progress.shoppingItemIds.map((id) => (
          <output
            key={id}
            data-contract-role="progress-shopping"
            data-owner-id={id}
            data-contract-value={
              model.progress.shopping.find((item) => item.itemId === id)?.status ??
              "pending"
            }
          >
            Test fixture: shopping state
          </output>
        ))}
      </section>

      {model.candidates.map((candidate) => (
        <CandidateFixture
          key={candidate.groupId}
          candidate={candidate}
          actions={actions}
          bindings={bindings}
        />
      ))}
    </main>
  );
}

function markerContent(descriptor: MarkerDescriptor): MarkerContentHandle {
  const element = document.createElement("div");
  element.dataset.testFixtureShape = "rectangle";
  let revision = 0;
  const update = (next: MarkerDescriptor): void => {
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

function userLocationContent(
  descriptor: UserLocationDescriptor,
): UserLocationContentHandle {
  const element = document.createElement("span");
  element.dataset.testFixtureShape = "crosshair";
  let revision = 0;
  const update = (next: UserLocationDescriptor): void => {
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

export const alternateTestPresentation: TripPresentationV2 = {
  Home,
  Experience,
  SetupRequired({ model, actions }) {
    return (
      <main data-contract-role="setup">
        <p>Test fixture: setup required ({model.issues.length})</p>
        {model.capabilities.retry ? (
          <FixtureAction action="retry-setup" onClick={actions.retrySetup}>
            retry setup
          </FixtureAction>
        ) : null}
      </main>
    );
  },
  Loading({ model }) {
    return (
      <main data-contract-role="loading">
        Test fixture: loading {model.operation}
      </main>
    );
  },
  FatalError({ model, actions }) {
    return (
      <main data-contract-role="fatal">
        <p>Test fixture: fatal {model.category}</p>
        {model.capabilities.openHome ? (
          <FixtureAction action="open-home" onClick={actions.openHome}>
            open home
          </FixtureAction>
        ) : null}
        {model.capabilities.retry ? (
          <FixtureAction action="retry-fatal" onClick={actions.retryFatal}>
            retry fatal state
          </FixtureAction>
        ) : null}
      </main>
    );
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
