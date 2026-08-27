# Security Policy

## Supported versions

Only the latest release of the Eternal Pose plugin and of the
`@laugh-tale-island/core` / `@laugh-tale-island/react` packages receives
security fixes.

## Reporting a vulnerability

**Please do not report security vulnerabilities through public GitHub
issues.**

Instead, use GitHub's private vulnerability reporting:
[Report a vulnerability](https://github.com/XBlueSky/laugh-tale/security/advisories/new).

Include as much of the following as you can:

- The affected component (plugin skill, starter, `core`, or `react` package)
  and version
- Steps to reproduce, or a proof of concept
- The impact you believe the issue has

This is a volunteer-maintained project; we aim to acknowledge reports within
seven days and will keep you informed as a fix progresses. Please give us a
reasonable opportunity to address the issue before any public disclosure.

## Scope notes

- Generated travel sites are independent projects owned by their creators;
  issues in a site you generated and then modified are in scope only if they
  originate in the starter or packages as shipped.
- API keys (for example Google Maps) are configured by site owners and are
  never bundled by this project. Never commit keys or secrets to this
  repository, including inside test fixtures.
