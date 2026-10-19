import en from "./en.json" with { type: "json" };
import zhHant from "./zh-Hant.json" with { type: "json" };

import type { OakWashiCopy } from "./schema.js";

const enCatalog = en satisfies OakWashiCopy;
const zhHantCatalog = zhHant satisfies OakWashiCopy;

export function resolveOakWashiCopy(locale: string): OakWashiCopy {
  let canonical: string;
  try {
    canonical = Intl.getCanonicalLocales(locale)[0] ?? locale;
  } catch {
    throw new Error(`Unsupported Oak & Washi locale: ${locale}`);
  }

  if (canonical === "en" || canonical.startsWith("en-")) return enCatalog;
  if (
    canonical === "zh-Hant" ||
    canonical.startsWith("zh-Hant-")
  ) {
    return zhHantCatalog;
  }

  throw new Error(`Unsupported Oak & Washi locale: ${locale}`);
}
