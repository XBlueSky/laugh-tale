import assert from 'node:assert/strict'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

const distDir = fileURLToPath(new URL('../dist/', import.meta.url))
const demoFile = join(distDir, 'themes', 'index.html')
const built = existsSync(demoFile)

test('dist/themes/index.html exists (run `npm run build` first)', () => {
  assert.ok(built, 'theme demo page missing — the suite must run after a build')
})

test('theme demo exposes four authored worlds and two preview states', { skip: !built }, () => {
  const html = readFileSync(demoFile, 'utf8')
  for (const id of ['field-atlas', 'reset-arcade', 'live-journey', 'pocket-instrument']) {
    assert.match(html, new RegExp(`data-theme-target="${id}"`), `${id} tab missing`)
    assert.match(html, new RegExp(`data-theme-screen="${id}"`), `${id} preview missing`)
  }
  assert.match(html, /data-view-target="home"/)
  assert.match(html, /data-view-target="experience"/)
  assert.match(html, /Keep the facts/)
  assert.match(html, /Change everything else/)
})

test('theme demo uses local, accessible interaction controls', { skip: !built }, () => {
  const html = readFileSync(demoFile, 'utf8')
  const css = readdirSync(join(distDir, '_astro'))
    .filter((file) => file.endsWith('.css'))
    .map((file) => readFileSync(join(distDir, '_astro', file), 'utf8'))
    .join('\n')
  assert.match(html, /role="tablist"/)
  assert.match(html, /aria-selected="true"/)
  assert.match(html, /aria-live="polite"/)
  assert.match(css, /prefers-reduced-motion:\s*reduce/)
  assert.match(css, /forced-colors:\s*active/)
  assert.doesNotMatch(html, /https?:\/\/(?!github\.com|laugh-tale-island\.pages\.dev)/i)
})
