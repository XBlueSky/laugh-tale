import type { PlaceProviderResult, PlaceRequestV2 } from "@laugh-tale-island/core";
import type { PlaceAdapterV2 } from "@laugh-tale-island/core/browser";
import { describe, expect, it } from "vitest";

export interface PlaceAdapterV2ContractControl {
  readonly providerStarts: number;
  readonly providerCompletions: number;
  resolveReady(providerCall: number, fixture: PlaceContractReadyCase): void;
  beginReadyWithHeldWork(providerCall: number, fixture: PlaceContractReadyCase): void;
  heldWorkReachedReleasePoint(providerCall: number): Promise<void>;
  releaseHeldWork(providerCall: number): void;
  resolveMalformed(providerCall: number): void;
  reject(providerCall: number): void;
  throwOnNextStart(): void;
  completed(providerCall: number): Promise<void>;
}

export type PlaceContractReadyCase = "primary" | "alternate" | "abandoned" | "replacement";

export interface PlaceAdapterV2ContractHarness {
  readonly adapter: PlaceAdapterV2;
  readonly control: PlaceAdapterV2ContractControl;
  expectedReady(fixture: PlaceContractReadyCase): PlaceProviderResult;
  request(resourceId?: string, semanticOwnerId?: string): PlaceRequestV2;
  unsupportedRequest(): PlaceRequestV2;
}

function schedulePostReleaseTaskCheckpoint(): { readonly completed: Promise<void>; readonly reached: () => boolean } {
  let reached = false;
  return {
    completed: new Promise<void>((resolve) => {
      setTimeout(() => {
        reached = true;
        resolve();
      }, 0);
    }),
    reached: () => reached,
  };
}

export function definePlaceAdapterV2Contract(label: string, createHarness: () => PlaceAdapterV2ContractHarness): void {
  describe(`${label} place adapter v2 contract`, () => {
    it("suppresses provider construction for an immediately cancelled caller", async () => {
      const harness = createHarness();
      const controller = new AbortController();
      controller.abort();
      await expect(harness.adapter.load(harness.request(), controller.signal)).resolves.toMatchObject({ status: "unavailable", reason: "cancelled", retryable: false });
      expect(harness.control.providerStarts).toBe(0);
    });

    it("settles provider-started cancellation, isolates its late result, and retries/cache-clones", async () => {
      const harness = createHarness();
      const controller = new AbortController();
      const abandoned = harness.adapter.load(harness.request(), controller.signal);
      expect(harness.control.providerStarts).toBe(1);
      harness.control.beginReadyWithHeldWork(0, "abandoned");
      await harness.control.heldWorkReachedReleasePoint(0);
      let providerCompleted = false;
      void harness.control.completed(0).then(() => { providerCompleted = true; });
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
      expect(harness.control.providerCompletions).toBe(0);
      expect(providerCompleted).toBe(false);
      controller.abort();
      await expect(abandoned).resolves.toMatchObject({ status: "unavailable", reason: "cancelled", retryable: false });
      harness.control.releaseHeldWork(0);
      const postReleaseTask = schedulePostReleaseTaskCheckpoint();
      await harness.control.completed(0);
      const completionFollowedPostReleaseTask = postReleaseTask.reached();
      await postReleaseTask.completed;
      expect(completionFollowedPostReleaseTask).toBe(true);
      expect(harness.control.providerCompletions).toBe(1);
      const retry = harness.adapter.load(harness.request(), new AbortController().signal);
      expect(harness.control.providerStarts).toBe(2);
      harness.control.resolveReady(1, "replacement");
      const first = await retry;
      expect(first).toEqual(harness.expectedReady("replacement"));
      expect(first).not.toEqual(harness.expectedReady("abandoned"));
      if (first.status === "ready") first.facts.formattedAddress = "consumer mutation";
      const cached = await harness.adapter.load(harness.request(), new AbortController().signal);
      expect(cached).toEqual(harness.expectedReady("replacement"));
      expect(cached).not.toBe(first);
      expect(harness.control.providerStarts).toBe(2);
    });

    it("snapshots caller input and gives the provider result and cache independent ownership", async () => {
      const harness = createHarness();
      const input = harness.request();
      const pending = harness.adapter.load(input, new AbortController().signal);
      input.ownerId = "mutated-owner";
      input.providerReference.id = "mutated-resource";
      harness.control.resolveReady(0, "primary");
      const first = await pending;
      expect(first).toEqual(harness.expectedReady("primary"));
      if (first.status === "ready") first.facts.formattedAddress = "consumer mutation";
      const cached = await harness.adapter.load(harness.request(), new AbortController().signal);
      expect(cached).toEqual(harness.expectedReady("primary"));
      expect(cached).not.toBe(first);
    });

    it("keeps semantic owners stable while provider resources control cache identity", async () => {
      const harness = createHarness();
      const first = harness.adapter.load(harness.request("resource-x", "owner-a"), new AbortController().signal);
      harness.control.resolveReady(0, "primary");
      const firstResult = await first;
      expect(firstResult).toEqual(harness.expectedReady("primary"));
      const second = harness.adapter.load(harness.request("resource-x", "owner-b"), new AbortController().signal);
      expect(harness.control.providerStarts).toBe(1);
      const secondResult = await second;
      expect(secondResult).toEqual(harness.expectedReady("primary"));
      expect(secondResult).not.toBe(firstResult);
      const third = harness.adapter.load(harness.request("resource-y", "owner-a"), new AbortController().signal);
      expect(harness.control.providerStarts).toBe(2);
      harness.control.resolveReady(1, "alternate");
      const thirdResult = await third;
      expect(thirdResult).toEqual(harness.expectedReady("alternate"));
      expect(thirdResult).not.toEqual(firstResult);
      expect(thirdResult).not.toBe(firstResult);
    });

    it("settles thrown, rejected, malformed, and unsupported provider paths as typed failures", async () => {
      const thrown = createHarness();
      thrown.control.throwOnNextStart();
      await expect(thrown.adapter.load(thrown.request(), new AbortController().signal)).resolves.toMatchObject({ status: "unavailable", reason: "network", retryable: true });
      const rejected = createHarness();
      const rejection = rejected.adapter.load(rejected.request(), new AbortController().signal);
      rejected.control.reject(0);
      await expect(rejection).resolves.toMatchObject({ status: "unavailable", reason: "network", retryable: true });
      await rejected.control.completed(0);
      expect(rejected.control.providerCompletions).toBe(1);
      const malformed = createHarness();
      const malformedResult = malformed.adapter.load(malformed.request(), new AbortController().signal);
      malformed.control.resolveMalformed(0);
      await expect(malformedResult).resolves.toMatchObject({ status: "unavailable", reason: "malformed-response", retryable: false });
      await malformed.control.completed(0);
      expect(malformed.control.providerCompletions).toBe(1);
      const unsupported = createHarness();
      await expect(unsupported.adapter.load(unsupported.unsupportedRequest(), new AbortController().signal)).resolves.toMatchObject({ status: "unavailable", reason: "unsupported", retryable: false });
      expect(unsupported.control.providerStarts).toBe(0);
    });
  });
}
