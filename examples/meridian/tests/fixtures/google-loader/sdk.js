// Only the external SDK module is replaced. The packaged default loader stays real.
globalThis.googleLoaderSmoke = { evaluations: 1, options: [], libraries: [] };

export function setOptions(options) {
  globalThis.googleLoaderSmoke.options.push(options);
}

export async function importLibrary(name) {
  globalThis.googleLoaderSmoke.libraries.push(name);
  class SdkConstructor {}
  if (name === "maps") return { Map: SdkConstructor, OverlayView: SdkConstructor, Polyline: SdkConstructor };
  if (name === "marker") return {
    AdvancedMarkerElement: SdkConstructor,
    CollisionBehavior: {
      REQUIRED: "REQUIRED",
      REQUIRED_AND_HIDES_OPTIONAL: "REQUIRED_AND_HIDES_OPTIONAL",
      OPTIONAL_AND_HIDES_LOWER_PRIORITY: "OPTIONAL_AND_HIDES_LOWER_PRIORITY",
    },
  };
  if (name === "core") return { Point: SdkConstructor, SymbolPath: { CIRCLE: "CIRCLE" } };
  throw new Error(`Unexpected SDK library: ${name}`);
}
