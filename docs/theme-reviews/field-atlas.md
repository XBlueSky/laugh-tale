# Field Atlas authored-world review

## Completed controller browser record

**Controller browser matrix: complete.** The controller inspected Home; default and expanded Experience; candidate, reservation, and task interactions; provider-key, provider-load, loading, map-error, and fatal states; and all three itinerary sheet snaps. Normal mobile coverage used `320x568`, `390x844`, and `430x932`. Desktop coverage used `768`, `1024`, and `1440` CSS-pixel widths, with representative captures at `1440x1000`.

The pass used the ignored controller-only deterministic visual map harness. It renders the actual Field Atlas marker and route profile with bounded provider chrome. The harness is not shipped or committed, and it adds no runtime selector, npm dependency, remote asset, or font.

## Authored-world assessment

- **Composition:** Home uses one route overview, readiness facts, a compact reservation ledger, and an indexed day field. Experience uses a persistent map grid between a vertical desktop field index and one bounded detail surface. Normal mobile retains the persistent-map, three-snap silhouette; the 200% text mode switches to complete document flow.
- **Map grammar:** indexed markers, a square/double selected marker, completed-marker cuts, route casing, and dashed uncertain routes remain distinguishable without relying on the cobalt accent.
- **Typography and density:** system UI text is paired with a system monospaced numeric/index layer at `VISUAL_DENSITY 8`. Dense information remains organized by sharp rules, sequence numbers, and bounded regions.
- **Component language:** sharp ruled regions and cropped grid geometry replace rounded cards, pill clusters, elevation, gradients, blur, and glass.
- **Icon and status language:** operational text keys, route bands, check shapes, and boundary patterns identify current, selected, completed, uncertain, and failed states.
- **Motion:** `MOTION_INTENSITY 3`; only interruptible state transitions use the 180ms token, and the reduced-motion path is instant.
- **Content framing:** recipe-owned visible and accessible strings are consistently English and operational. Authored trip titles, day titles, notes, places, reservation data, candidate names, and tasks render unchanged from the authored model.

## Responsive and provider evidence

The controller pass first exposed defects that headless review missed:

- At `1440x1000`, the trip title had `0px` content width and a `673px` text height; the date rail was horizontal because later base component rules overrode the desktop layout.
- At normal `320`, `390`, and `430` widths, expanded-header scroll heights were `233px`, `195px`, and `172px` against the fixed header. The stacked sheet toolbar occupied `101px`.
- Recipe-owned copy fragmented between English and Traditional Chinese despite the English document and fixture.

Commit `6060810` corrected those findings. The post-fix controller measurements were:

- At `1440x1000`, the title is `220x46`, the primary rail region is `236x148`, date buttons form a vertical `236x56` stack, and the date rail is a `236px`-wide grid.
- The map occupies `x=240..1056`; the detail sheet occupies `x=1056..1428`. The provider control remains `44x44`, and provider control and attribution stay contained.
- Mobile header client/scroll heights are `140/140` at 320, `141/141` at 390, and `125/125` at 430. Date rails are approximately `61px`, remain inside the header, and the sheet toolbar is approximately `56px`.
- Horizontal overflow is zero at every inspected normal width and across all three sheet snaps.
- At 200% root text on `320x568`, Field Atlas uses the grid document-flow mode. There is no horizontal overflow, the Home `h1` fits its client width, and every critical control remains at least `44px`.

Dialog, candidate, and task focus rings were visibly confirmed in the in-app browser. Provider attribution and default controls remained visible and operable throughout the inspected matrix.

The in-app-browser backend did not expose global sequential-keyboard, forced-colors, or reduced-motion emulation. Those are not claimed as controller observations. Native Playwright covered keyboard focus and restoration plus forced-colors and reduced-motion behavior in the composed external-network-blocked suite, which passed `27/27`.

### Multi-day rail and authored-locale regression

The round-4 deterministic Chromium regression now exercises 2, 3, and 4 authored days at `320x568`, `390x844`, and `430x932`, plus the `1440x1000` desktop rail. On normal mobile, the bounded date rail is internally horizontal-scrollable and keeps nonshrinking, readable `44px`-minimum targets; it does not require every authored day to be visible simultaneously. The `<=15rem` high-text/zoom document-flow mode and the desktop one-column vertical rail remain separate layout modes.

- At 320, date buttons remain `144px` wide. The four-day rail measures `300px` client width by `576px` scroll width, while the header remains `140/140` client/scroll height and document horizontal overflow remains zero.
- At 390 and 430, date buttons remain `160px` wide. Four-day rails measure `370/640` and `410/640` client/scroll width; their headers remain `141/141` and `125/125`, with zero document horizontal overflow.
- At 1440, the rail remains a vertical `236px`-wide grid with four contained rows (`236x56` to `236x63.375`) and zero document horizontal overflow.
- The browser test scrolls the last authored day into the rail viewport for the three- and four-day cases, proving that later choices remain reachable without moving the document horizontally.

The focused presentation fixture also renders Traditional Chinese authored content for the trip, day, node, task, candidate, and reservation fields and asserts each exact value. Recipe-owned labels remain English through specific accessible-control assertions and a static scan of recipe source literals; authored content is neither rejected nor translated.

These are automated browser and contract results. The captured controller matrix above predates the four-day fixture; the controller owns the subsequent four-day in-app-browser visual confirmation.

The controller's classic-scrollbar pre-fix recheck of commit `896b326` found a platform-specific containment defect that overlay-scrollbar Chromium did not reproduce. At 320, the `144x61` buttons fit above the `156px` header bottom, but the native scrollbar expanded the `300/576` client/scroll-width rail to `76px` high and a `165px` bottom; the header measured `155/144` scroll/client height. At 390, the `160x61` buttons also fit, but the `370/640` rail reached a `165.5px` bottom and the header measured `156/144`. Label readability and document horizontal overflow remained correct, and 430 plus desktop were contained.

The normal-mobile cross-engine rule now keeps `overflow-x:auto` and scroll snapping while the native scrollbar is visually suppressed. The rail remains keyboard, touch, and wheel scrollable; focus-driven scrolling still moves `scrollLeft` and brings the last `44px`-minimum day target fully into view. The partially visible next day remains the visual affordance. Desktop retains its vertical rail, and the `<=15rem` document-flow override remains unchanged. The controller owns the follow-up classic-scrollbar matrix; the existing captures are unchanged.

## Grayscale evidence — completed

[Grayscale capture](assets/field-atlas-grayscale.png) applies `grayscale(1)` at the root. The atlas grid composition and monospaced index layer remain legible. The square/double selected marker, route casing, and two dashed route paths remain identifiable without hue, and horizontal overflow remains zero.

## Accent substitution evidence — completed

[Accent-substitution capture](assets/field-atlas-accent-substitution.png) replaces the cobalt accent with `#9a3a76`, `#6f2454`, and `#efdcea` in both CSS and the review map profile. The selected marker, active rail choice, and selected itinerary row change color while the composition, marker shapes, route casing, dashed-route grammar, and provider bounds remain intact. Horizontal overflow remains zero.

Both captures are verified `1440x1000` PNG files produced from the controller-owned pass.

## Provenance

No NPS, Felt, Mapbox, reference screenshot, logo, proprietary asset, proprietary font, or trademarked trade dress was copied. Named references informed only general product and cartographic principles.
