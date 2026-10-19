export type InstrumentStatus = "ready" | "active" | "pending" | "error" | "complete" | "idle";

const labels: Record<InstrumentStatus, string> = {
  ready: "Ready",
  active: "Active",
  pending: "Pending",
  error: "Attention",
  complete: "Complete",
  idle: "Idle",
};

export function StatusLamp({ status, label = labels[status], detail }: { status: InstrumentStatus; label?: string; detail?: string }) {
  return <span className="instrument-status" data-status-lamp={status} data-status-text={detail ?? label}><span className="status-lamp" aria-hidden="true" data-lamp-color={status} /><span className="instrument-status__label">{label}</span>{detail === undefined ? null : <span className="instrument-status__detail">{detail}</span>}</span>;
}
