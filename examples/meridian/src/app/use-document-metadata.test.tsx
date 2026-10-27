import { cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { syntheticTripV2 } from "@laugh-tale-island/testing";
import { useDocumentMetadata } from "./use-document-metadata";

const copy = { productName: "Travel journal", setupTitle: "Prepare your trip", setupDescription: "Add your travel plans." };
const trip = { ...syntheticTripV2, title: "Harbor holiday", locale: "fr-CA", destinationLabel: "A coastal journey" };
afterEach(() => { cleanup(); document.head.replaceChildren(); document.documentElement.removeAttribute("lang"); });
const meta = (selector: string) => document.head.querySelector<HTMLMetaElement>(selector)?.content;

describe("authored document metadata", () => {
  it("uses exact authored identity and removes social art", () => {
    const art = document.createElement("meta"); art.setAttribute("property", "og:image"); art.content = "https://example.test/art.png"; document.head.append(art);
    renderHook(() => useDocumentMetadata({ trip, setupLocale: "en", copy }));
    expect(document.documentElement.lang).toBe("fr-CA");
    expect(document.title).toBe("Harbor holiday");
    expect(meta('meta[name="description"]')).toBe("A coastal journey");
    expect(meta('meta[property="og:title"]')).toBe("Harbor holiday");
    expect(meta('meta[property="og:description"]')).toBe("A coastal journey");
    expect(meta('meta[name="application-name"]')).toBe("Travel journal");
    expect(document.querySelector('meta[property="og:image"]')).toBeNull();
  });
  it("updates owned nodes in place across trip, locale, copy and null changes without touching third parties", () => {
    const owned = document.createElement("meta"); owned.name = "description"; owned.content = "Old description";
    const thirdParty = document.createElement("meta"); thirdParty.name = "third-party-token"; thirdParty.content = "keep me";
    document.head.append(owned, thirdParty);
    const initialProps: Parameters<typeof useDocumentMetadata>[0] = { trip, setupLocale: "de-AT", copy };
    const { rerender } = renderHook(useDocumentMetadata, { initialProps });
    expect(document.querySelector('meta[name="description"]')).toBe(owned);
    const changed = { ...trip, title: "Mountain weekend", locale: "it-IT", destinationLabel: "Across the valley" };
    rerender({ trip: changed, setupLocale: "de-AT", copy: { ...copy, productName: "Journey book" } });
    expect(document.title).toBe("Mountain weekend"); expect(document.documentElement.lang).toBe("it-IT"); expect(owned.content).toBe("Across the valley");
    expect(meta('meta[name="application-name"]')).toBe("Journey book");
    rerender({ trip: null, setupLocale: "de-AT", copy });
    expect(document.documentElement.lang).toBe("de-AT"); expect(document.title).toBe("Prepare your trip"); expect(owned.content).toBe("Add your travel plans.");
    expect(meta('meta[property="og:title"]')).toBe("Prepare your trip"); expect(meta('meta[property="og:description"]')).toBe("Add your travel plans.");
    expect(thirdParty.isConnected).toBe(true); expect(thirdParty.content).toBe("keep me");
    expect(document.querySelectorAll('meta[name="description"]')).toHaveLength(1);
  });
  it("uses the exact title when destination is absent", () => {
    const { destinationLabel: _destination, ...withoutDestination } = trip;
    expect(_destination).toBe("A coastal journey");
    renderHook(() => useDocumentMetadata({ trip: withoutDestination, setupLocale: "en", copy }));
    expect(meta('meta[name="description"]')).toBe("Harbor holiday");
    expect(meta('meta[property="og:description"]')).toBe("Harbor holiday");
  });
});
