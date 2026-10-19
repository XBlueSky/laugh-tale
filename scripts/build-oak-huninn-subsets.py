#!/usr/bin/env python3
"""Build/check local Huninn Unicode subsets from the pinned full archive.

Requires fontTools==4.60.2 and brotli. No network or trip-content inputs.
Generated CSS, coverage manifest and WOFF2 files are mechanical build outputs.
"""
import argparse
import hashlib
from io import BytesIO
import json
import re
import unicodedata
from pathlib import Path

import fontTools
import brotli
from fontTools import subset
from fontTools.pens.recordingPen import RecordingPen
from fontTools.ttLib import TTFont
from fontTools.ttLib.tables.otBase import USE_HARFBUZZ_REPACKER
from fontTools.unicodedata import script as unicode_script

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_ASSETS = ROOT / "plugins/eternal-pose/recipes-v2/oak-washi/presentation/assets"
SOURCE_SHA = "e2a95d2a13e0ce0c10198356eb1e0aa323494adfd0847afdd50e4695a5c747ee"
PARTITIONS_SHA = "a137ec1a4764d508cb416121d2a4d4095b641dfdc77a583989e05a4976ef8d33"
FONTTOOLS_VERSION = "4.60.2"
BROTLI_VERSION = "1.2.0"
LICENSE_SHA = "d71824aeb09afc4c2cac01acab5c3db79796e927ba37be40d69fb62a412639b6"
HIGH_FREQUENCY_BANDS = ((90, 97), (98, 110))


def require(condition, message):
    if not condition:
        raise ValueError(message)


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def points(ranges):
    result = set()
    for item in ranges.split(","):
        match = re.fullmatch(r"U\+([0-9A-Fa-f]+)(?:-([0-9A-Fa-f]+))?", item.strip())
        require(match is not None, f"invalid Unicode range: {item}")
        start = int(match[1], 16)
        end = int(match[2] or match[1], 16)
        require(start <= end <= 0x10FFFF, f"invalid Unicode endpoints: {item}")
        result.update(range(start, end + 1))
    return result


def ranges(codepoints):
    groups = []
    for value in sorted(codepoints):
        if groups and value == groups[-1][1] + 1:
            groups[-1][1] = value
        else:
            groups.append([value, value])
    return ", ".join(f"U+{a:X}" if a == b else f"U+{a:X}-{b:X}" for a, b in groups)


