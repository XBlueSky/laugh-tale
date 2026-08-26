import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Reservation } from "../../trip-core/model";
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

function mountBaseStyles(): void {
  const style = document.createElement("style");
  style.dataset.task9TestStyle = "true";
  style.textContent = readFileSync("src/ui/styles/base.css", "utf8");
  document.head.append(style);
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
  Object.defineProperty(HTMLDialogElement.prototype, "close", {
    configurable: true,
    value: vi.fn(function close(this: HTMLDialogElement) {
      this.removeAttribute("open");
    }),
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
    expect(
      within(dialog).getByRole("link", { name: "開啟 Observatory admission 訂位頁面" }),
    ).toHaveAttribute("href", "https://example.test/reservations/observatory");
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
});
