// @vitest-environment jsdom
import { afterEach, expect, test, vi } from "vitest";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { readFileSync } from "node:fs";
import type { OakWashiCopy } from "../../plugins/eternal-pose/recipes-v2/oak-washi/presentation/copy/schema.js";

const catalogModule = "../../plugins/eternal-pose/recipes-v2/oak-washi/presentation/copy/catalog.js";
const copyRoot = `${process.cwd()}/plugins/eternal-pose/recipes-v2/oak-washi/presentation/copy`;
const dates = ["2040-03-01", "2039-12-31", "2040-01-01", "2040-02-29"];
const longTitle = "A complete authored title across the harbour and the coastal craft galleries ".repeat(4);

afterEach(() => { cleanup(); vi.doUnmock(catalogModule); vi.restoreAllMocks(); });

test.each([
  { locale: "en", file: "en", weekdays: ["Thu", "Sat", "Sun", "Wed"], ordinal: "Day 27", year: "2040" },
  { locale: "zh-Hant-TW", file: "zh-Hant", weekdays: ["週四", "週六", "週日", "週三"], ordinal: "第 27 天", year: "2040年" },
])("$locale date rail displays authored calendar dates in supplied order with complete names", async ({ locale, file, weekdays, ordinal, year }) => {
  vi.resetModules();
  // Replace the materialized module as a whole, with its complete reference catalog.
  // The real Intl implementation and DayRail render remain under test.
  const catalog = JSON.parse(readFileSync(`${copyRoot}/${file}.json`, "utf8")) as OakWashiCopy;
  vi.doMock(catalogModule, () => ({ catalog, locale }));
  vi.spyOn(navigator, "language", "get").mockReturnValue(locale === "en" ? "zh-Hant-TW" : "en-US");
  const { DayRail } = await import("../../plugins/eternal-pose/recipes-v2/oak-washi/presentation/experience/DayRail.js");
  const days = Array.from({ length: 13 }, (_, index) => ({ id: `authored-${12 - index}`, date: dates[index % 4], title: `${index}: ${longTitle}`, ordinal: 27 - index }));
  const selectDay = vi.fn();
  const view = render(<DayRail days={days} dayId={days[12].id} selectableIds={[days[0].id, days[12].id]} actions={{ selectDay }} />);
  const buttons = view.getAllByRole("button");
  expect(buttons).toHaveLength(13);
  for (const [index, button] of buttons.entries()) {
    const monthDay = ["3/1", "12/31", "1/1", "2/29"][index % 4];
    expect([...button.children].map(child => child.textContent)).toEqual([weekdays[index % 4], monthDay]);
    expect(button.getAttribute("aria-label")).toContain(`${weekdays[index % 4]} ${monthDay}`);
    expect(view.getByRole("button", { name: new RegExp(` · ${index}: A complete authored title`) })).toBe(button);
    expect(button.getAttribute("aria-label")).toContain(days[index].title);
    expect(button.getAttribute("aria-label")).toContain(index % 4 === 1 ? "2039" : "2040");
    expect(button.hasAttribute("disabled")).toBe(index !== 0 && index !== 12);
    expect(button.getAttribute("aria-current")).toBe(index === 12 ? "true" : null);
  }
  expect(buttons[0].getAttribute("aria-label")).toContain(ordinal);
  expect(buttons[0].getAttribute("aria-label")).toContain(year);
  fireEvent.click(buttons[0]); fireEvent.click(buttons[1]); fireEvent.click(buttons[12]);
  expect(selectDay.mock.calls).toEqual([["authored-12"], ["authored-0"]]);
});
