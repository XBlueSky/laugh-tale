import { BedDouble, Bus, Camera, CheckSquare, CircleHelp, MapPin, Plane, ShoppingBag, TrainFront, Utensils } from "lucide-react";
import type { TimelineNodeModel } from "@laugh-tale-island/react";

const glyphs = { transport: Bus, transfer: CircleHelp, lodging: BedDouble, dining: Utensils, shopping: ShoppingBag, sightseeing: MapPin, experience: Camera, logistics: CheckSquare, custom: CircleHelp };
export function TypeGlyph({ kind }: { kind: TimelineNodeModel["facts"]["kind"] }) { const Glyph = glyphs[kind]; return <Glyph size={10} strokeWidth={1.75} aria-hidden="true" />; }
export function SemanticMark({ node }: { node: TimelineNodeModel }) {
  if (node.role === "primary") return <span className="oak-semantic-mark" aria-hidden="true"><span className="oak-row-ordinal">{node.ordinal}</span><span className="oak-row-type-glyph"><TypeGlyph kind={node.facts.kind} /></span></span>;
  const Glyph = node.role === "base" ? BedDouble : node.role === "task" ? CheckSquare : node.facts.kind === "transfer" ? { unknown: CircleHelp, rail: TrainFront, flight: Plane, bus: Bus }[node.facts.mode] : CircleHelp;
  return <span className="oak-semantic-mark" aria-hidden="true"><Glyph size={18} strokeWidth={1.75} /></span>;
}
