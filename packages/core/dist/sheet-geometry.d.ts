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
export declare function clampSheetHeight(height: number, bounds: SheetHeightBounds): number;
export declare function resolveSheetGeometry(input: SheetGeometryInput): SheetGeometry;
export declare function nearestSheetSnap(height: number, geometry: Pick<SheetGeometry, "collapsed" | "half" | "expanded">): SheetSnap;
export {};
