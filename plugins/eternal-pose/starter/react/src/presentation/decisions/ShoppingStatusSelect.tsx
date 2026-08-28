import { ChevronDown } from "lucide-react";

import type { ShoppingItem, ShoppingStatus } from "@laugh-tale-island/core";

const STATUS_OPTIONS: readonly {
  value: ShoppingStatus;
  label: string;
}[] = [
  { value: "pending", label: "待採買" },
  { value: "purchased", label: "已購入" },
  { value: "unavailable", label: "缺貨" },
  { value: "skipped", label: "略過" },
];

export interface ShoppingStatusSelectProps {
  item: ShoppingItem;
  status: ShoppingStatus;
  onChange: (status: ShoppingStatus) => void;
}

export function isTerminalShoppingStatus(status: ShoppingStatus): boolean {
  return status === "purchased" || status === "skipped";
}

export function resolveShoppingStatus(
  item: ShoppingItem,
  progressStatuses: Readonly<Record<string, ShoppingStatus>>,
): ShoppingStatus {
  return Object.hasOwn(progressStatuses, item.id)
    ? (progressStatuses[item.id] ?? "pending")
    : (item.initialStatus ?? "pending");
}

export function ShoppingStatusSelect({
  item,
  status,
  onChange,
}: ShoppingStatusSelectProps) {
  return (
    <span
      className="shopping-status-select"
      data-shopping-item={item.id}
    >
      <select
        className="shopping-status-select__control"
        aria-label={`${item.title} 採買狀態`}
        data-touch-target="44"
        value={status}
        onChange={(event) => onChange(event.currentTarget.value as ShoppingStatus)}
      >
        {STATUS_OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <ChevronDown
        className="shopping-status-select__chevron"
        aria-hidden="true"
        size={17}
        strokeWidth={1.8}
      />
    </span>
  );
}
