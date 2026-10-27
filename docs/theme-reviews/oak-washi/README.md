# Oak & Washi synthetic visual baselines

The 60 PNGs in `goldens/` depict synthetic fixtures, not an authored personal
itinerary. `fixture-review.json` records their original technical review notes,
image hashes, browser/font versions and the SHA-256 fingerprint of the equivalent
public rendering inputs. No private development commit is part of this provenance.

The fingerprint hashes sorted `[relativePath, sha256(fileBytes)]` pairs from the
six directories listed in `sourceSnapshot`. The harness boundary test recalculates
it and checks every image hash. Any rendering-source change requires a fresh
comparison and review; do not silently accept updated snapshots.

Run `npm run test:oak-washi:browser` after building the workspace packages.
Normal runs are read-only. Candidate capture (`OAK_CAPTURE_CANDIDATES=1`) is local
review material, explicitly rejected as CI proof.

These baselines do not establish live-provider parity, physical-device VoiceOver,
field Core Web Vitals, owner aesthetic approval or an Awwwards award.
