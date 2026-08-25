# Safety and Deployment

Keep the default work local, private, truthful, and reversible.

## Private defaults

- Create files only in the confirmed local target. Refuse a non-empty Create target unless the user changes scope to an inspected Update.
- Do not create a remote, make a repository public, push commits, create a pull request, create a hosting project, deploy, or notify another service by default.
- Separate preparation from execution. “Prepare for deployment” authorizes readiness work, not publication.
- Avoid destructive resets, force-copy migrations, and recipe replacements. Before an authorized overwrite, list exact targets and obtain confirmation.

## Fact safety

- Do not infer booking confirmation, ticket validity, provider place ID, coordinates, opening hours, precise departures, or accessibility details.
- Mark unresolved facts as suggested, candidate, or unverified and retain source/provenance boundaries.
- Ask about contradictions involving dates, destinations, booked times, or identity when the answer changes the site.
- Retain user content when a provider fails and describe the missing capability without fabricating a fallback result.

## Publication scan

Before any public-access action, inspect tracked files, ignored-file risks, generated output, history being published, and hosting configuration for:

- API keys, tokens, cookies, credentials, private URLs, and credential-shaped literals;
- environment files beyond a safe example containing names and instructions only;
- passports, booking references, ticket or QR data, telephone numbers, contact details, and personal location information;
- raw email, attachments, source documents, screenshots, caches, source maps, and build artifacts;
- accidental exposure of a private itinerary or private repository through hosting defaults;
- copyrighted or official franchise artwork, logos, characters, fonts, screenshots, music, or other protected assets.

Treat automated scanning as evidence, not consent. If a booking reference or personal fact is intentionally visible, ask again whether it should remain before public deployment.

## Approval gates

Require explicit approval for each material external action:

1. Create or attach a remote.
2. Change repository visibility or otherwise grant public access.
3. Push local commits or tags.
4. Create or connect a hosting project.
5. Deploy or redeploy a build.

Confirm the exact account, repository, branch, project, visibility, and intended audience relevant to the approved action. Do not stretch approval for one gate to cover later gates.

## Readiness decisions

- Fail deployment readiness when the real-map provider is unconfigured, safety scan findings remain unresolved, or required tests/builds fail.
- Permit local development and production build where designed to work without a key, while reporting that this does not satisfy deployment readiness.
- Report remaining privacy, provider, accessibility, and publication risks before requesting authorization.
- Stop with a local readiness report when no publication approval exists.
