# Oak & Washi

Oak & Washi is the canonical Eternal Pose presentation: a quiet, precise, map-first travel workspace built from warm neutral surfaces, near-black ink, muted teal route information, terracotta emphasis, thin rules, and compact product typography. The palette is semantic rather than decorative. It does not use literal wood or paper texture, gradients, glass effects, remote fonts, stop-kind color cards, nested cards, or page-load spectacle. The Home cover includes one locally bundled abstract cartographic illustration; it is not an itinerary map or a claim that places have been resolved.

## Authored copy

All visible presentation copy comes from one authored Trip locale. `presentation/copy/en.json` and `presentation/copy/zh-Hant.json` are complete generator references validated by the closed `catalog-schema.json`. `resolve-copy.ts` accepts only English or explicit Traditional Chinese tags and throws for unsupported locales; it never reads browser language. The committed `catalog.ts` is the self-contained `zh-Hant-TW` materialization used by the no-content starter and the synthetic `examples/meridian` flagship. Example trip details are fictional test input, not personal travel records or verified provider data.

Catalog materialization uses recursively sorted keys, two-space JSON indentation, LF line endings, and one trailing newline. Phase 05 may atomically replace only `catalog.ts` when selecting another authored locale. Runtime presentation code imports only the named `locale` and `catalog` exports from that file.

## Visual foundation

`presentation/styles/index.css` is the single CSS entry. It imports local Unicode font faces, tokens, layer ownership, layout, components, states, the editorial layer, motion, and accessibility once in that order. Traditional Chinese uses the bundled jf open 粉圓 (Huninn Regular 400) as its primary UI and display face, with system fonts for unavailable glyphs or a failed load. Other locales retain their system-first stacks and the selective serif display role. The complete pinned WOFF2 archive, its OFL notice, and source hashes remain in `presentation/assets/`. Runtime CSS selects from 95 local Unicode subsets (2,528,856 bytes total, at most 347,800 bytes each) generated solely from that archive; it never references the full archive or a font service. The subsets preserve the full 11,364-codepoint coverage and original glyph geometry, hints, and advance metrics. The highest-frequency public partitions coalesce into two generic delivery bands. All original Latin and combining characters share a separate 45,012-byte shaping face; source GSUB/GPOS dependencies keep kerning, composition, ligatures and anchored marks within one font. `HUNINN-SOURCE.md` documents the reproducible build and binary validator. The Home illustration is a bundled source asset, not a remotely loaded image. The named layer scale keeps map content, routes, markers, provider attribution, app controls, header, sheet, and modal surfaces in a stable order.

Header expansion and sheet snapping use 220ms; header collapse uses 160ms. All use `cubic-bezier(0.22, 1, 0.36, 1)`, remain interruptible, and become immediate under reduced motion. Controls preserve 44px targets, visible focus, forced-colors semantics, and asymmetric safe areas. Reference dimensions may grow for 200-percent text.

## Provider guide

`provider-guides/google-map-style.json` is a Cloud style guide, not presentation truth. It keeps required Google attribution visible, simplifies points of interest, and retains legible stations. The presentation-owned map surface and the future provider-neutral visual profile remain separate.

## Deterministic evidence

The manifest declares the 17 approved Oak fixture identifiers and the supported width inventory: 320, 390, 430, 768, 1024, and 1440 CSS pixels. Later tasks own the map profile, concrete views, marker factories, and executable visual fixtures; this foundation does not stub their exports.
