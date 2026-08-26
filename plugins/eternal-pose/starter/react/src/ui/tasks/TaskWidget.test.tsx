import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { readFileSync } from "node:fs";
import { StrictMode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { TripTask } from "../../trip-core/model";
import { checklistCompletionKey, taskCompletionKey } from "../../trip-core/progress";
import { TaskWidget } from "./TaskWidget";

const tasks: TripTask[] = [
  {
    id: "single-task",
    title: "Refill water",
    scope: "day",
    dayId: "day-one",
    note: "Use the fountain beside the lobby.",
    children: [{ id: "single-child", title: "Use the lobby fountain" }],
  },
  {
    id: "nested-task",
    title: "Pack documents",
    scope: "day",
    dayId: "day-one",
    children: [
      { id: "passport", title: "Pack passport" },
      { id: "booking", title: "Save booking" },
    ],
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
      "inset-block-start: max(var(--space-4), env(safe-area-inset-top))",
    ) &&
    body.includes(
      "inset-block-end: max(var(--space-4), env(safe-area-inset-bottom))",
    ) &&
    body.includes("margin: auto");
  const viewportHeight = 844;
  const safeTop = 47;
  const safeBottom = 34;
  const maxDialogHeight = viewportHeight - safeTop - safeBottom;
  const top = independentlyPositioned
    ? safeTop
    : (viewportHeight - maxDialogHeight) / 2;

  expect(top).toBe(safeTop);
  expect(viewportHeight - top - maxDialogHeight).toBe(safeBottom);
  expect(top + maxDialogHeight / 2).toBe(
    (safeTop + viewportHeight - safeBottom) / 2,
  );
  expect(body).toContain("max-height: calc(");
  expect(body).toContain("100dvh");
}

beforeEach(() => {
  originalShowModal = Object.getOwnPropertyDescriptor(
    HTMLDialogElement.prototype,
    "showModal",
  );
  originalClose = Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, "close");
  showModalSpy = vi.fn(function showModal(this: HTMLDialogElement) {
    this.setAttribute("open", "");
    this.querySelector<HTMLElement>("button, input")?.focus();
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

describe("TaskWidget", () => {
  it("opens one native day-task dialog outside the timeline and discloses only nested tasks", async () => {
    mountBaseStyles();
    expectAsymmetricSafeDialogGeometry(".task-widget__dialog");
    const user = userEvent.setup();
    render(
      <>
        <ol className="itinerary-timeline" aria-label="Day itinerary">
          <li>Timeline stop</li>
        </ol>
        <TaskWidget
          dayTitle="Harbor day"
          tasks={tasks}
          completedIds={new Set()}
          onCompletedChange={() => undefined}
        />
      </>,
    );

    const trigger = screen.getByRole("button", { name: "開啟 Harbor day 當日事項" });
    expect(trigger).toHaveAttribute("data-touch-target", "44");
    expect(trigger.querySelector("svg")).not.toBeNull();
    await user.click(trigger);

    const dialog = screen.getByRole("dialog", { name: "Harbor day 當日事項" });
    expect(dialog.tagName).toBe("DIALOG");
    expect(dialog.closest(".itinerary-timeline")).toBeNull();
    expect(screen.getAllByRole("dialog")).toHaveLength(1);
    expect(showModalSpy).toHaveBeenCalledTimes(1);
    const dialogSurface = dialog.querySelector(".task-widget__dialog-surface");
    const taskList = dialog.querySelector(".task-widget__list");
    expect(getComputedStyle(dialogSurface!).display).toBe("flex");
    expect(getComputedStyle(taskList!).overflowY).toBe("auto");
    const refillTask = screen.getByLabelText("Refill water");
    expect(refillTask).toBeEnabled();
    expect(refillTask.closest("label")).toBeVisible();
    expect(screen.getByText("Use the fountain beside the lobby.")).toBeVisible();
    expect(screen.getByText("Use the lobby fountain")).toBeVisible();
    expect(screen.queryByRole("button", { name: /Refill water 子項/ })).not.toBeInTheDocument();

    const disclosure = screen.getByRole("button", { name: "顯示 Pack documents 子項" });
    const targetId = disclosure.getAttribute("aria-controls");
    expect(disclosure).toHaveAttribute("aria-expanded", "false");
    expect(targetId).toBeTruthy();
    expect(document.getElementById(targetId!)).toHaveAttribute("hidden");
    await user.click(disclosure);
    expect(disclosure).toHaveAttribute("aria-expanded", "true");
    expect(document.getElementById(targetId!)).not.toHaveAttribute("hidden");
    const passportTask = screen.getByLabelText("Pack passport");
    expect(passportTask).toBeEnabled();
    expect(passportTask.closest("label")).toBeVisible();
  });

  it("emits namespace-safe root and child completion values", async () => {
    const user = userEvent.setup();
    const onCompletedChange = vi.fn();
    render(
      <TaskWidget
        dayTitle="Harbor day"
        tasks={tasks}
        completedIds={new Set([taskCompletionKey("nested-task")])}
        onCompletedChange={onCompletedChange}
      />,
    );
    await user.click(screen.getByRole("button", { name: "開啟 Harbor day 當日事項" }));

    const completedRoot = screen.getByLabelText("Pack documents");
    expect(completedRoot).toBeChecked();
    await user.click(completedRoot);
    expect(onCompletedChange).toHaveBeenCalledWith(
      taskCompletionKey("nested-task"),
      false,
    );

    await user.click(screen.getByRole("button", { name: "顯示 Pack documents 子項" }));
    await user.click(screen.getByLabelText("Pack passport"));
    expect(onCompletedChange).toHaveBeenCalledWith(
      checklistCompletionKey("passport"),
      true,
    );
  });

  it("closes on cancel, backdrop, and explicit close while restoring the exact trigger", async () => {
    const user = userEvent.setup();
    render(
      <TaskWidget
        dayTitle="Harbor day"
        tasks={tasks}
        completedIds={new Set()}
        onCompletedChange={() => undefined}
      />,
    );
    const trigger = screen.getByRole("button", { name: "開啟 Harbor day 當日事項" });

    await user.click(trigger);
    let dialog = screen.getByRole("dialog", { name: "Harbor day 當日事項" });
    fireEvent(dialog, new Event("cancel", { bubbles: false, cancelable: true }));
    expect(dialog).not.toHaveAttribute("open");
    expect(trigger).toHaveFocus();

    await user.click(trigger);
    dialog = screen.getByRole("dialog", { name: "Harbor day 當日事項" });
    fireEvent.click(dialog);
    expect(dialog).not.toHaveAttribute("open");
    expect(trigger).toHaveFocus();

    await user.click(trigger);
    dialog = screen.getByRole("dialog", { name: "Harbor day 當日事項" });
    await user.click(within(dialog).getByRole("button", { name: "關閉當日事項" }));
    expect(dialog).not.toHaveAttribute("open");
    expect(trigger).toHaveFocus();
  });

  it("restores its own trigger after programmatic activation that never focused it", () => {
    render(
      <>
        <button type="button">Other control</button>
        <TaskWidget
          dayTitle="Harbor day"
          tasks={tasks}
          completedIds={new Set()}
          onCompletedChange={() => undefined}
        />
      </>,
    );
    const other = screen.getByRole("button", { name: "Other control" });
    const trigger = screen.getByRole("button", { name: "開啟 Harbor day 當日事項" });
    other.focus();
    fireEvent.click(trigger);
    const dialog = screen.getByRole("dialog", { name: "Harbor day 當日事項" });
    fireEvent.click(within(dialog).getByRole("button", { name: "關閉當日事項" }));

    expect(trigger).toHaveFocus();
  });

  it("does not fake an open modal when showModal is unavailable", () => {
    Reflect.deleteProperty(HTMLDialogElement.prototype, "showModal");
    const { container } = render(
      <TaskWidget
        dayTitle="Harbor day"
        tasks={tasks}
        completedIds={new Set()}
        onCompletedChange={() => undefined}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "開啟 Harbor day 當日事項" }));

    expect(container.querySelector("dialog")).not.toHaveAttribute("open");
    expect(
      screen.getByRole("status", { name: "無法開啟 Harbor day 當日事項" }),
    ).toBeVisible();
  });

  it("closes an open native dialog during StrictMode-safe cleanup", async () => {
    const user = userEvent.setup();
    const { unmount } = render(
      <StrictMode>
        <TaskWidget
          dayTitle="Harbor day"
          tasks={tasks}
          completedIds={new Set()}
          onCompletedChange={() => undefined}
        />
      </StrictMode>,
    );
    await user.click(screen.getByRole("button", { name: "開啟 Harbor day 當日事項" }));
    const dialog = screen.getByRole("dialog", { name: "Harbor day 當日事項" });
    expect(dialog).toHaveAttribute("open");

    unmount();
    expect(closeSpy).toHaveBeenCalled();
  });
});
