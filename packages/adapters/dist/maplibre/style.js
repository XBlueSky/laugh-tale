export function createShortbreadStyle(profile, source) {
    const palette = profile.basemap.palette;
    const labels = {
        layout: { "text-field": ["coalesce", ["get", "name"], ["get", "name_en"], ""], "text-font": ["Hiragino Sans", "Yu Gothic", "Meiryo", "Noto Sans CJK JP", "sans-serif"], "text-size": 12, "text-allow-overlap": false },
        paint: { "text-color": palette.label, "text-halo-color": palette.labelStroke, "text-halo-width": 1.2 },
    };
    return { version: 8, sources: { shortbread: { type: "vector", ...source } }, layers: [
            { id: "land", type: "background", paint: { "background-color": palette.geometry } },
            { id: "ocean", type: "fill", source: "shortbread", "source-layer": "ocean", paint: { "fill-color": palette.water } },
            { id: "water", type: "fill", source: "shortbread", "source-layer": "water_polygons", paint: { "fill-color": palette.water } },
            { id: "parks", type: "fill", source: "shortbread", "source-layer": "land", filter: ["in", ["get", "kind"], ["literal", ["park", "wood", "forest", "grass", "recreation_ground"]]], paint: { "fill-color": palette.park } },
            { id: "buildings", type: "fill", source: "shortbread", "source-layer": "buildings", minzoom: 14, paint: { "fill-color": palette.label, "fill-opacity": 0.07 } },
            { id: "rivers", type: "line", source: "shortbread", "source-layer": "water_lines", paint: { "line-color": palette.water, "line-width": ["interpolate", ["linear"], ["zoom"], 10, 1, 16, 5] } },
            { id: "roads", type: "line", source: "shortbread", "source-layer": "streets", filter: ["!=", ["get", "rail"], true], layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": palette.road, "line-width": ["interpolate", ["linear"], ["zoom"], 8, 0.5, 12, 2, 16, 7] } },
            { id: "rail", type: "line", source: "shortbread", "source-layer": "streets", filter: ["==", ["get", "rail"], true], paint: { "line-color": palette.label, "line-opacity": 0.22, "line-width": 1, "line-dasharray": [3, 2] } },
            { id: "localities", type: "symbol", source: "shortbread", "source-layer": "place_labels", ...labels, layout: { ...labels.layout, "text-size": ["interpolate", ["linear"], ["zoom"], 5, 11, 12, 15], "text-padding": 24 } },
            { id: "street-names", type: "symbol", source: "shortbread", "source-layer": "street_labels", minzoom: 14, ...labels, layout: { ...labels.layout, "symbol-placement": "line", "text-size": 10, "symbol-spacing": 350 } },
            ...(profile.basemap.stationLabels === "hidden" ? [] : [{ id: "stations", type: "symbol", source: "shortbread", "source-layer": "public_transport", minzoom: 13, ...labels, filter: ["in", ["get", "kind"], ["literal", ["station", "halt", "bus_station"]]], layout: { ...labels.layout, "text-padding": 14 } }]),
        ] };
}
