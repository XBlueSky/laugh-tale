# Huninn web font provenance

- Family: Huninn / jf open 粉圓, Regular 400, by the Huninn Project Authors (justfont).
- Source: `google/fonts/ofl/huninn` at Git revision `c23a2b3d9a20bec8620c635bd0ff729610841a46`.
- Original font: `Huninn-Regular.ttf`, SHA-256 `1bd770a5ffc0c06723b567686f8b5db5abf9ab54227f3bbc4e6fd648f4698805`, 4,683,972 bytes.
- License: `OFL.txt`, SHA-256 `d71824aeb09afc4c2cac01acab5c3db79796e927ba37be40d69fb62a412639b6`; copied as `OFL-Huninn.txt`.
- Derived full-font WOFF2: `huninn-regular.woff2`, SHA-256 `e2a95d2a13e0ce0c10198356eb1e0aa323494adfd0847afdd50e4695a5c747ee`, 2,123,816 bytes. Converted with fontTools 4.60.2 without subsetting.
- The TTF and WOFF2 best Unicode cmap both contain 11,364 code points. Rare characters not present in Huninn remain subject to the CSS system-font fallback.

## Selective local delivery

The full `huninn-regular.woff2` remains the pinned source archive, with its
original bytes and OFL notice intact. Runtime CSS loads 95 local Unicode
subsets totaling 2,528,856 bytes: 86 lower-frequency public partitions, two
coalesced public frequency bands, six remainder partitions containing 708
original-font codepoints, and one 45,012-byte shaping partition with 831
codepoints. The two bands are public indices 090–097 (338,304 bytes) and 098–110
(347,800 bytes). The shaping partition stays separate
so Latin-only text does not request a CJK band. Of the 779 source codepoints
absent from the public blueprint, 71
join the shaping partition or another original layout component; the remaining
708 live in the remainder partitions.
The union is exactly the original 11,364-codepoint best Unicode cmap. There is
no new font source, replacement font version, or runtime font-service request.

`HUNINN-PARTITIONS.json` contains generic frequency-based Unicode ranges from
the public Google Fonts CSS response for `family=Huninn&display=swap` using a
Chrome 131 user agent. It is partition data only. No v9 font URL was used to
generate font binaries. The original CSS SHA-256 is
`bf729b97ece9544c5272d9db431ff55f4d0182f4b3d45108846dff21166db629`;
the normalized range-data SHA-256 is
`a137ec1a4764d508cb416121d2a4d4095b641dfdc77a583989e05a4976ef8d33`.
Partition selection does not inspect trip content, copy catalogs, or locale data.
All original Latin, ASCII and combining characters share a shaping partition.
Its content-independent closure contains 597 Latin, 183 Common, 28 Inherited,
nine Cyrillic and 14 Hebrew codepoints, with no Han ideographs. The generator
inspects every original GSUB single/alternate substitution, ligature and chained
context rule, plus every nonzero GPOS pair/class adjustment and anchored
mark-to-base/mark-to-mark dependency. Unsupported source lookup types reject the
build. The encoded dependency graph has 10,454 components, 77 nontrivial; the
shaping component has 831 codepoints and every other component has at most three.
This preserves cross-range kerning, ligatures, composition and mark placement,
including Taiwanese romanization such as O plus U+0358 and an accent.

Other components are assigned atomically to the highest-frequency public
declaration that contains any member (last declaration first). This preserves
shaping without joining unrelated CJK frequency partitions. Remaining components
are sorted by their first codepoint into chunks of at most 128. CSS ranges are
disjoint and exactly match each emitted cmap. The last 21 public indices then
coalesce into two frequency bands to reduce competing network request lanes;
the remaining public/remainder partitions remain selective. This coalescing uses
only the public frequency blueprint, after the original shaping graph has been
assigned; it does not read authored text. The generic sample ABC123 plus 台灣旅行
selects the shaping face and the 098–110 band, totaling 392,812 bytes. These are payload
facts, not a claim that a cold-page timing budget has passed. FontTools' shaping
and bidi glyph closure is retained, with closure-only codepoints removed from
the exposed cmap.

From the repository root, regenerate with
`python3 scripts/build-oak-huninn-subsets.py` and verify without writing with
`python3 scripts/build-oak-huninn-subsets.py --check`. Both require
fontTools 4.60.2 and Brotli 1.2.0, pinned in `scripts/requirements-oak-huninn.txt`.
For an isolated contributor environment, create a virtual environment with
`python3 -m venv .venv-oak-huninn`, activate it, then run
`python3 -m pip install -r scripts/requirements-oak-huninn.txt`. The root unit
suite requires these tools; validation is never silently skipped. CI's root
`check` job must install these requirements before `npm run check`; independent
Tokyo and release jobs do not execute this font proof.
The generator decodes the pinned archive once into
an in-memory SFNT, then creates WOFF2 subsets with hinting, glyph names, original
name/license records, source timestamps, and all layout features retained.
OpenType layout serialization explicitly uses FontTools' own serializer so an
optional HarfBuzz repacker cannot change binary outputs. No system font or
network resource enters the build. Characters absent from the original Huninn
cmap continue to use the existing CSS fallback stack.

`HUNINN-SUBSETS.json` records every output file's SHA-256, size, codepoint count,
and exact Unicode range, plus the pinned source, license and blueprint hashes.
The validator reopens the actual subset binaries, proves full original cmap
coverage without overlap, verifies every platform-specific Unicode subtable,
and compares every retained glyph's outline,
hint bytecode, horizontal and vertical advance/bearing metrics, global line
metrics, and original naming records against the pinned archive. CSS and asset
metadata tests ensure browsers can select local covering subsets. The optional
browser check `node tests/scripts/oak-washi-font-delivery.browser.mjs` against
an existing fixture server inspects actual painted Chinese and Latin fonts and
confirms ordinary Home requests subsets rather than the full archive.
