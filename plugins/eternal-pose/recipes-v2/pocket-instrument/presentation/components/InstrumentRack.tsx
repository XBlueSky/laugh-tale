import type { ReactNode } from "react";

export function InstrumentRack({ children, label = "Trip instrument rack" }: { children: ReactNode; label?: string }) {
  return <section className="instrument-rack-frame" aria-label={label} data-instrument-rack="true">{children}</section>;
}
