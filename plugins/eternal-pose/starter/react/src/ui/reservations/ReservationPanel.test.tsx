import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { readFileSync } from "node:fs";
import { StrictMode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Reservation } from "@laugh-tale-island/core";
import { ReservationPanel } from "./ReservationPanel";

const reservations: Reservation[] = [
  {
    id: "observatory",
    title: "Observatory admission",
    ownerId: "experience",
    booking: {
      status: "confirmed",
      reference: "PRIVATE-OBSERVATORY-42",
      url: "https://example.test/reservations/observatory",
      arrivalBufferMinutes: 15,
    },
  },
  {
    id: "meal",
    title: "Meal request",
    ownerId: "meal-a",
    booking: {
      status: "pending",
      reference: "PRIVATE-MEAL-7",
      url: "javascript:alert(1)",
    },
  },
];

let originalShowModal: PropertyDescriptor | undefined;
let originalClose: PropertyDescriptor | undefined;
let showModalSpy: ReturnType<typeof vi.fn>;
let closeSpy: ReturnType<typeof vi.fn>;

function mountBaseStyles(): void {
  const style = document.createElement("style");
  style.dataset.task9TestStyle = "true";
  style.textContent = readFileSync("src/ui/styles/base.css", "utf8");
  document.head.append(style);
}

function expectAsymmetricSafeDialogGeometry(selector: string): void {
  const css = readFileSync("src/ui/styles/base.css", "utf8");
  const rule = css.match(
    /\.task-widget__dialog,\s*\.reservation-panel__dialog\s*\{([\s\S]*?)\n\}/,
  );
  expect(rule?.[0]).toContain(selector);
  const body = (rule?.[1] ?? "").replace(/\s+/g, " ");
  const independentlyPositioned =
    body.includes(
      "inset-inline-start: max(var(--space-3), env(safe-area-inset-left))",
    ) &&
    body.includes(
      "inset-inline-end: max(var(--space-3), env(safe-area-inset-right))",
    ) &&
    body.includes("margin: auto");
  const viewportWidth = 390;
  const safeLeftWithGap = 12;
  const safeRightWithGap = 21;
  const maxDialogWidth = viewportWidth - safeLeftWithGap - safeRightWithGap;
  const left = independentlyPositioned
    ? safeLeftWithGap
    : (viewportWidth - maxDialogWidth) / 2;

  expect(left).toBe(safeLeftWithGap);
  expect(viewportWidth - left - maxDialogWidth).toBe(safeRightWithGap);
  expect(left + maxDialogWidth / 2).toBe(
    (safeLeftWithGap + viewportWidth - safeRightWithGap) / 2,
  );
  expect(body).toContain("max-width: calc(");
  expect(body).toContain("100vw");
}

beforeEach(() => {
  originalShowModal = Object.getOwnPropertyDescriptor(
    HTMLDialogElement.prototype,
    "showModal",
  );
  originalClose = Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, "close");
  showModalSpy = vi.fn(function showModal(this: HTMLDialogElement) {
    this.setAttribute("open", "");
    this.querySelector<HTMLElement>("button, a")?.focus();
  });
  Object.defineProperty(HTMLDialogElement.prototype, "showModal", {
    configurable: true,
    value: showModalSpy,
  });
  closeSpy = vi.fn(function close(this: HTMLDialogElement) {
    this.removeAttribute("open");
  });
  Object.defineProperty(HTMLDialogElement.prototype, "close", {
    configurable: true,
    value: closeSpy,
  });
});

afterEach(() => {
  cleanup();
  document.querySelectorAll('style[data-task9-test-style="true"]').forEach((style) => style.remove());
  vi.restoreAllMocks();
  if (originalShowModal === undefined) {
    Reflect.deleteProperty(HTMLDialogElement.prototype, "showModal");
  } else {
    Object.defineProperty(HTMLDialogElement.prototype, "showModal", originalShowModal);
  }
  if (originalClose === undefined) {
    Reflect.deleteProperty(HTMLDialogElement.prototype, "close");
  } else {
    Object.defineProperty(HTMLDialogElement.prototype, "close", originalClose);
  }
});

