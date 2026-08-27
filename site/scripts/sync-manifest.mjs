#!/usr/bin/env node
import { execFileSync } from 'node:child_process'
import { copyFileSync, existsSync, mkdirSync, realpathSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * Copy the generated manifest, failing loudly when generation produced
 * nothing — a stale or empty marketplace section must never deploy silently.
 * @param {string} src
 * @param {string} dest
 * @returns {string} dest
 */
export function copyManifest(src, dest) {
  if (!existsSync(src)) {
    throw new Error(`manifest not found at ${src} — did cc-marketspec generation fail?`)
  }
  mkdirSync(dirname(dest), { recursive: true })
  copyFileSync(src, dest)
  return dest
}

function main() {
  const siteDir = resolve(dirname(fileURLToPath(import.meta.url)), '..')
  const repoRoot = resolve(siteDir, '..')
  // Major-pinned npx rather than the root devDependency: the Cloudflare Pages
  // builder installs only site/ (root directory = site), so root node_modules
  // does not exist there.
  execFileSync('npx', ['@xbluesky/cc-marketspec@1'], { cwd: repoRoot, stdio: 'inherit' })
  const dest = copyManifest(
    join(repoRoot, '.cc-marketspec', 'dist', 'manifest.json'),
    join(siteDir, 'src', 'data', 'manifest.json'),
  )
  console.log(`sync-manifest: manifest generated and copied to ${dest}`)
}

// Real-path comparison so a symlinked checkout still detects direct invocation
// (import.meta.main needs Node >= 22.16; engines only guarantees 22.12).
function isMainModule() {
  if (!process.argv[1]) return false
  try {
    return realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))
  } catch {
    return false
  }
}

if (isMainModule()) main()