def shaping_components(font):
    """Conservative glyph dependency closure from every original layout lookup.

    Single/alternate substitutions connect encoded inputs to their positioning
    and composition outputs. Multi-input rules, nonzero pairs and anchored marks
    connect glyphs that must share an actual font for the original shaping.
    """
    parent = {name: name for name in font.getGlyphOrder()}

    def find(name):
        if parent[name] != name:
            parent[name] = find(parent[name])
        return parent[name]

    def connect(names):
        names = sorted(set(names))
        if not names:
            return
        root = find(names[0])
        for name in names[1:]:
            other = find(name)
            if root != other:
                parent[max(root, other)] = min(root, other)
                root = min(root, other)

    for lookup in font["GSUB"].table.LookupList.Lookup:
        for table in lookup.SubTable:
            if lookup.LookupType == 1:
                for first, second in table.mapping.items():
                    connect([first, second])
            elif lookup.LookupType == 3:
                for first, alternates in table.alternates.items():
                    connect([first, *alternates])
            elif lookup.LookupType == 4:
                for first, ligatures in table.ligatures.items():
                    for ligature in ligatures:
                        connect([first, *ligature.Component, ligature.LigGlyph])
            elif lookup.LookupType == 6 and table.Format == 3:
                connect([glyph for field in (table.BacktrackCoverage, table.InputCoverage, table.LookAheadCoverage) for coverage in field for glyph in coverage.glyphs])
            elif lookup.LookupType == 6 and table.Format == 1:
                for first, rules in zip(table.Coverage.glyphs, table.ChainSubRuleSet):
                    if rules:
                        for rule in rules.ChainSubRule:
                            connect([first, *rule.Backtrack, *rule.Input, *rule.LookAhead])
            else:
                raise ValueError(f"unsupported source GSUB dependency type {lookup.LookupType}/{getattr(table, 'Format', None)}")

    def nonzero(record):
        return any(value is not None and any(item is not None and item != 0 for item in value.__dict__.values()) for value in (getattr(record, "Value1", None), getattr(record, "Value2", None)))

    for lookup in font["GPOS"].table.LookupList.Lookup:
        for table in lookup.SubTable:
            if lookup.LookupType == 2 and table.Format == 1:
                for first, pairs in zip(table.Coverage.glyphs, table.PairSet):
                    for pair in pairs.PairValueRecord:
                        if nonzero(pair):
                            connect([first, pair.SecondGlyph])
            elif lookup.LookupType == 2 and table.Format == 2:
                first_classes = {index: [] for index in range(table.Class1Count)}
                second_classes = {index: [] for index in range(table.Class2Count)}
                for name in table.Coverage.glyphs:
                    first_classes[table.ClassDef1.classDefs.get(name, 0)].append(name)
                for name in parent:
                    second_classes[table.ClassDef2.classDefs.get(name, 0)].append(name)
                for first_index, first in enumerate(table.Class1Record):
                    for second_index, pair in enumerate(first.Class2Record):
                        if nonzero(pair) and first_classes[first_index] and second_classes[second_index]:
                            connect(first_classes[first_index] + second_classes[second_index])
            elif lookup.LookupType in (4, 6):
                if lookup.LookupType == 4:
                    marks, mark_records = table.MarkCoverage.glyphs, table.MarkArray.MarkRecord
                    bases, base_records = table.BaseCoverage.glyphs, table.BaseArray.BaseRecord
                    anchor_field = "BaseAnchor"
                else:
                    marks, mark_records = table.Mark1Coverage.glyphs, table.Mark1Array.MarkRecord
                    bases, base_records = table.Mark2Coverage.glyphs, table.Mark2Array.Mark2Record
                    anchor_field = "Mark2Anchor"
                for mark_class in range(table.ClassCount):
                    relevant_marks = [name for name, record in zip(marks, mark_records) if record.Class == mark_class and record.MarkAnchor is not None]
                    relevant_bases = [name for name, record in zip(bases, base_records) if getattr(record, anchor_field)[mark_class] is not None]
                    if relevant_marks and relevant_bases:
                        connect(relevant_marks + relevant_bases)
            else:
                raise ValueError(f"unsupported source GPOS dependency type {lookup.LookupType}/{getattr(table, 'Format', None)}")

    cmap = font.getBestCmap()
    # All original Latin, ASCII and combining codepoints share one generic face,
    # including romanization, extended Latin, script marks and layout closure.
    connect([name for point, name in cmap.items() if point <= 0x7F or unicode_script(chr(point)) == "Latn" or unicodedata.category(chr(point)).startswith("M")])
    groups = {}
    for point, name in cmap.items():
        groups.setdefault(find(name), set()).add(point)
    latin_root = find(cmap[0x41])
    return groups[latin_root], list(groups.values())


def plan(font, blueprint):
    cmap = font.getBestCmap()
    shaping, components = shaping_components(font)
    # CSS resolves overlaps from last declaration first. Preserve that priority,
    # then emit disjoint ranges so every codepoint selects exactly one file.
    remaining = set(cmap) - shaping
    component_by_point = {point: index for index, component in enumerate(components) for point in component}
    entries = []
    for index in reversed(range(len(blueprint["ranges"]))):
        matched = points(blueprint["ranges"][index]) & remaining
        selected = set().union(*(components[component] for component in {component_by_point[point] for point in matched})) if matched else set()
        if selected:
            entries.append((f"huninn-regular-subset-{index:03d}.woff2", selected))
            remaining -= selected
    # Preserve old-font characters absent from the newer public blueprint.
    chunks = []
    chunk = set()
    for component in sorted((component for component in components if component & remaining), key=min):
        if chunk and len(chunk) + len(component) > 128:
            chunks.append(chunk)
            chunk = set()
        chunk |= component
    if chunk:
        chunks.append(chunk)
    entries.extend((f"huninn-regular-remainder-{index:03d}.woff2", selected) for index, selected in enumerate(chunks))
    entries.append(("huninn-regular-shaping.woff2", shaping))
    # Coalesce only public frequency bands, after atomic shaping assignment.
    # This reduces competing font request lanes without reading authored text.
    bands = {band: set() for band in HIGH_FREQUENCY_BANDS}
    selective = []
    for file, selected in entries:
        match = re.fullmatch(r"huninn-regular-subset-(\d+)\.woff2", file)
        band = next((band for band in HIGH_FREQUENCY_BANDS if match and band[0] <= int(match[1]) <= band[1]), None)
        if band:
            bands[band] |= selected
        else:
            selective.append((file, selected))
    selective.extend((f"huninn-regular-tier-{start:03d}-{end:03d}.woff2", selected) for (start, end), selected in bands.items() if selected)
    return sorted(selective)


