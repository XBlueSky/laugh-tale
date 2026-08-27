import { useState } from "react";
import {
  act,
  cleanup,
  fireEvent,
  render,
  renderHook,
  screen,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type {
  CandidateGroup,
  CandidateMapOverride,
  CandidatePreviewRequest,
} from "@laugh-tale-island/core";
import {
  useCandidateDecision,
  useOptionalCandidateDecision,
  type UseCandidateDecisionOptions,
} from "@laugh-tale-island/react";

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

const secondGroup: CandidateGroup = {
  id: "lunch-group",
  parentNodeId: "lunch",
  mode: "single",
  options: [
    { id: "lunch-a", title: "Lunch A" },
    { id: "lunch-b", title: "Lunch B" },
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
  it("does not re-emit a fresh override forever when inline options feed a state setter", () => {
    let renderCount = 0;
    const view = renderHook(() => {
      const [override, setOverride] = useState<CandidateMapOverride | null>(
        null,
      );
      renderCount += 1;
      if (renderCount > 12) {
        throw new Error("candidate override emission did not stabilize");
      }
      const decision = useCandidateDecision({
        group,
        onMapOverrideChange: setOverride,
        onConfirm: () => undefined,
      });
      return { decision, override };
    });

    act(() => view.result.current.decision.openComparison());

    expect(view.result.current.override).toMatchObject({
      group,
      activeOptionId: "dinner-a",
    });
    expect(renderCount).toBeLessThan(12);
  });

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

describe("useOptionalCandidateDecision", () => {
  function optionalOptions(
    candidateGroup: CandidateGroup,
    callbacks: Pick<
      UseCandidateDecisionOptions,
      "onMapOverrideChange" | "onConfirm"
    >,
    extra: Partial<UseCandidateDecisionOptions> = {},
  ): UseCandidateDecisionOptions {
    return {
      group: candidateGroup,
      ...callbacks,
      ...extra,
    };
  }

  it("reattaches focus ownership when a mounted trigger changes groups", async () => {
    const callbacks = {
      onMapOverrideChange: vi.fn(),
      onConfirm: vi.fn(),
    };
    const firstOptions = optionalOptions(group, callbacks);
    const secondOptions = optionalOptions(secondGroup, callbacks);

    function TriggerHarness({ candidateGroupId }: { candidateGroupId: string }) {
      const decision = useOptionalCandidateDecision(
        candidateGroupId === group.id ? firstOptions : secondOptions,
      );
      if (decision === null) return null;
      const triggerProps = decision.getTriggerProps();
      return (
        <>
          <button
            ref={triggerProps.ref}
            type="button"
            onClick={triggerProps.onClick}
            aria-expanded={triggerProps["aria-expanded"]}
          >
            {candidateGroupId} trigger
          </button>
          {decision.open ? (
            <button type="button" onClick={decision.closeComparison}>
              Close comparison
            </button>
          ) : null}
        </>
      );
    }

    const view = render(<TriggerHarness candidateGroupId={group.id} />);
    fireEvent.click(screen.getByRole("button", { name: `${group.id} trigger` }));
    view.rerender(<TriggerHarness candidateGroupId={secondGroup.id} />);
    fireEvent.click(
      screen.getByRole("button", { name: `${secondGroup.id} trigger` }),
    );
    const close = screen.getByRole("button", { name: "Close comparison" });
    close.focus();
    fireEvent.click(close);
    await act(async () => Promise.resolve());

    expect(document.activeElement).toBe(
      screen.getByRole("button", { name: `${secondGroup.id} trigger` }),
    );
  });

  it("clears the prior override owner when the callback channel changes", () => {
    const firstOwner = vi.fn();
    const secondOwner = vi.fn();
    const onConfirm = vi.fn();
    const view = renderHook<
      ReturnType<typeof useOptionalCandidateDecision>,
      { onMapOverrideChange: UseCandidateDecisionOptions["onMapOverrideChange"] }
    >(
      ({ onMapOverrideChange }) =>
        useOptionalCandidateDecision({
          group,
          onMapOverrideChange,
          onConfirm,
        }),
      { initialProps: { onMapOverrideChange: firstOwner } },
    );
    act(() => view.result.current?.openComparison());
    expect(firstOwner.mock.calls.at(-1)?.[0]).toMatchObject({ group });

    view.rerender({ onMapOverrideChange: secondOwner });

    expect(firstOwner.mock.calls.at(-1)?.[0]).toBeNull();
    expect(secondOwner.mock.calls.at(-1)?.[0]).toMatchObject({ group });
  });

  it("transitions null to a group, reinitializes for a different group, and clears on null", () => {
    const onMapOverrideChange = vi.fn();
    const onConfirm = vi.fn();
    const callbacks = { onMapOverrideChange, onConfirm };
    const view = renderHook<
      ReturnType<typeof useOptionalCandidateDecision>,
      { options: UseCandidateDecisionOptions | null }
    >(
      ({ options }: { options: UseCandidateDecisionOptions | null }) =>
        useOptionalCandidateDecision(options),
      { initialProps: { options: null } },
    );
    expect(view.result.current).toBeNull();

    view.rerender({
      options: optionalOptions(group, callbacks, {
        committedOptionId: "dinner-b",
      }),
    });
    expect(view.result.current).toMatchObject({
      open: false,
      draftOptionId: "dinner-b",
    });
    act(() => view.result.current?.openComparison());
    expect(onMapOverrideChange.mock.calls.at(-1)?.[0]).toMatchObject({
      group,
      activeOptionId: "dinner-b",
    });

    view.rerender({
      options: optionalOptions(secondGroup, callbacks, {
        committedOptionId: "lunch-a",
      }),
    });
    expect(view.result.current).toMatchObject({
      open: false,
      sessionId: null,
      draftOptionId: "lunch-a",
    });
    expect(onMapOverrideChange.mock.calls.at(-1)?.[0]).toBeNull();

    view.rerender({ options: null });
    expect(view.result.current).toBeNull();
    expect(onMapOverrideChange.mock.calls.at(-1)?.[0]).toBeNull();
  });

  it("restores the active group's trigger focus but emits no stale focus after removal", async () => {
    const onMapOverrideChange = vi.fn();
    const options = optionalOptions(group, {
      onMapOverrideChange,
      onConfirm: vi.fn(),
    });
    const view = renderHook<
      ReturnType<typeof useOptionalCandidateDecision>,
      { value: UseCandidateDecisionOptions | null }
    >(
      ({ value }: { value: UseCandidateDecisionOptions | null }) =>
        useOptionalCandidateDecision(value),
      { initialProps: { value: options } },
    );
    const trigger = document.createElement("button");
    const unrelated = document.createElement("button");
    document.body.append(trigger, unrelated);
    view.result.current?.getTriggerProps().ref(trigger);

    act(() => view.result.current?.openComparison());
    act(() => view.result.current?.closeComparison());
    await act(async () => Promise.resolve());
    expect(document.activeElement).toBe(trigger);

    unrelated.focus();
    view.rerender({ value: null });
    await act(async () => Promise.resolve());
    expect(document.activeElement).toBe(unrelated);
    trigger.remove();
    unrelated.remove();
  });

  it("rejects a stale preview from the prior group and clears override/ref state on cleanup", () => {
    const onMapOverrideChange = vi.fn();
    const callbacks = { onMapOverrideChange, onConfirm: vi.fn() };
    const view = renderHook<
      ReturnType<typeof useOptionalCandidateDecision>,
      { value: UseCandidateDecisionOptions | null }
    >(
      ({ value }: { value: UseCandidateDecisionOptions | null }) =>
        useOptionalCandidateDecision(value),
      {
        initialProps: {
          value: optionalOptions(group, callbacks),
        },
      },
    );
    act(() => view.result.current?.openComparison());
    const staleSessionId = view.result.current?.sessionId ?? -1;

    view.rerender({
      value: optionalOptions(secondGroup, callbacks, {
        committedOptionId: "lunch-a",
        mapPreviewRequest: {
          groupId: group.id,
          sessionId: staleSessionId,
          optionId: "dinner-b",
          requestId: 19,
        },
      }),
    });
    expect(view.result.current?.draftOptionId).toBe("lunch-a");
    expect(view.result.current?.sessionId).toBeNull();

    view.unmount();
    expect(onMapOverrideChange.mock.calls.at(-1)?.[0]).toBeNull();
  });
});
