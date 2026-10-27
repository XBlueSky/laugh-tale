import type { ShoppingItemModel, TripActions } from "@laugh-tale-island/react";
import { ChevronDown } from "lucide-react";
import { catalog } from "../copy/catalog.js";
import { repeatsOwnerTitle } from "./select-owner-display.js";

const statuses = ["pending", "purchased", "unavailable", "skipped"] as const;
export function ShoppingProgress({ ownerTitle, items, editableIds, actions }: { ownerTitle?: string; items: readonly ShoppingItemModel[]; editableIds: readonly string[]; actions: Pick<TripActions, "updateProgress"> }) {
  const purchased = items.filter(item => item.status === "purchased").length;
  return <>{items.length > 0 && <p className="oak-shopping-summary" aria-live="polite">{catalog.progress.purchased} {purchased}／{items.length}</p>}<ul className="oak-shopping-progress">{items.map(item => <li key={item.id} data-shopping-id={item.id} data-status={item.status}>
    <span className="oak-shopping-copy">{!(items.length === 1 && ownerTitle !== undefined && repeatsOwnerTitle(item.title, ownerTitle)) && <span className="oak-shopping-title">{item.title}</span>}{item.note && <span className="oak-shopping-note">{item.note}</span>}{item.priority && <span className="oak-shopping-priority">{catalog.facts.priority}: {catalog.facts[item.priority]}</span>}</span>
    {editableIds.includes(item.id) ? <label>{catalog.facts.status}<span className="oak-native-select"><select value={item.status} aria-label={`${item.title} · ${catalog.facts.status}`} onChange={event => {
      const status = statuses.find(status => status === event.currentTarget.value);
      if (status) actions.updateProgress({ kind: "shopping-status", itemId: item.id, status });
    }}>{statuses.map(status => <option key={status} value={status}>{catalog.progress[status]}</option>)}</select><ChevronDown size={16} strokeWidth={1.75} aria-hidden="true" /></span></label> : <span className="oak-shopping-readonly">{catalog.progress[item.status]}</span>}
  </li>)}</ul></>;
}