def css_text(entries):
    faces = ["/* Generated by scripts/build-oak-huninn-subsets.py; local pinned Huninn only. */"]
    for file, codepoints in entries:
        faces.append("\n".join([
            "@font-face {",
            '  font-family: "Oak Huninn";',
            f'  src: url("../assets/{file}") format("woff2");',
            "  font-style: normal;",
            "  font-weight: 400;",
            "  font-display: swap;",
            f"  unicode-range: {ranges(codepoints)};",
            "}",
        ]))
    return "\n\n".join(faces) + "\n"


def glyph_signature(font, name):
    glyph = font["glyf"][name]
    pen = RecordingPen()
    glyph.draw(pen, font["glyf"])
    hints = bytes(glyph.program.getBytecode()) if hasattr(glyph, "program") else b""
    return pen.value, hints, font["hmtx"][name], font["vmtx"][name]


def global_metrics(font):
    fields = {
        "head": ["unitsPerEm", "created", "modified"],
        "hhea": ["ascent", "descent", "lineGap"],
        "vhea": ["ascent", "descent", "lineGap"],
        "OS/2": ["sTypoAscender", "sTypoDescender", "sTypoLineGap", "usWinAscent", "usWinDescent", "sxHeight", "sCapHeight", "xAvgCharWidth"],
    }
    return {table: {field: getattr(font[table], field, None) for field in names} for table, names in fields.items()}


def manifest(assets, source, blueprint, entries):
    return {
        "schemaVersion": 1,
        "generator": "scripts/build-oak-huninn-subsets.py",
        "fontToolsVersion": FONTTOOLS_VERSION,
        "brotliVersion": BROTLI_VERSION,
        "source": {"file": "huninn-regular.woff2", "sha256": SOURCE_SHA, "bytes": 2123816, "codepoints": len(source.getBestCmap())},
        "license": {"file": "OFL-Huninn.txt", "sha256": LICENSE_SHA},
        "partitions": {"file": "HUNINN-PARTITIONS.json", "sha256": PARTITIONS_SHA, "sourceCssSha256": blueprint["sourceCssSha256"], "overlapPolicy": "last declaration first; original cmap intersection; shaping components assigned atomically; remainder chunks at most 128", "shapingPolicy": "all source Latin/ASCII/combining codepoints and original GSUB/GPOS dependency closure share local font files", "highFrequencyBands": [{"start": start, "end": end} for start, end in HIGH_FREQUENCY_BANDS]},
        "runtimeBytes": sum((assets / file).stat().st_size for file, _ in entries),
        "subsets": [{"file": file, "sha256": digest(assets / file), "bytes": (assets / file).stat().st_size, "codepoints": len(selected), "unicodeRange": ranges(selected)} for file, selected in entries],
    }


