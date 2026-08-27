import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type {
  CandidateGroup,
  CandidateMapOverride,
  CandidatePreviewRequest,
} from "@laugh-tale/core";
import { useCandidateDecision } from "@laugh-tale/react";

afterEach(cleanup);

const group: CandidateGroup = {
  id: "dinner-group",
  parentNodeId: "dinner",
  mode: "single",
  options: [
    { id: "dinner-a", title: "Dinner A" },
    { id: "dinner-b", title: "Dinner B" },
  ],
};

interface HookOptions {
  committedOptionId?: string;
  mapPreviewRequest?: CandidatePreviewRequest;
  overrideGroup?: CandidateGroup;
  groupOverride?: CandidateGroup;
}

function setup(options: HookOptions = {}) {
  const overrides: (CandidateMapOverride | null)[] = [];
  const onMapOverrideChange = vi.fn((override: CandidateMapOverride | null) => {
    overrides.push(override);
  });
  const onConfirm = vi.fn();
  const view = renderHook(
    (props: HookOptions) =>
      useCandidateDecision({
        group: props.groupOverride ?? group,
        committedOptionId: props.committedOptionId,
        mapPreviewRequest: props.mapPreviewRequest,
        overrideGroup: props.overrideGroup,
        onMapOverrideChange,
        onConfirm,
      }),
    { initialProps: options },
  );
  return { ...view, overrides, onMapOverrideChange, onConfirm };
}

describe("useCandidateDecision", () => {
  it("opens with a committed-derived draft and emits a session override", () => {
    const view = setup({ committedOptionId: "dinner-b" });
    expect(view.overrides.at(-1)).toBeNull();

    act(() => view.result.current.openComparison());
    expect(view.result.current.open).toBe(true);
    expect(view.result.current.draftOptionId).toBe("dinner-b");
    const override = view.overrides.at(-1);
    expect(override).toMatchObject({ group, activeOptionId: "dinner-b" });
    expect(override?.sessionId).toBe(view.result.current.sessionId);
  });

  it("previews options, confirms once, keeps the draft, and closes", () => {
    const view = setup({});
    act(() => view.result.current.openComparison());
    act(() => view.result.current.previewOption("dinner-b"));
    expect(view.overrides.at(-1)).toMatchObject({ activeOptionId: "dinner-b" });

    act(() => view.result.current.confirmDraft());
    expect(view.onConfirm).toHaveBeenCalledExactlyOnceWith("dinner-b");
    expect(view.result.current.open).toBe(false);
    expect(view.result.current.draftOptionId).toBe("dinner-b");
    expect(view.overrides.at(-1)).toBeNull();
  });

  it("cancels without confirming and resets the draft from committed", () => {
    const view = setup({ committedOptionId: "dinner-a" });
    act(() => view.result.current.openComparison());
    act(() => view.result.current.previewOption("dinner-b"));

    act(() => view.result.current.closeComparison());
    expect(view.onConfirm).not.toHaveBeenCalled();
    expect(view.result.current.open).toBe(false);
    expect(view.result.current.draftOptionId).toBe("dinner-a");
    expect(view.overrides.at(-1)).toBeNull();
  });

  it("issues a fresh session per reopen and ignores stale map preview requests", () => {
    const view = setup({});
    act(() => view.result.current.openComparison());
    const firstSession = view.result.current.sessionId;
    act(() => view.result.current.closeComparison());
    act(() => view.result.current.openComparison());
    const secondSession = view.result.current.sessionId;
    expect(secondSession).not.toBe(firstSession);

    view.rerender({
      mapPreviewRequest: {
        groupId: "dinner-group",
        sessionId: firstSession ?? -1,
        optionId: "dinner-b",
        requestId: 1,
      },
    });
    expect(view.result.current.draftOptionId).not.toBe("dinner-b");

    view.rerender({
      mapPreviewRequest: {
        groupId: "dinner-group",
        sessionId: secondSession ?? -1,
        optionId: "dinner-b",
        requestId: 2,
      },
    });
    expect(view.result.current.draftOptionId).toBe("dinner-b");
  });

  it("emits the override group and clears the override on unmount", () => {
    const decorated: CandidateGroup = {
      ...group,
      options: group.options.map((option, index) => ({
        ...option,
        title: `${index + 1} · ${option.title}`,
      })),
    };
    const view = setup({ overrideGroup: decorated });
    act(() => view.result.current.openComparison());
    expect(view.overrides.at(-1)?.group).toEqual(decorated);

    view.unmount();
    expect(view.overrides.at(-1)).toBeNull();
  });

  it("restores focus to the trigger when the comparison closes", async () => {
    const view = setup({});
    const trigger = document.createElement("button");
    document.body.append(trigger);
    view.result.current.getTriggerProps().ref(trigger);

    act(() => view.result.current.openComparison());
    act(() => view.result.current.closeComparison());
    await act(async () => Promise.resolve());
    expect(document.activeElement).toBe(trigger);
    trigger.remove();
  });
});
