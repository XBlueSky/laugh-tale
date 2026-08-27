# Workflow

Use this lifecycle for every intent. Scale the work to the request, but do not skip preservation or verification.

## Inspect

- Identify whether the target is empty, an Eternal Pose-generated site, or another existing application.
- Read repository instructions, package scripts, project contracts, trip content, tests, and the user-supplied sources before proposing changes.
- Establish the exact target for Create. Reject a non-empty target rather than force-copying a starter into it.
- Explore an existing site's actual structure. Do not assume starter paths, component names, or state organization survived customization.
- Read `eternal-pose.json` when present and note its recorded `packages` versions for later comparison (see `packages.md`).
- Record the chosen intent and the requested scope. Treat Audit as zero-write from this point onward.

## Ingest

- Accept prose, Markdown, CSV, TSV, JSON, document text, URLs, and conversation decisions without requiring the user to translate them into a schema.
- Keep source statements, provider-returned data, and agent inference distinguishable.
- Treat tickets, passports, email, attachments, contact details, and reservation documents as sensitive inputs. Do not copy raw inputs into a repository by default.
- Read all supplied material before asking questions. Ask only when a contradiction or missing core fact would materially change the result.

## Reconcile

- Normalize dates, the trip's IANA timezone, cross-midnight offsets, lodging bases, candidate groups, reservations, and movement between itinerary nodes.
- Identify conflicting dates, booked times, destinations, impossible ordering, and unresolved place identity.
- Preserve non-blocking uncertainty as confirmed, suggested, candidate, or unverified instead of inventing an answer.
- Stop and ask when the core destination or travel dates cannot be identified safely.

## Draft

- In Create, produce a locally runnable independent trip site from the approved starter when it is available. Keep the generated site independent of the plugin at runtime.
- Use the default design recipe only when the user has not supplied a style direction; include only the selected recipe in the output.
- Store canonical trip facts in typed content with validation, not as a user-maintained raw schema requirement.
- Include source notes needed to explain uncertainty without copying sensitive source documents.

## Refine

- Work by requested day, semantic type, candidate group, route, or visual surface.
- In Update and Enrich, plan the smallest coherent diff and preserve unrelated facts, stable IDs, tests, and user-authored IA/UI.
- In Restyle, allow home pages, section order, renderers, typography, palette, and component organization to change while retaining the protected experience contract.
- Never repair validation by deleting custom files or replacing an existing site wholesale.

## Verify

- Recheck semantic validation, timing, candidates, tasks, reservations, progress, route ownership, map/list synchronization, sheet geometry, accessibility, provider boundaries, and safety.
- Run the repository's relevant unit, type, lint, build, and browser gates described in `testing.md`.
- Report drift between recorded, declared, and installed package versions as a finding; never rewrite versions silently.
- Report failures and limitations precisely. Do not translate a partial result into a readiness claim.

## Publish

- End locally unless the user explicitly authorizes an external action.
- Before any authorized publication, read `safety-and-deployment.md`, scan tracked and generated content, explain visibility, and confirm the exact remote or hosting target.
- Treat remote creation, public visibility, push, hosting-project creation, and deployment as separate approval gates.
- Stop after readiness preparation when approval covers preparation only.
