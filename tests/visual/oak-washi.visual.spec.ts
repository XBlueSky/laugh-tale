import { test, expect, variants, openCase, commonGeometry, experience, settle, fontEvidence, assertCaptureOwner, frameCaptureOwner } from "../fixtures/oak-washi/browser/checks.js";
import { writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";

for (const { visualCase, variant, name } of variants) test(name, async ({ page }) => {
  await openCase(page, visualCase, variant);
  await commonGeometry(page, variant);
  await assertCaptureOwner(page, visualCase, variant);
  await expect(page.locator("h1")).toHaveCount(1);
  if (variant.mode === "home") {
    await expect(page.locator(".oak-home")).toBeVisible();
    expect(await page.evaluate(() => window.oak!.probe.home!.model.progress.trip.completed)).toBe(0);
    await expect(page.getByText("Synthetic Meridian Journey", { exact: true })).toHaveCount(1);
  }
  if (variant.mode === "experience") {
    const model = await experience(page);
    expect(model.day.id).toBe("day-synthetic");
    expect(model.motion).toBe("reduced");
    const nodes = model.timeline.flatMap(entry => entry.kind === "node" ? [entry] : entry.kind === "logistics-group" ? entry.children : []);
    const primary = nodes.filter(node => node.role === "primary");
    expect(primary.map(node => node.displayIndex)).toEqual(primary.map((_, index) => index + 1));
    const rows = page.locator(".oak-row[data-owner-id]");
    const ids = await rows.evaluateAll(elements => elements.map(element => element.getAttribute("data-owner-id")));
    expect(new Set(ids).size).toBe(ids.length);
    for (const row of await page.locator(".oak-primary-row").all()) {
      const scan = await row.locator(".oak-row-selection [data-scan]").evaluateAll(elements => elements.map(element => element.getAttribute("data-scan")));
      expect(scan).toEqual(["time", "title", "context", "location", "status"]);
    }
    if (visualCase.id === "experience-default") expect(model.map.cameraIntent?.kind).toBe("fit");
    if (visualCase.id === "experience-collapsed-current") {
      expect(model.owners.currentId).toBe("node-sightseeing");
      expect(model.owners.nextId).toBe("node-experience");
      await expect(page.locator(".oak-collapsed-summary")).toContainText("Synthetic overlook");
    }
    if (visualCase.id === "selection-truth") {
      expect(model.owners.selectedId).toBe(variant.id === "selected-unresolved" ? "node-unresolved" : "node-sightseeing");
      expect(model.map.presentation.markers.map(marker => marker.ownerId)).not.toContain("node-unresolved");
      expect(model.capabilities.navigationOwnerIds).not.toContain("node-unresolved");
      expect(nodes.find(node => node.ownerId === "node-unresolved")?.displayIndex).toBeGreaterThan(0);
      expect(model.progress.skippedNodeIds).toContain("node-shopping");
      expect(model.progress.shopping).toContainEqual({ itemId: "shopping-journal", status: "purchased" });
      expect(model.progress.completedIds).toContain("node:node-experience");
      await expect(page.locator(`[data-owner-id="${model.owners.selectedId}"] .oak-row-selection`)).toHaveAttribute("aria-pressed", "true");
    }
    if (visualCase.id === "route-state-matrix" || visualCase.id === "camera-adversarial") {
      const route = model.routes.find(route => route.routeId === "route-walking")!;
      if (["walking", "transit", "driving"].includes(variant.id) && visualCase.id === "route-state-matrix") expect(route.runtime.status).toBe("ready");
      if (["flight", "unknown"].includes(variant.id)) { expect(route.runtime.status).toBe("idle"); expect(model.map.presentation.routes.some(item => item.edgeId === "route-walking")).toBe(false); }
      if (variant.id === "loading") expect(route.runtime.status).toBe("loading");
      if (variant.id === "authored-fallback") {
        expect(route.authored.durationMinutes).toBe(12);
        expect(route.source).toBe("manual");
        await expect(page.locator('[data-owner-id="route-walking"]')).toContainText("12");
      }
      if (variant.id === "external") expect(route.navigationAvailable).toBe(true);
      if (["unavailable", "retry", "external", "implausible-duration", "remote-point"].includes(variant.id)) expect(route.runtime.status).toBe("unavailable");
      if (visualCase.id === "camera-adversarial") {
        expect(model.map.presentation.routes.find(route => route.edgeId === "route-walking")).toBeUndefined();
        const serialized = JSON.stringify(model.map.cameraIntent);
        expect(serialized).not.toContain('"lat":50');
        expect(serialized).not.toContain('"lng":60');
        // A quarantined/flight route has no valid route-focus intent. The
        // explicit full-day action must still fit only the valid trip geometry.
        expect(model.map.cameraIntent).toBeNull();
        await page.evaluate(() => window.oak!.probe.actions!.restoreFullDay()); await settle(page);
        const camera = (await experience(page)).map.cameraIntent;
        expect(camera?.kind).toBe("fit");
        const points = camera!.kind === "fit" ? [...camera!.points, ...camera!.paths.flat()] : [camera!.coordinate];
        expect(points.length).toBeGreaterThan(0);
        for (const point of points) {
          expect(point.lat).toBeGreaterThanOrEqual(10); expect(point.lat).toBeLessThanOrEqual(10.06);
          expect(point.lng).toBeGreaterThanOrEqual(20); expect(point.lng).toBeLessThanOrEqual(20.06);
        }
      }
      if (variant.id === "retry") {
        await page.evaluate(() => window.oak!.probe.actions!.retryProvider("route", "route-walking")); await settle(page);
        expect((await experience(page)).routes.find(route => route.routeId === "route-walking")!.runtime.status).toBe("ready");
      }
    }
    if (visualCase.id === "opening-hours-matrix") {
      if (variant.id === "overnight" || variant.id === "cross-midnight") {
        expect(model.clock.instant).toBe(variant.id === "overnight" ? "2042-03-04T23:00:00.000Z" : "2042-03-05T01:00:00.000Z");
        expect(model.clock.timezone).toBe("UTC");
      }
      const place = model.places.find(place => place.ownerId === "node-transfer")!;
      const expected = { "known-open": { status: "open" }, "known-closed": { status: "closed" }, absent: { status: "unknown", reason: "absent" }, incomplete: { status: "unknown", reason: "incomplete" }, overnight: { status: "open" }, "cross-midnight": { status: "open" }, "trip-timezone": { status: "closed" } };
      expect(place.runtime.status === "ready" ? place.runtime.opening : undefined).toEqual(expected[variant.id as keyof typeof expected]);
    }
    if (visualCase.id === "candidate-open" || visualCase.id === "candidate-zoom-200") {
      const candidate = model.candidates.find(candidate => candidate.groupId === "candidate-meal")!;
      if (["open", "draft", "comparison"].includes(variant.id)) await expect(page.getByRole("dialog")).toBeVisible();
      else await expect(page.getByRole("dialog")).toHaveCount(0);
      if (variant.id === "draft") expect(candidate.draftOptionId).toBe("candidate-meal-b");
      if (variant.id === "confirmed") expect(candidate.committedOptionId).toBe("candidate-meal-b");
      if (variant.id === "cancelled") expect(candidate.committedOptionId).toBe("candidate-meal-a");
      if (candidate.open) {
        const dialog = page.getByRole("dialog", { name: "比較候選項目" });
        await expect(dialog).toHaveAttribute("open", "");
        await expect(dialog).not.toHaveAttribute("aria-modal", "true");
        const ids = model.map.presentation.markers.map(marker => marker.ownerId);
        expect(ids).not.toContain(candidate.parentOwnerId);
        for (const option of candidate.options) expect(ids).toContain(option.id);
        if (visualCase.id === "candidate-zoom-200") {
          expect(await dialog.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
          for (const name of ["取消", "確認"]) {
            const action = dialog.getByRole("button", { name, exact: true });
            await action.scrollIntoViewIfNeeded();
            await expect(action).toBeInViewport();
          }
        }
      }
    }
    if (visualCase.id === "loading-owned") {
      await page.evaluate(() => window.oak!.probe.actions!.setSheetSnap("expanded")); await settle(page);
      if (variant.id === "route") {
        expect(model.routes.filter(route => route.runtime.status === "loading").map(route => route.routeId)).toEqual(["route-walking"]);
        await expect(page.locator('[data-owner-id="route-walking"]')).toContainText("路線 · 載入中");
      } else {
        expect(model.places.filter(place => place.runtime.status === "loading").map(place => place.ownerId)).toEqual(["node-transfer"]);
        await expect(page.locator('[data-owner-id="node-transfer"]')).toContainText("載入中");
      }
    }
    if (visualCase.id === "map-error") {
      expect(model.map.provider.status).toBe("unavailable"); await expect(page.locator(".oak-itinerary-sheet")).toBeVisible();
      await page.locator("[data-fake-map]").evaluate(element => {
        const repaint = document.createElement("div"); repaint.dataset.fakeRepaint = "true";
        Object.assign(repaint.style, { position: "absolute", inset: "0", zIndex: "2147483647", background: "var(--oak-map-surface)" });
        element.append(repaint);
      });
      const row = page.locator('[data-owner-id="node-sightseeing"] .oak-row-selection');
      await row.scrollIntoViewIfNeeded();
      expect(await row.evaluate(element => { const box = element.getBoundingClientRect(); return element.contains(document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2)); })).toBe(true);
      await row.click(); await settle(page);
      expect((await experience(page)).owners.selectedId).toBe("node-sightseeing");
    }
    if (visualCase.id === "setup-states") {
      expect(model.map.provider).toMatchObject({ status: "unavailable", reason: variant.id === "missing-key" ? "missing-configuration" : "loader-failed" });
      await expect(page.locator(".oak-itinerary-sheet")).toBeVisible();
    }
    if (visualCase.id === "runtime-degraded") {
      if (variant.id === "memory-only") expect(model.persistence).toEqual({ status: "memory-only", writable: false });
      if (variant.id.startsWith("location-")) expect(model.location.status).toBe(variant.id === "location-denied" ? "denied" : "unavailable");
    }
  }
  const fonts = await fontEvidence(page);
  // Retry/full-day restoration may reveal the runtime's current owner again.
  // Recompose only the scoped captures, then prove their actual pixels fit.
  await frameCaptureOwner(page, visualCase, variant);
  const ownerEvidence = await assertCaptureOwner(page, visualCase, variant, variant.id === "retry");
  if (process.env.OAK_CAPTURE_CANDIDATES === "1") {
    const png = await page.screenshot({ path: `tmp/playwright/oak-washi/candidates/${name}.png`, animations: "disabled", scale: "css" });
    writeFileSync(`tmp/playwright/oak-washi/candidates/${name}.json`, JSON.stringify({ verdict: "unreviewed", caseId: visualCase.id, variant: variant.id, viewport: variant.viewport, sourceCommit: execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(), dirtySource: execFileSync("git", ["status", "--porcelain", "--untracked-files=normal"], { encoding: "utf8" }).trim().length > 0, playwright: "1.62.1", chromium: "151.0.7922.34", revision: "1234", fonts, ownerEvidence, sha256: createHash("sha256").update(png).digest("hex") }, null, 2));
  }
  // Reviewed goldens are macOS Chromium renders; Linux font rasterization differs
  // by a few percent. Every structural assertion above still runs everywhere.
  else if (process.platform === "darwin") await expect(page).toHaveScreenshot(`${name}.png`);
});
