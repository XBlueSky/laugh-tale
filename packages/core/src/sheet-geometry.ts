export type SheetSnap = "collapsed" | "half" | "expanded";

export interface SheetGeometryInput {
  collapsedHeight: number;
  halfHeight: number;
  expandedHeight: number;
}

export interface SheetGeometry {
  collapsed: number;
  half: number;
  expanded: number;
  ceiling: number;
}

interface SheetHeightBounds {
  min: number;
  max: number;
}

function finiteLength(value: number): number {
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}

export function clampSheetHeight(
  height: number,
  bounds: SheetHeightBounds,
): number {
  const minimum = Math.min(bounds.min, bounds.max);
  const maximum = Math.max(bounds.min, bounds.max);
  const resolved = Number.isFinite(height) ? height : minimum;
  return Math.min(maximum, Math.max(minimum, resolved));
}

export function resolveSheetGeometry(input: SheetGeometryInput): SheetGeometry {
  const collapsed = Math.round(finiteLength(input.collapsedHeight));
  const expanded = Math.max(
    collapsed,
    Math.round(finiteLength(input.expandedHeight)),
  );
  const half = Math.round(
    clampSheetHeight(finiteLength(input.halfHeight), {
      min: collapsed,
      max: expanded,
    }),
  );

  return { collapsed, half, expanded, ceiling: expanded };
}

export function nearestSheetSnap(
  height: number,
  geometry: Pick<SheetGeometry, "collapsed" | "half" | "expanded">,
): SheetSnap {
  return (["collapsed", "half", "expanded"] as const).reduce((best, snap) =>
    Math.abs(geometry[snap] - height) < Math.abs(geometry[best] - height)
      ? snap
      : best,
  );
}
