import type { EffectiveNode, Timing } from "@laugh-tale-island/core";

import type { ExperienceViewModel } from "../../controllers/presentation-contract";

function timingLabel(timing: Timing | undefined): string {
  if (timing === undefined || timing.certainty === "unknown" || timing.start === undefined) return "Time not set";
  return timing.certainty === "suggested" ? `About ${timing.start}` : timing.start;
}

function nodeTitle(nodes: readonly EffectiveNode[], id: string | null): { node: EffectiveNode | undefined; index: number } {
  const index = id === null ? -1 : nodes.findIndex((item) => item.sourceNodeId === id);
  return { node: index >= 0 ? nodes[index] : undefined, index };
}

export function NowNextBoard({ model }: { model: ExperienceViewModel }) {
  const current = nodeTitle(model.effectiveDay.nodes, model.live.currentNodeId);
  const next = nodeTitle(model.effectiveDay.nodes, model.live.nextNodeId);
  const currentId = model.live.currentNodeId ?? "none";
  const nextId = model.live.nextNodeId ?? "none";
  return (
    <section className="now-next" aria-label="Now and next journey status" data-contract-state="now-next" data-current-node-id={currentId} data-next-node-id={nextId}>
      <div className="now-next__heading">
        <span className="live-kicker">LIVE BOARD</span>
        <strong>Now / Next</strong>
        <span className="now-next__clock">{model.clock.instant} · {model.clock.timezone}</span>
      </div>
      <article className="now-next__slot now-next__slot--now" data-owner-id={currentId} data-live-position="current" data-urgency={current.node === undefined ? "settled" : "current"}>
        <span className="now-next__label">NOW</span>
        <span className="now-next__index">{current.index < 0 ? "—" : String(current.index + 1).padStart(2, "0")}</span>
        <div><strong>{current.node?.node.title ?? "No current stop"}</strong><span>{current.node === undefined ? "The controller has no current owner." : timingLabel(current.node.node.timing)}</span></div>
      </article>
      <article className="now-next__slot now-next__slot--next" data-owner-id={nextId} data-live-position="next" data-urgency={next.node === undefined ? "settled" : "next"}>
        <span className="now-next__label">NEXT</span>
        <span className="now-next__index">{next.index < 0 ? "—" : String(next.index + 1).padStart(2, "0")}</span>
        <div><strong>{next.node?.node.title ?? "No next stop"}</strong><span>{next.node === undefined ? "No upcoming owner is available." : timingLabel(next.node.node.timing)}</span></div>
      </article>
    </section>
  );
}
