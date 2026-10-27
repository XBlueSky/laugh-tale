import type { Trip } from "@laugh-tale-island/core";
import { useEffect } from "react";
import type { documentMetadataCopy } from "../presentation";

type DocumentMetadataCopy = { [Key in keyof typeof documentMetadataCopy]: string };

export interface DocumentMetadataInput {
  trip: Trip | null;
  setupLocale: string;
  copy: DocumentMetadataCopy;
}

export function useDocumentMetadata({ trip, setupLocale, copy }: DocumentMetadataInput): void {
  useEffect(() => {
    document.documentElement.lang = trip?.locale ?? setupLocale;
    const title = trip?.title ?? copy.setupTitle;
    const description = trip === null ? copy.setupDescription : trip.destinationLabel ?? trip.title;
    document.title = title;
    const values = [
      ["name", "description", description],
      ["property", "og:title", title],
      ["property", "og:description", description],
      ["name", "application-name", copy.productName],
    ] as const;
    for (const [attribute, key, content] of values) {
      const existing = document.head.querySelectorAll<HTMLMetaElement>(`meta[${attribute}="${key}"]`);
      const node = existing[0] ?? document.createElement("meta");
      node.setAttribute(attribute, key);
      node.content = content;
      if (!node.isConnected) document.head.append(node);
      for (const duplicate of [...existing].slice(1)) duplicate.remove();
    }
    document.head.querySelectorAll('meta[property="og:image"], meta[name="og:image"]').forEach((node) => node.remove());
  }, [trip, setupLocale, copy]);
}
