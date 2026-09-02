export const SAFE_MAP_FALLBACK_PAINT = "#000000";

function isXmlCharacter(character: string): boolean {
  const codePoint = character.codePointAt(0);
  return (
    codePoint === 0x09 ||
    codePoint === 0x0a ||
    codePoint === 0x0d ||
    (codePoint !== undefined && codePoint >= 0x20 && codePoint <= 0xd7ff) ||
    (codePoint !== undefined && codePoint >= 0xe000 && codePoint <= 0xfffd) ||
    (codePoint !== undefined && codePoint >= 0x10000 && codePoint <= 0x10ffff)
  );
}

export function resolveMapFallbackPaint(value: string): string | undefined {
  if ([...value].some((character) => !isXmlCharacter(character))) {
    return undefined;
  }
  const paint = value.trim();
  if (paint.length === 0 || /\burl\b/i.test(paint) || paint.includes("\\")) {
    return undefined;
  }
  return paint;
}
