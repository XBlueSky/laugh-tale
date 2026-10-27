import { TextEncoder, TextDecoder } from "node:util";
const zigzag = value => (value << 1) ^ (value >> 31);
const varint = value => {
  const bytes = [];
  let rest = value >>> 0;
  while (rest > 127) { bytes.push((rest & 127) | 128); rest >>>= 7; }
  return [...bytes, rest];
};
const integer = (field, value) => [...varint(field << 3), ...varint(value)];
const bytes = (field, data) => [...varint((field << 3) | 2), ...varint(data.length), ...data];
const text = (field, value) => bytes(field, new TextEncoder().encode(value));
function geometry(points, closed = false) {
  let x = 0, y = 0;
  const result = [];
  points.forEach(([nextX, nextY], index) => {
    if (index === 0) result.push(9);
    if (index === 1) result.push(((points.length - 1) << 3) | 2);
    result.push(zigzag(nextX - x), zigzag(nextY - y));
    x = nextX; y = nextY;
  });
  if (closed) result.push(15);
  return result.flatMap(varint);
}
const square = [[100, 100], [1700, 100], [1700, 1700], [100, 1700]];
const line = [[0, 2600], [4096, 2600]];
const definitions = [
  ["ocean", 3, [[2000, 3000], [4096, 3000], [4096, 4096], [2000, 4096]], {}],
  ["water_polygons", 3, [[2800, 100], [4000, 100], [4000, 1800], [2800, 1800]], {}],
  ["water_lines", 2, [[0, 3000], [4096, 3500]], {}],
  ["land", 3, square, { kind: "park" }],
  ["buildings", 3, [[2000, 2000], [2400, 2000], [2400, 2400], [2000, 2400]], {}],
  ["streets", 2, line, { kind: "residential", rail: "no" }],
  ["place_labels", 1, [[1100, 1300]], { name: "Test Harbor", name_en: "Test Harbor" }],
  ["street_labels", 2, line, { name: "試験通り", name_en: "Test Street" }],
  ["public_transport", 1, [[2048, 2048]], { kind: "station", name: "試験駅", name_en: "Test Station" }],
];
export function encodeSyntheticTile() {
  return new Uint8Array(definitions.flatMap(([name, type, points, attributes]) => {
    const entries = Object.entries(attributes);
    const tags = entries.flatMap((_, index) => [index, index]).flatMap(varint);
    const feature = [...integer(1, 1), ...bytes(2, tags), ...integer(3, type), ...bytes(4, geometry(points, type === 3))];
    return bytes(3, [...text(1, name), ...bytes(2, feature), ...entries.flatMap(([key]) => text(3, key)),
      ...entries.flatMap(([, value]) => bytes(4, text(1, value))), ...integer(5, 4096), ...integer(15, 2)]);
  }));
}
export function syntheticMetadata(origin) {
  return { tilejson: "3.0.0", scheme: "xyz", minzoom: 0, maxzoom: 14,
    tiles: [`${origin}/tiles/{z}/{x}/{y}.mvt`],
    vector_layers: definitions.map(([id, , , attributes]) => ({ id, fields: Object.fromEntries(Object.keys(attributes).map(key => [key, "String"])) })),
  };
}
// Independent minimal protobuf reader checks framing, fields and layer feature counts.
export function inspectSyntheticTile(input) {
  function fields(data) {
    let offset = 0;
    const read = () => {
      let result = 0, shift = 0, byte;
      do { if (offset >= data.length) throw new Error("Truncated varint"); byte = data[offset++]; result |= (byte & 127) << shift; shift += 7; } while (byte & 128);
      return result;
    };
    const result = [];
    while (offset < data.length) {
      const tag = read();
      if ((tag & 7) === 0) result.push([tag >>> 3, read()]);
      else if ((tag & 7) === 2) { const length = read(); const end = offset + length; if (end > data.length) throw new Error("Truncated field"); result.push([tag >>> 3, data.slice(offset, end)]); offset = end; }
      else throw new Error("Unsupported wire type");
    }
    return result;
  }
  return fields(input).filter(([id]) => id === 3).map(([, data]) => {
    const layer = fields(data);
    return { name: new TextDecoder().decode(layer.find(([id]) => id === 1)[1]), features: layer.filter(([id]) => id === 2).length };
  });
}
