import type { NavigationInput } from "@laugh-tale-island/core";
import type { NavigationAdapter } from "@laugh-tale-island/core/browser";

export function createGoogleMapsUrl(input: NavigationInput): string {
  return (
    "https://www.google.com/maps/dir/?api=1" +
    `&origin=${encodeURIComponent(input.origin)}` +
    `&destination=${encodeURIComponent(input.destination)}` +
    `&travelmode=${input.travelMode}`
  );
}

export class GoogleNavigationAdapter implements NavigationAdapter {
  directions(input: NavigationInput): string {
    return createGoogleMapsUrl(input);
  }
}
