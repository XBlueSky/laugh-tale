import { act, cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { readFileSync } from "node:fs";
import { useCallback, useMemo, useState } from "react";
import { afterEach, describe, expect, it } from "vitest";

import { ItineraryMap } from "../../experience-shell/ItineraryMap";
import { buildMapPresentation } from "@laugh-tale-island/core";
import { candidateMapOwnerId, decodeMapPlaceOwnerId, nodeMapOwnerId, type MapPresentation } from "@laugh-tale-island/core";
import { FakeMapAdapter } from "../../providers/fake/FakeMapAdapter";
import type { CandidateGroup, Trip } from "@laugh-tale-island/core";
import { emptyTripProgress, tripProgressReducer, type TripProgressV1 } from "@laugh-tale-island/core";
import { resolveEffectiveItinerary } from "@laugh-tale-island/core";
import type { CandidateMapOverride, CandidatePreviewRequest } from "@laugh-tale-island/core";
import { CandidateDecision } from "./CandidateDecision";

function mountBaseStyles(): void {
  const style = document.createElement("style");
  style.dataset.task9TestStyle = "true";
  style.textContent = readFileSync("src/ui/styles/base.css", "utf8");
  document.head.append(style);
}

afterEach(() => {
  cleanup();
  document.querySelectorAll('style[data-task9-test-style="true"]').forEach((style) => style.remove());
});

const singleGroup: CandidateGroup = {
  id: "meal-options",
  parentNodeId: "meal",
  mode: "single",
  defaultOptionId: "meal-a",
  options: [
    {
      id: "meal-a",
      title: "A",
      place: {
        name: "Garden kitchen",
        coordinates: { lat: 25.04, lng: 121.52 },
        certainty: "candidate",
      },
    },
    {
      id: "meal-b",
      title: "B",
      place: {
        name: "Canal counter",
        coordinates: { lat: 25.05, lng: 121.53 },
        certainty: "candidate",
      },
    },
    { id: "meal-unresolved", title: "C" },
  ],
};

function candidateTrip(group: CandidateGroup): Trip {
  return {
    id: "candidate-trip",
    title: "Candidate trip",
    timezone: "Asia/Taipei",
    startDate: "2040-06-12",
    endDate: "2040-06-12",
    days: [
      {
        id: "day-one",
        date: "2040-06-12",
        title: "Candidate day",
        nodes: [
          {
            id: "museum",
            dayId: "day-one",
            kind: "sightseeing",
            title: "Museum",
            timing: { certainty: "suggested" },
            optionality: "core",
            place: {
              name: "Museum",
              coordinates: { lat: 25.03, lng: 121.51 },
              certainty: "confirmed",
            },
            payload: {},
          },
          {
            id: "meal",
            dayId: "day-one",
            kind: "dining",
            title: "Meal choices",
            timing: { start: "12:00", certainty: "suggested" },
            optionality: "candidate",
            payload: { candidateGroupId: group.id },
          },
        ],
      },
    ],
    routes: [],
    candidateGroups: [group],
    reservations: [],
    tasks: [],
  };
}

interface HarnessProps {
  adapter: FakeMapAdapter;
  group: CandidateGroup;
  initialProgress?: TripProgressV1;
  sequenceNumber: number;
}

function Harness({ adapter, group, initialProgress, sequenceNumber }: HarnessProps) {
  const trip = useMemo(() => candidateTrip(group), [group]);
  const [progress, setProgress] = useState(
    initialProgress ?? emptyTripProgress(),
  );
  const [mapOverride, setMapOverride] = useState<CandidateMapOverride | null>(null);
  const [previewRequest, setPreviewRequest] = useState<CandidatePreviewRequest>();
  const effective = useMemo(
    () => resolveEffectiveItinerary(trip, progress),
    [progress, trip],
  );
  const effectiveDay = effective.days[0];
  if (effectiveDay === undefined) {
    throw new Error("Candidate harness needs one day");
  }
  const presentation: MapPresentation = useMemo(
    () =>
      buildMapPresentation(effectiveDay, {
        ...(mapOverride === null
          ? {}
          : {
              expandedCandidateGroup: mapOverride.group,
              ...(mapOverride.activeOptionId === undefined
                ? {}
                : { activeCandidateOptionId: mapOverride.activeOptionId }),
            }),
      }),
    [effectiveDay, mapOverride],
  );
  const committedOptionId = effectiveDay.nodes.find(
    ({ sourceNodeId }) => sourceNodeId === group.parentNodeId,
  )?.selectedCandidateId;
  const handleCommit = useCallback((groupId: string, optionId: string) => {
    setProgress((current) =>
      tripProgressReducer(current, {
        type: "select-candidate",
        groupId,
        candidateId: optionId,
      }),
    );
  }, []);

  return (
    <>
      <ItineraryMap
        adapter={adapter}
        presentation={presentation}
        padding={{ top: 0, right: 0, bottom: 0, left: 0 }}
        onPlaceSelect={(ownerId) => {
          const owner = decodeMapPlaceOwnerId(ownerId);
          if (owner?.kind === "candidate" && mapOverride !== null) {
            setPreviewRequest((current) => ({
              groupId: mapOverride.group.id,
              sessionId: mapOverride.sessionId,
              optionId: owner.id,
              requestId: (current?.requestId ?? 0) + 1,
            }));
          }
        }}
        onRouteSelect={() => undefined}
      />
      <CandidateDecision
        group={group}
        label="午餐候選"
        sequenceNumber={sequenceNumber}
        committedOptionId={committedOptionId}
        mapPreviewRequest={previewRequest}
        onMapOverrideChange={setMapOverride}
        onCommit={handleCommit}
        onLocateOption={(optionId) =>
          adapter.focus({ kind: "place", id: candidateMapOwnerId(optionId) })
        }
      />
      <output aria-label="candidate progress">
        {JSON.stringify(progress.selectedCandidateIds)}
      </output>
    </>
  );
}

describe("CandidateDecision single selection", () => {
  it("uses recipe-neutral structural layout instead of inline presentation locks", async () => {
    mountBaseStyles();
    const user = userEvent.setup();
    render(
      <Harness
        adapter={new FakeMapAdapter()}
        group={singleGroup}
        sequenceNumber={2}
      />,
    );

    const trigger = screen.getByRole("button", { name: "重新比較 午餐候選" });
    await user.click(trigger);
    const decision = trigger.closest(".candidate-decision");
    const summary = decision?.querySelector(".candidate-decision__summary");
    const option = screen.getByRole("radio", { name: "2A · A" }).closest("label");

    expect(decision).not.toHaveAttribute("style");
    expect(getComputedStyle(decision!).display).toBe("grid");
    expect(getComputedStyle(summary!).display).toBe("grid");
    expect(getComputedStyle(option!).display).toBe("grid");
  });

  it("keeps committed A separate from draft B and synchronizes the numbered list with the main map", async () => {
    const user = userEvent.setup();
    const adapter = new FakeMapAdapter();
    const progress: TripProgressV1 = {
      ...emptyTripProgress(),
      selectedCandidateIds: { "meal-options": "meal-a" },
    };
    render(
      <Harness
        adapter={adapter}
        group={singleGroup}
        initialProgress={progress}
        sequenceNumber={2}
      />,
    );
    await waitFor(() => expect(adapter.renderCalls.length).toBeGreaterThan(0));
    const trigger = screen.getByRole("button", { name: "重新比較 午餐候選" });

    await user.click(trigger);
    const group = screen.getByRole("group", { name: "午餐候選" });
    const radioA = within(group).getByRole("radio", { name: "2A · A" });
    const radioB = within(group).getByRole("radio", { name: "2B · B" });
    const radioC = within(group).getByRole("radio", {
      name: "2C · C尚未定位",
    });
    expect(radioA).toBeChecked();
    expect(screen.getByText("目前已選 · A")).toBeVisible();
    expect(within(group).queryByRole("button", { name: /2A|2B/ })).not.toBeInTheDocument();
    expect(screen.getAllByRole("region", { name: "Trip map" })).toHaveLength(1);
    expect(
      adapter.renderCalls.at(-1)?.places.map(({ ownerId, label }) => ({ ownerId, label })),
    ).toEqual([
      { ownerId: nodeMapOwnerId("museum"), label: "Museum" },
      { ownerId: candidateMapOwnerId("meal-a"), label: "2A · A" },
      { ownerId: candidateMapOwnerId("meal-b"), label: "2B · B" },
    ]);

    await user.click(radioB);
    expect(adapter.focusCalls.at(-1)).toEqual({
      kind: "place",
      id: candidateMapOwnerId("meal-b"),
    });
    const locatableFocusCount = adapter.focusCalls.length;
    await user.click(radioC);
    expect(radioC).toBeChecked();
    expect(adapter.focusCalls).toHaveLength(locatableFocusCount);

    act(() => adapter.emitPlaceSelect(candidateMapOwnerId("meal-b")));
    await waitFor(() => expect(radioB).toBeChecked());
    expect(radioB).toHaveFocus();
    expect(screen.getByText("目前已選 · A")).toBeVisible();
    expect(screen.getByLabelText("candidate progress")).toHaveTextContent(
      JSON.stringify({ "meal-options": "meal-a" }),
    );

    await user.click(screen.getByRole("button", { name: "取消候選比較" }));
    await user.click(screen.getByRole("button", { name: "重新比較 午餐候選" }));
    expect(within(screen.getByRole("group", { name: "午餐候選" })).getByRole(
      "radio",
      { name: "2A · A" },
    )).toBeChecked();
  });

  it("confirms B, closes to selected-only map state, restores the exact trigger, and announces it", async () => {
    const user = userEvent.setup();
    const adapter = new FakeMapAdapter();
    render(
      <Harness
        adapter={adapter}
        group={singleGroup}
        initialProgress={{
          ...emptyTripProgress(),
          selectedCandidateIds: { "meal-options": "meal-a" },
        }}
        sequenceNumber={2}
      />,
    );
    await waitFor(() => expect(adapter.renderCalls.length).toBeGreaterThan(0));
    await user.click(screen.getByRole("button", { name: "重新比較 午餐候選" }));
    await user.click(screen.getByRole("radio", { name: "2B · B" }));
    await user.click(screen.getByRole("button", { name: "確認選擇 B" }));

    const compareAgain = screen.getByRole("button", { name: "重新比較 午餐候選" });
    expect(compareAgain).toHaveFocus();
    expect(screen.queryByRole("group", { name: "午餐候選" })).not.toBeInTheDocument();
    expect(screen.getByText("已選 · B")).toBeVisible();
    const status = screen.getByRole("status", { name: "候選選擇狀態" });
    expect(status).toHaveAttribute("aria-live", "polite");
    expect(status).toHaveTextContent("已選擇 B");
    expect(screen.getByLabelText("candidate progress")).toHaveTextContent(
      JSON.stringify({ "meal-options": "meal-b" }),
    );
    await waitFor(() =>
      expect(adapter.renderCalls.at(-1)?.places).toEqual([
        {
          ownerId: nodeMapOwnerId("museum"),
          label: "Museum",
          coordinates: { lat: 25.03, lng: 121.51 },
          tone: "default",
        },
        {
          ownerId: nodeMapOwnerId("meal"),
          label: "B",
          coordinates: { lat: 25.05, lng: 121.53 },
          tone: "default",
        },
      ]),
    );
  });
});

describe("CandidateDecision browse pool", () => {
  it("publishes every locatable snack on the main map without radios, confirmation, or a winner", async () => {
    const user = userEvent.setup();
    const adapter = new FakeMapAdapter();
    const browseGroup: CandidateGroup = {
      ...singleGroup,
      id: "snack-pool",
      mode: "browse",
      defaultOptionId: undefined,
      options: singleGroup.options.map((option, index) => ({
        ...option,
        id: `snack-${index}`,
        title: `Snack ${String.fromCharCode(65 + index)}`,
      })),
    };
    render(
      <Harness adapter={adapter} group={browseGroup} sequenceNumber={3} />,
    );
    await waitFor(() => expect(adapter.renderCalls.length).toBeGreaterThan(0));

    await user.click(screen.getByRole("button", { name: "查看 午餐候選 候選" }));
    const list = screen.getByRole("list", { name: "午餐候選" });
    expect(within(list).getByRole("button", { name: "定位 3A · Snack A" })).toBeVisible();
    expect(screen.queryByRole("radio")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /確認選擇/ })).not.toBeInTheDocument();
    expect(screen.queryByText(/已選/)).not.toBeInTheDocument();
    expect(screen.getByLabelText("candidate progress")).toHaveTextContent("{}");
    expect(
      adapter.renderCalls.at(-1)?.places
        .filter(({ ownerId }) => decodeMapPlaceOwnerId(ownerId)?.kind === "candidate")
        .map(({ ownerId, label, tone }) => ({ ownerId, label, tone })),
    ).toEqual([
      {
        ownerId: candidateMapOwnerId("snack-0"),
        label: "3A · Snack A",
        tone: "candidate",
      },
      {
        ownerId: candidateMapOwnerId("snack-1"),
        label: "3B · Snack B",
        tone: "candidate",
      },
    ]);

    await user.click(within(list).getByRole("button", { name: "定位 3B · Snack B" }));
    expect(adapter.focusCalls.at(-1)).toEqual({
      kind: "place",
      id: candidateMapOwnerId("snack-1"),
    });
    expect(screen.getByLabelText("candidate progress")).toHaveTextContent("{}");

    const snackA = within(list).getByRole("button", {
      name: "定位 3A · Snack A",
    });
    act(() => adapter.emitPlaceSelect(candidateMapOwnerId("snack-0")));
    await waitFor(() => expect(snackA).toHaveFocus());
    expect(screen.queryByRole("radio")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /確認選擇/ })).not.toBeInTheDocument();
    expect(screen.getByLabelText("candidate progress")).toHaveTextContent("{}");
  });
});
