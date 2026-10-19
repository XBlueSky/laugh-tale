export function mountAttribution(host, entries, onHeight) {
    const element = document.createElement("div");
    element.setAttribute("role", "note");
    element.setAttribute("aria-label", "Map attribution");
    Object.assign(element.style, { position: "absolute", zIndex: "10", right: "8px", bottom: "max(8px, env(safe-area-inset-bottom))", maxWidth: "calc(100% - 16px)", boxSizing: "border-box", padding: "3px 7px", fontSize: "0.6875rem", lineHeight: "1.45", fontFamily: "system-ui, sans-serif", background: "Canvas", color: "CanvasText", overflowWrap: "anywhere", pointerEvents: "auto" });
    for (const [index, entry] of entries.entries()) {
        if (index > 0)
            element.append(document.createTextNode(" · "));
        const link = document.createElement("a");
        link.textContent = entry.text;
        link.href = entry.url;
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        link.style.color = "inherit";
        element.append(link);
    }
    host.append(element);
    let destroyed = false;
    const measure = () => { if (!destroyed)
        onHeight(element.getBoundingClientRect().height); };
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    measure();
    return {
        setLayout(layout) {
            if (destroyed)
                return;
            if (layout === null) {
                element.style.right = "8px";
                element.style.bottom = "max(8px, env(safe-area-inset-bottom))";
                element.style.maxWidth = "calc(100% - 16px)";
            }
            else {
                const region = layout.usableRegion;
                element.style.right = `${layout.viewport.width - region.x - region.width + 8}px`;
                element.style.bottom = `${layout.viewport.height - region.y - region.height + 8}px`;
                element.style.maxWidth = `${Math.max(0, region.width - 16)}px`;
            }
            measure();
        },
        destroy() { if (destroyed)
            return; destroyed = true; observer.disconnect(); element.remove(); },
    };
}
