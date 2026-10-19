import { createHash } from "node:crypto";

function reject(reason) { throw new Error(`outside JSON domain: ${reason}`); }

function validUnicode(value) {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (!(next >= 0xdc00 && next <= 0xdfff)) reject("lone surrogate");
      index += 1;
    } else if (code >= 0xdc00 && code <= 0xdfff) reject("lone surrogate");
  }
  return value;
}

function serialize(value, ancestors) {
  if (value === null || typeof value === "boolean") return JSON.stringify(value);
  if (typeof value === "string") return JSON.stringify(validUnicode(value));
  if (typeof value === "number") {
    if (!Number.isFinite(value)) reject("non-finite number");
    return JSON.stringify(value);
  }
  if (typeof value !== "object") reject(`unsupported ${typeof value}`);
  if (ancestors.has(value)) reject("cycle");
  const prototype = Object.getPrototypeOf(value);
  if (!Array.isArray(value) && prototype !== Object.prototype && prototype !== null) reject("non-plain object");
  if (Array.isArray(value) && prototype !== Array.prototype) reject("non-plain array");
  if (Object.getOwnPropertySymbols(value).length) reject("symbol key");
  ancestors.add(value);
  try {
    if (Array.isArray(value)) {
      const keys = Object.getOwnPropertyNames(value);
      if (keys.some((key) => key !== "length" && (!/^(0|[1-9]\d*)$/.test(key) || Number(key) >= value.length))) reject("array property");
      const items = [];
      for (let index = 0; index < value.length; index += 1) {
        const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
        if (!descriptor) reject("sparse array");
        if (!Object.hasOwn(descriptor, "value")) reject("accessor");
        items.push(serialize(descriptor.value, ancestors));
      }
      return `[${items.join(",")}]`;
    }
    const keys = Object.getOwnPropertyNames(value).sort();
    const pairs = keys.map((key) => {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor.enumerable || !Object.hasOwn(descriptor, "value")) reject("non-data property");
      return `${JSON.stringify(validUnicode(key))}:${serialize(descriptor.value, ancestors)}`;
    });
    return `{${pairs.join(",")}}`;
  } finally { ancestors.delete(value); }
}

export function canonicalizeJson(value) { return serialize(value, new Set()); }
export function sha256CanonicalJson(value) { return createHash("sha256").update(canonicalizeJson(value), "utf8").digest("hex"); }
