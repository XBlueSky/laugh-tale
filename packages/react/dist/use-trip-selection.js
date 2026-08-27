import { useCallback, useState } from "react";
export function useTripSelection(automaticNodeId, availableNodeIds) {
    const [manualNodeId, setManualNodeId] = useState(null);
    const selection = manualNodeId !== null && availableNodeIds.includes(manualNodeId)
        ? { nodeId: manualNodeId, source: "manual" }
        : { nodeId: automaticNodeId, source: "automatic" };
    const selectManual = useCallback((nodeId) => {
        setManualNodeId(nodeId);
    }, []);
    const returnToNow = useCallback(() => {
        setManualNodeId(null);
    }, []);
    return { selection, selectManual, returnToNow };
}
