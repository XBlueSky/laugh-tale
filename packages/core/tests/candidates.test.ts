import { describe, expect, it } from "vitest";

import {
  candidateMapOverrideFor,
  candidateSessionReducer,
  initialCandidateDraftId,
  isValidCandidatePreviewRequest,
  type CandidateGroup,
  type CandidateSessionState,
} from "@laugh-tale/core";

const group: CandidateGroup = {
  id: "dinner-group",
  parentNodeId: "dinner",
  mode: "single",
  defaultOptionId: "dinner-b",
  options: [
    { id: "dinner-a", title: "Dinner A" },
    { id: "dinner-b", title: "Dinner B" },
    { id: "dinner-c", title: "Dinner C" },
  ],
};

const closed: CandidateSessionState = { sessionId: null, draftOptionId: undefined };

describe("initialCandidateDraftId", () => {
  it("prefers committed, then the group default, then the first option", () => {
    expect(initialCandidateDraftId(group, "dinner-c")).toBe("dinner-c");
    expect(initialCandidateDraftId(group, "missing")).toBe("dinner-b");
    expect(initialCandidateDraftId({ ...group, defaultOptionId: undefined }, undefined)).toBe(
      "dinner-a",
    );
    expect(
      initialCandidateDraftId({ ...group, defaultOptionId: undefined, options: [] }, undefined),
    ).toBeUndefined();
  });
});

describe("candidateSessionReducer", () => {
  it("open starts a session with a committed-derived draft", () => {
    const state = candidateSessionReducer(group, closed, {
      type: "open",
      sessionId: 7,
      committedOptionId: "dinner-c",
    });
    expect(state).toEqual({ sessionId: 7, draftOptionId: "dinner-c" });
  });

  it("preview updates the draft only for options that exist while open", () => {
    const open = candidateSessionReducer(group, closed, { type: "open", sessionId: 1 });
    expect(candidateSessionReducer(group, open, { type: "preview", optionId: "dinner-c" }))
      .toEqual({ sessionId: 1, draftOptionId: "dinner-c" });
    expect(candidateSessionReducer(group, open, { type: "preview", optionId: "missing" }))
      .toEqual(open);
    expect(candidateSessionReducer(group, closed, { type: "preview", optionId: "dinner-c" }))
      .toEqual(closed);
  });

  it("preview never drafts in browse mode", () => {
    const browse: CandidateGroup = { ...group, mode: "browse" };
    const open = candidateSessionReducer(browse, closed, { type: "open", sessionId: 2 });
    expect(candidateSessionReducer(browse, open, { type: "preview", optionId: "dinner-c" }))
      .toEqual(open);
  });

  it("close ends the session and resets the draft from committed", () => {
    const open = candidateSessionReducer(group, closed, { type: "open", sessionId: 3 });
    const previewed = candidateSessionReducer(group, open, {
      type: "preview",
      optionId: "dinner-a",
    });
    expect(
      candidateSessionReducer(group, previewed, { type: "close", committedOptionId: "dinner-c" }),
    ).toEqual({ sessionId: null, draftOptionId: "dinner-c" });
  });
});

describe("candidateMapOverrideFor", () => {
  it("returns null when the session is closed", () => {
    expect(candidateMapOverrideFor(group, closed)).toBeNull();
  });

  it("carries the group, session, and single-mode draft", () => {
    expect(
      candidateMapOverrideFor(group, { sessionId: 4, draftOptionId: "dinner-a" }),
    ).toEqual({ group, sessionId: 4, activeOptionId: "dinner-a" });
  });

  it("never sets activeOptionId for browse groups or missing drafts", () => {
    const browse: CandidateGroup = { ...group, mode: "browse" };
    expect(candidateMapOverrideFor(browse, { sessionId: 5, draftOptionId: "dinner-a" }))
      .toEqual({ group: browse, sessionId: 5 });
    expect(candidateMapOverrideFor(group, { sessionId: 6, draftOptionId: undefined }))
      .toEqual({ group, sessionId: 6 });
  });
});

describe("isValidCandidatePreviewRequest", () => {
  const request = { groupId: "dinner-group", sessionId: 8, optionId: "dinner-a", requestId: 1 };

  it("accepts only a matching group, live session, and existing option", () => {
    expect(isValidCandidatePreviewRequest(group, 8, request)).toBe(true);
    expect(isValidCandidatePreviewRequest(group, 9, request)).toBe(false);
    expect(isValidCandidatePreviewRequest(group, null, request)).toBe(false);
    expect(isValidCandidatePreviewRequest({ ...group, id: "other" }, 8, request)).toBe(false);
    expect(
      isValidCandidatePreviewRequest(group, 8, { ...request, optionId: "missing" }),
    ).toBe(false);
    expect(isValidCandidatePreviewRequest(group, 8, undefined)).toBe(false);
  });
});
