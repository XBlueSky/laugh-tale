# Vendored package tarballs

These two tarballs were packed from this repository's `packages/core` and `packages/react` at the tip of `main` on 2026-09-02 (commit `733d745`), whose `packages/` tree is identical to the tip of the baseline branch.

They exist because the published `@laugh-tale-island/*@1.0.0` artifacts do not contain the package changes that the starter on `main` depends on (see the baseline parity report, row "published-only install"). The version string inside them is still `1.0.0`; they are **not** the published 1.0.0.

When 2.0 is published, replace the `file:vendor/...` specifiers in `package.json` with registry versions and delete this directory.
