import { TripController, type TripControllerProps } from "@laugh-tale-island/react";
import { presentation as defaultPresentation, documentMetadataCopy } from "../presentation";
import { useDocumentMetadata } from "./use-document-metadata";

export interface AppProps extends Omit<TripControllerProps, "presentation"> {
  setupLocale: string;
  presentation?: TripControllerProps["presentation"];
}

export function App({ setupLocale, presentation = defaultPresentation, ...controller }: AppProps) {
  useDocumentMetadata({ trip: controller.trip, setupLocale, copy: documentMetadataCopy });
  return <TripController {...controller} presentation={presentation} />;
}