describe("ReservationPanel", () => {
  it("opens one native modal and keeps private references absent until an explicit reveal", async () => {
    mountBaseStyles();
    expectAsymmetricSafeDialogGeometry(".reservation-panel__dialog");
    const user = userEvent.setup();
    const { container } = render(<ReservationPanel reservations={reservations} />);
    const trigger = screen.getByRole("button", { name: "開啟訂位資訊" });
    expect(trigger).toHaveAttribute("data-touch-target", "44");
    expect(trigger.querySelector("svg")).not.toBeNull();
    expect(container.querySelectorAll("dialog")).toHaveLength(1);
    expect(screen.queryByText("PRIVATE-OBSERVATORY-42")).not.toBeInTheDocument();

    await user.click(trigger);
    const dialog = screen.getByRole("dialog", { name: "訂位資訊" });
    expect(dialog.tagName).toBe("DIALOG");
    expect(screen.getAllByRole("dialog")).toHaveLength(1);
    expect(showModalSpy).toHaveBeenCalledTimes(1);
    const dialogSurface = dialog.querySelector(".reservation-panel__dialog-surface");
    expect(getComputedStyle(dialogSurface!).display).toBe("flex");
    expect(getComputedStyle(within(dialog).getByRole("list")).overflowY).toBe("auto");
    expect(within(dialog).getByText("Observatory admission")).toBeVisible();
    expect(within(dialog).getByText("已確認")).toBeVisible();
    expect(within(dialog).getByText("待確認")).toBeVisible();
    expect(within(dialog).queryByText("PRIVATE-OBSERVATORY-42")).not.toBeInTheDocument();
    expect(within(dialog).queryByText("PRIVATE-MEAL-7")).not.toBeInTheDocument();

    await user.click(
      within(dialog).getByRole("button", {
        name: "顯示 Observatory admission 訂位代碼",
      }),
    );
    expect(within(dialog).getByText("PRIVATE-OBSERVATORY-42")).toBeVisible();
    const bookingLink = within(dialog).getByRole("link", {
      name: "開啟 Observatory admission 訂位頁面",
    });
    expect(bookingLink).toHaveAttribute("href", "https://example.test/reservations/observatory");
    expect(bookingLink).toHaveAttribute("data-touch-target", "44");
    expect(getComputedStyle(bookingLink).minHeight).toBe("44px");
    const dialogRule = readFileSync("src/ui/styles/base.css", "utf8").match(
      /\.task-widget__dialog,[\s\S]*?\n}/,
    )?.[0];
    expect(dialogRule).toContain("env(safe-area-inset-top)");
    expect(dialogRule).toContain("env(safe-area-inset-right)");
    expect(dialogRule).toContain("env(safe-area-inset-bottom)");
    expect(dialogRule).toContain("env(safe-area-inset-left)");
    expect(within(dialog).queryByRole("link", { name: /Meal request/ })).not.toBeInTheDocument();
  });

  it("handles cancel, backdrop, and close with exact trigger focus restoration and re-hides references", async () => {
    const user = userEvent.setup();
    render(<ReservationPanel reservations={reservations} />);
    const trigger = screen.getByRole("button", { name: "開啟訂位資訊" });

    await user.click(trigger);
    let dialog = screen.getByRole("dialog", { name: "訂位資訊" });
    await user.click(
      within(dialog).getByRole("button", {
        name: "顯示 Observatory admission 訂位代碼",
      }),
    );
    expect(within(dialog).getByText("PRIVATE-OBSERVATORY-42")).toBeVisible();
    fireEvent(dialog, new Event("cancel", { bubbles: false, cancelable: true }));
    expect(dialog).not.toHaveAttribute("open");
    expect(trigger).toHaveFocus();

    await user.click(trigger);
    dialog = screen.getByRole("dialog", { name: "訂位資訊" });
    expect(within(dialog).queryByText("PRIVATE-OBSERVATORY-42")).not.toBeInTheDocument();
    fireEvent.click(dialog);
    expect(dialog).not.toHaveAttribute("open");
    expect(trigger).toHaveFocus();

    await user.click(trigger);
    dialog = screen.getByRole("dialog", { name: "訂位資訊" });
    await user.click(within(dialog).getByRole("button", { name: "關閉訂位資訊" }));
    expect(dialog).not.toHaveAttribute("open");
    expect(trigger).toHaveFocus();
  });

  it("restores its own trigger after programmatic activation that never focused it", () => {
    render(
      <>
        <button type="button">Other control</button>
        <ReservationPanel reservations={reservations} />
      </>,
    );
    const other = screen.getByRole("button", { name: "Other control" });
    const trigger = screen.getByRole("button", { name: "開啟訂位資訊" });
    other.focus();
    fireEvent.click(trigger);
    const dialog = screen.getByRole("dialog", { name: "訂位資訊" });
    fireEvent.click(within(dialog).getByRole("button", { name: "關閉訂位資訊" }));

    expect(trigger).toHaveFocus();
  });

  it("does not fake an open modal when showModal is unavailable", () => {
    Reflect.deleteProperty(HTMLDialogElement.prototype, "showModal");
    const { container } = render(<ReservationPanel reservations={reservations} />);
    fireEvent.click(screen.getByRole("button", { name: "開啟訂位資訊" }));

    expect(container.querySelector("dialog")).not.toHaveAttribute("open");
    expect(screen.getByRole("status", { name: "無法開啟訂位資訊" })).toBeVisible();
  });

  it("closes an open native reservation dialog during StrictMode-safe cleanup", async () => {
    const user = userEvent.setup();
    const { unmount } = render(
      <StrictMode>
        <ReservationPanel reservations={reservations} />
      </StrictMode>,
    );
    await user.click(screen.getByRole("button", { name: "開啟訂位資訊" }));
    expect(screen.getByRole("dialog", { name: "訂位資訊" })).toHaveAttribute("open");

    unmount();
    expect(closeSpy).toHaveBeenCalled();
  });
});
