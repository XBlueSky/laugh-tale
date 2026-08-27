import assert from 'node:assert/strict'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

const distDir = fileURLToPath(new URL('../dist/', import.meta.url))
const built = existsSync(join(distDir, 'index.html'))

test('dist/index.html exists (run `npm run build` first)', () => {
  assert.ok(built, 'site/dist/index.html missing — the suite must run after a build')
})

test('the landing page renders the marketplace from the manifest', { skip: !built }, () => {
  const html = readFileSync(join(distDir, 'index.html'), 'utf8')
  assert.match(html, /eternal-pose/)
  assert.match(html, /claude plugin install eternal-pose@laugh-tale/)
  assert.match(html, /@laugh-tale-island\/core/)
  assert.match(html, /@laugh-tale-island\/react/)
})

test('no internal superpowers docs leak into dist', { skip: !built }, () => {
  const files = readdirSync(distDir, { recursive: true, withFileTypes: true })
    .filter((e) => e.isFile() && /\.(html|txt|json|xml)$/.test(e.name))
  assert.ok(files.length > 0, 'dist contains no text files to scan')
  for (const entry of files) {
    const text = readFileSync(join(entry.parentPath, entry.name), 'utf8')
    assert.ok(!text.includes('docs/superpowers'), `${entry.name} references internal docs`)
  }
})
