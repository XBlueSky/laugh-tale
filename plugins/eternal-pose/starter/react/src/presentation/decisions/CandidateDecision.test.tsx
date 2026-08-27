import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { CandidateGroup, TripNode } from "@laugh-tale-island/core";

import type {
  CandidateViewModel,
  ExperienceActions,
  ExperienceBindings,
} from "../../controllers/presentation-contract";
import { CandidateDecision } from "./CandidateDecision";

afterEach(cleanup);

const group: CandidateGroup = {
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

const sourceNode: TripNode = {
  id: "meal",
  dayId: "day-one",
  kind: "dining",
  title: "午餐候選",
  timing: { start: "12:00", certainty: "suggested" },
  optionality: "candidate",
  payload: { candidateGroupId: group.id },
};

function model(overrides: Partial<CandidateViewModel> = {}): CandidateViewModel {
  return {
    group,
    sourceNode,
    sequenceNumber: 2,
    committedOptionId: "meal-a",
    open: true,
    sessionId: 11,
    draftOptionId: "meal-a",
    ...overrides,
  };
}

function setup(candidateModel = model()) {
  const actions = {
    openCandidate: vi.fn(),
    closeCandidate: vi.fn(),
    previewCandidate: vi.fn(),
    confirmCandidate: vi.fn(),
  } satisfies Pick<
    ExperienceActions,
    | "openCandidate"
    | "closeCandidate"
    | "previewCandidate"
    | "confirmCandidate"
  >;
  const binding: NonNullable<ExperienceBindings["candidate"]> = {
    getTriggerProps: () => ({
      ref: () => undefined,
      onClick: candidateModel.open
        ? actions.closeCandidate
        : actions.openCandidate,
      "aria-expanded": candidateModel.open,
    }),
    registerOption: () => () => undefined,
  };
  const view = render(
    <CandidateDecision
      model={candidateModel}
      binding={binding}
      actions={actions}
    />,
  );
  return { ...view, actions };
}

describe("CandidateDecision presentation", () => {
  it("renders committed and draft state with numbered candidate labels", () => {
    setup();
    const options = screen.getByRole("group", { name: "午餐候選" });
    expect(within(options).getByRole("radio", { name: "2A · A" })).toBeChecked();
    expect(within(options).getByRole("radio", { name: "2B · B" })).not.toBeChecked();
    expect(
      within(options).getByRole("radio", { name: "2C · C尚未定位" }),
    ).toBeVisible();
    expect(screen.getByText("目前已選 · A")).toBeVisible();
  });

  it("forwards trigger, preview, cancel, and confirmation through semantic channels", () => {
    const { actions } = setup(model({ draftOptionId: "meal-b" }));
    fireEvent.click(screen.getByRole("button", { name: "收合 午餐候選" }));
    expect(actions.closeCandidate).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("radio", { name: "2A · A" }));
    expect(actions.previewCandidate).toHaveBeenCalledWith("meal-a");
    fireEvent.click(screen.getByRole("button", { name: "取消候選比較" }));
    expect(actions.closeCandidate).toHaveBeenCalledTimes(2);

    fireEvent.click(screen.getByRole("button", { name: "確認選擇 B" }));
    expect(actions.confirmCandidate).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("status", { name: "候選選擇狀態" })).toHaveTextContent(
      "已選擇 B",
    );
  });

  it("keeps browse pools winner-free while forwarding locatable choices", () => {
    const browseGroup: CandidateGroup = {
      ...group,
      mode: "browse",
      defaultOptionId: undefined,
      options: group.options.slice(0, 2).map((option, index) => ({
        ...option,
        id: `snack-${index}`,
        title: `Snack ${String.fromCharCode(65 + index)}`,
      })),
    };
    const { actions } = setup(
      model({
        group: browseGroup,
        committedOptionId: undefined,
        draftOptionId: undefined,
        sequenceNumber: 3,
      }),
    );
    expect(screen.queryByRole("radio")).not.toBeInTheDocument();
    const list = screen.getByRole("list", { name: "午餐候選" });
    fireEvent.click(
      within(list).getByRole("button", { name: "定位 3B · Snack B" }),
    );
    expect(actions.previewCandidate).toHaveBeenCalledWith("snack-1");
    expect(screen.queryByText(/已選/)).not.toBeInTheDocument();
  });
});
