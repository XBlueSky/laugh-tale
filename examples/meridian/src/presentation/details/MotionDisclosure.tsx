import { useEffect, useRef, useState, type ReactNode } from "react";

/** Visual presence only. Selection, focus and progress remain controller-owned. */
export function MotionDisclosure({ open, children }: { open: boolean; children: ReactNode }) {
  const element = useRef<HTMLDivElement>(null);
  const [presence, setPresence] = useState({ open, present: open });
  // A prop reversal is known during render. Keep its footprint in this same
  // commit instead of cascading an extra render from an effect on every open.
  if (presence.open !== open) setPresence({ open, present: open || presence.present });
  const present = presence.present;
  useEffect(() => {
    if (open) return;
    if (!present || !element.current) return;
    const surface = element.current;
    // Read actual computed durations: media overrides and disabled CSS must
    // retire content immediately, without depending on transition events.
    const durations = getComputedStyle(surface).transitionDuration.split(",").map(value => {
      const duration = Number.parseFloat(value);
      return Number.isFinite(duration) ? duration * (value.trim().endsWith("ms") ? 1 : 1000) : 0;
    });
    const duration = Math.max(0, ...durations);
    const finish = () => setPresence(current => current.open ? current : { ...current, present: false });
    const ended = (event: TransitionEvent) => {
      if (event.target === surface && event.propertyName === "grid-template-rows") finish();
    };
    surface.addEventListener("transitionend", ended);
    // Hidden tabs / interrupted CSS do not always deliver transitionend.
    const timer = window.setTimeout(finish, duration === 0 ? 0 : duration + 50);
    return () => { surface.removeEventListener("transitionend", ended); window.clearTimeout(timer); };
  }, [open, present]);
  return <div ref={element} className="oak-detail-motion" data-open={open} inert={!open} aria-hidden={!open}>
    <div className="oak-detail-motion-content">{(open || present) && children}</div>
  </div>;
}
