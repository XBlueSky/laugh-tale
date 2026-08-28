import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { ShoppingItem, ShoppingStatus } from "@laugh-tale-island/core";
import {
  isTerminalShoppingStatus,
  resolveShoppingStatus,
  ShoppingStatusSelect,
} from "./ShoppingStatusSelect";

function mountBaseStyles(): void {
  const style = document.createElement("style");
  style.dataset.task9TestStyle = "true";
  style.textContent = readFileSync("src/presentation/styles/base.css", "utf8");
  document.head.append(style);
}

afterEach(() => {
  cleanup();
  document.querySelectorAll('style[data-task9-test-style="true"]').forEach((style) => style.remove());
});

const item: ShoppingItem = {
  id: "camera",
  title: "Travel camera",
  priority: "must",
  initialStatus: "purchased",
};

describe("ShoppingStatusSelect", () => {
  it("uses one labeled native select with all four exact statuses and a 44px visual target", async () => {
    mountBaseStyles();
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <ShoppingStatusSelect
        item={item}
        status="pending"
        onChange={onChange}
      />,
    );

    const select = screen.getByRole("combobox", {
      name: "Travel camera 採買狀態",
    });
    expect(select.tagName).toBe("SELECT");
    expect(select).toHaveValue("pending");
    expect(select).toHaveAttribute("data-touch-target", "44");
    expect(select).toHaveClass("shopping-status-select__control");
    expect(
      within(select).getAllByRole("option").map((option) => option.getAttribute("value")),
    ).toEqual(["pending", "purchased", "unavailable", "skipped"]);
    expect(within(select).getByRole("option", { name: "待採買" })).toBeVisible();
    expect(within(select).getByRole("option", { name: "已購入" })).toBeVisible();
    expect(within(select).getByRole("option", { name: "缺貨" })).toBeVisible();
    expect(within(select).getByRole("option", { name: "略過" })).toBeVisible();

    const wrapper = select.closest(".shopping-status-select");
    expect(wrapper).not.toHaveAttribute("style");
    expect(select).not.toHaveAttribute("style");
    expect(getComputedStyle(select).minHeight).toBe("44px");
    const chevron = wrapper?.querySelector("svg");
    expect(chevron).not.toBeNull();
    expect(chevron).toHaveAttribute("aria-hidden", "true");
    expect(chevron).not.toHaveAttribute("style");
    expect(chevron).toHaveClass("shopping-status-select__chevron");
    expect(getComputedStyle(chevron!).pointerEvents).toBe("none");

    await user.selectOptions(select, "unavailable");
    expect(onChange).toHaveBeenCalledWith("unavailable");
  });

  it.each([
    ["pending", false],
    ["purchased", true],
    ["unavailable", false],
    ["skipped", true],
  ] as const)("treats %s terminal state as %s", (status, terminal) => {
    expect(isTerminalShoppingStatus(status)).toBe(terminal);
  });

  it("keeps a seed-purchased default until an explicit own progress value overrides it", () => {
    expect(resolveShoppingStatus(item, {})).toBe("purchased");
    expect(resolveShoppingStatus(item, { camera: "pending" })).toBe("pending");

    const inherited = Object.create({ camera: "skipped" }) as Record<
      string,
      ShoppingStatus
    >;
    expect(resolveShoppingStatus(item, inherited)).toBe("purchased");

    const special: ShoppingItem = {
      id: "__proto__",
      title: "Prototype-safe item",
      initialStatus: "purchased",
    };
    const own = Object.create(null) as Record<string, ShoppingStatus>;
    Object.defineProperty(own, "__proto__", {
      enumerable: true,
      value: "unavailable",
    });
    expect(resolveShoppingStatus(special, own)).toBe("unavailable");
  });
});