def validate(assets, source, blueprint, entries):
    record = json.loads((assets / "HUNINN-SUBSETS.json").read_text())
    require(record == manifest(assets, source, blueprint, entries), "subset manifest/hash mismatch")
    require((assets.parent / "styles/fonts.css").read_text() == css_text(entries), "font-face CSS coverage/local URL mismatch")
    union = set()
    glyphs_verified = 0
    original_cmap = source.getBestCmap()
    original_subtables = {(table.platformID, table.platEncID, table.format, table.language): table.cmap for table in source["cmap"].tables if table.isUnicode()}
    signatures = {name: glyph_signature(source, name) for name in source.getGlyphOrder()}
    for file, selected in entries:
        font = TTFont(assets / file)
        cmap = font.getBestCmap()
        require(set(cmap) == selected, f"{file}: cmap differs from assigned Unicode range")
        for table in font["cmap"].tables:
            if table.isUnicode():
                key = (table.platformID, table.platEncID, table.format, table.language)
                expected = {point: name for point, name in original_subtables.get(key, {}).items() if point in selected}
                require(table.cmap == expected, f"{file}: changed Unicode subtable {key}")
        require(not union & selected, f"{file}: overlapping cmap")
        require(global_metrics(font) == global_metrics(source), f"{file}: changed global metrics")
        for codepoint, name in cmap.items():
            require(name == original_cmap[codepoint], f"{file}: changed Unicode glyph mapping")
        for name in font.getGlyphOrder():
            require(name in signatures and glyph_signature(font, name) == signatures[name], f"{file}: changed outline/hints/advance metrics for {name}")
            glyphs_verified += 1
        # Keep source license, author, family and version naming unchanged.
        source_names = {(n.nameID, n.platformID, n.platEncID, n.langID): n.string for n in source["name"].names}
        subset_names = {(n.nameID, n.platformID, n.platEncID, n.langID): n.string for n in font["name"].names}
        require(source_names == subset_names, f"{file}: changed naming/license records")
        union |= selected
        font.close()
    require(union == set(original_cmap), "missing/extra original Unicode coverage")
    return {"codepoints": len(union), "glyphsVerified": glyphs_verified, "subsets": len(entries), "runtimeBytes": record["runtimeBytes"]}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true", help="validate checked-in assets without changing files")
    parser.add_argument("--assets", type=Path, default=DEFAULT_ASSETS, help="asset root; useful for validating a copied build")
    args = parser.parse_args()
    assets = args.assets.resolve()
    require(fontTools.__version__ == FONTTOOLS_VERSION, f"requires fontTools {FONTTOOLS_VERSION}")
    require(brotli.__version__ == BROTLI_VERSION, f"requires Brotli {BROTLI_VERSION}")
    require(digest(assets / "huninn-regular.woff2") == SOURCE_SHA, "pinned full font hash mismatch")
    require(digest(assets / "OFL-Huninn.txt") == LICENSE_SHA, "original OFL hash mismatch")
    require(digest(assets / "HUNINN-PARTITIONS.json") == PARTITIONS_SHA, "pinned Unicode blueprint hash mismatch")
    source = TTFont(assets / "huninn-regular.woff2", recalcTimestamp=False)
    source.cfg[USE_HARFBUZZ_REPACKER] = False
    blueprint = json.loads((assets / "HUNINN-PARTITIONS.json").read_text())
    entries = plan(source, blueprint)
    if not args.check:
        previous_manifest = assets / "HUNINN-SUBSETS.json"
        previous_files = {entry["file"] for entry in json.loads(previous_manifest.read_text())["subsets"]} if previous_manifest.exists() else set()
        # WOFF2 reconstructs the entire glyf table on first access. Decode the
        # pinned archive once into memory, then reopen that identical SFNT for
        # each subset instead of repeating the costly full reconstruction.
        decoded = BytesIO()
        source.flavor = None
        source.save(decoded)
        source.flavor = "woff2"
        source_bytes = decoded.getvalue()
        for file, selected in entries:
            font = TTFont(BytesIO(source_bytes), recalcTimestamp=False)
            font.cfg[USE_HARFBUZZ_REPACKER] = False
            options = subset.Options()
            options.glyph_names = True
            options.hinting = True
            options.notdef_outline = True
            options.layout_features = ["*"]
            options.name_IDs = ["*"]
            options.name_languages = ["*"]
            options.name_legacy = True
            engine = subset.Subsetter(options=options)
            engine.populate(unicodes=selected)
            engine.subset(font)
            # Layout/bidi closure can retain extra encoded glyphs (e.g. the
            # mirror of U+220B). Keep the glyph for shaping, but expose only the
            # assigned Unicode partition in every Unicode cmap subtable.
            for table in font["cmap"].tables:
                if table.isUnicode():
                    table.cmap = {point: name for point, name in table.cmap.items() if point in selected}
            font.flavor = "woff2"
            font.save(assets / file)
            font.close()
        (assets.parent / "styles/fonts.css").write_text(css_text(entries))
        (assets / "HUNINN-SUBSETS.json").write_text(json.dumps(manifest(assets, source, blueprint, entries), indent=2) + "\n")
        current_files = {file for file, _ in entries}
        for file in sorted(previous_files - current_files):
            require(re.fullmatch(r"huninn-regular-(?:subset-\d+|remainder-\d+|tier-\d+-\d+|shaping)\.woff2", file) is not None, f"refusing to remove unexpected previous font: {file}")
            (assets / file).unlink(missing_ok=True)
    print(json.dumps(validate(assets, source, blueprint, entries), sort_keys=True))


if __name__ == "__main__":
    try:
        main()
    except (ValueError, OSError) as error:
        raise SystemExit(str(error))
