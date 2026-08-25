import { useCallback, useState } from "react";

export interface TripSelection {
  nodeId: string | null;
  source: "automatic" | "manual";
}

export interface TripSelectionController {
  selection: TripSelection;
  selectManual: (nodeId: string) => void;
  returnToNow: () => void;
}

export function useTripSelection(
  automaticNodeId: string | null,
  availableNodeIds: readonly string[],
): TripSelectionController {
  const [manualNodeId, setManualNodeId] = useState<string | null>(null);
  const selection: TripSelection =
    manualNodeId !== null && availableNodeIds.includes(manualNodeId)
      ? { nodeId: manualNodeId, source: "manual" }
      : { nodeId: automaticNodeId, source: "automatic" };

  const selectManual = useCallback((nodeId: string): void => {
    setManualNodeId(nodeId);
  }, []);

  const returnToNow = useCallback((): void => {
    setManualNodeId(null);
  }, []);

  return { selection, selectManual, returnToNow };
}
