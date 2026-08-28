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

test('the landing page tells the tribute through five relics and a crew epilogue', { skip: !built }, () => {
  const html = readFileSync(join(distDir, 'index.html'), 'utf8')

  for (const relic of ['captain', 'first-mate', 'navigator', 'doctor', 'reader']) {
    assert.match(html, new RegExp(`data-relic="${relic}"`), `missing ${relic} relic`)
  }

  assert.match(html, /<figure[^>]+class="crew-epilogue"/)
  assert.match(
    html,
    /alt="An original ink silhouette of a legendary pirate crew facing the final island"/,
  )
})

test('tribute artwork keeps intrinsic dimensions and defers the below-fold crew scene', { skip: !built }, () => {
  const html = readFileSync(join(distDir, 'index.html'), 'utf8')
  const crewImage = html.match(
    /<img[^>]+alt="An original ink silhouette of a legendary pirate crew facing the final island"[^>]*>/,
  )?.[0]

  assert.ok(crewImage, 'crew epilogue image missing')
  assert.match(crewImage, /width="\d+"/)
  assert.match(crewImage, /height="\d+"/)
  assert.match(crewImage, /loading="lazy"/)
  assert.match(crewImage, /decoding="async"/)
})

test('the motion enhancement checks the operating-system motion preference', { skip: !built }, () => {
  const scriptFiles = readdirSync(distDir, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.js'))
  const javascript = scriptFiles
    .map((entry) => readFileSync(join(entry.parentPath, entry.name), 'utf8'))
    .join('\n')

  assert.ok(scriptFiles.length > 0, 'landing page emitted no motion runtime')
  assert.match(javascript, /prefers-reduced-motion:\s*reduce/)
})

test('console grid items can shrink to a mobile viewport', { skip: !built }, () => {
  const stylesheets = readdirSync(distDir, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.css'))
    .map((entry) => readFileSync(join(entry.parentPath, entry.name), 'utf8'))
    .join('\n')
  const consoleRule = stylesheets.match(/\.console\{([^}]*)\}/)?.[1]

  assert.ok(consoleRule, 'compiled stylesheet has no .console rule')
  assert.match(consoleRule, /min-width:0/)
  assert.match(consoleRule, /width:100%/)
})

test('the landing page serializes the final voyage in four acts', { skip: !built }, () => {
  const html = readFileSync(join(distDir, 'index.html'), 'utf8')

  for (const act of ['chart', 'crew', 'storm', 'arrival']) {
    assert.match(html, new RegExp(`data-voyage-act="${act}"`), `missing ${act} act`)
  }
})

test('every act opens with a narration box that carries the story', { skip: !built }, () => {
  const html = readFileSync(join(distDir, 'index.html'), 'utf8')
  const narrations = html.match(/class="narration[\s"]/g) ?? []

  assert.ok(
    narrations.length >= 4,
    `expected a narration box per act, found ${narrations.length}`,
  )
})

test('the acts are cut into koma panels', { skip: !built }, () => {
  const html = readFileSync(join(distDir, 'index.html'), 'utf8')
  const panels = html.match(/data-panel/g) ?? []

  assert.ok(panels.length >= 8, `expected at least 8 koma panels, found ${panels.length}`)

  const stylesheets = readdirSync(distDir, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.css'))
    .map((entry) => readFileSync(join(entry.parentPath, entry.name), 'utf8'))
    .join('\n')
  const komaRule = stylesheets.match(/\.koma\{([^}]*)\}/)?.[1]

  assert.ok(komaRule, 'compiled stylesheet has no .koma rule')
  assert.match(komaRule, /border/)
})

test('panels ink themselves in as the reader scrolls', { skip: !built }, () => {
  const scriptFiles = readdirSync(distDir, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.js'))
  const javascript = scriptFiles
    .map((entry) => readFileSync(join(entry.parentPath, entry.name), 'utf8'))
    .join('\n')

  assert.match(javascript, /data-panel/, 'motion runtime never targets koma panels')
  assert.match(javascript, /clip/i, 'panel reveal does not use an ink wipe')
})

test('the storm act shouts and the finale pours a drink', { skip: !built }, () => {
  const html = readFileSync(join(distDir, 'index.html'), 'utf8')
  const storm = html.split('data-voyage-act="storm"')[1]?.split('data-voyage-act=')[0]

  assert.ok(storm, 'storm act missing')
  assert.match(storm, /class="sfx/, 'storm act has no shout lettering')
  assert.match(html, /journey-sake/, 'finale is missing the shared drink')
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
