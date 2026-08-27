import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { copyManifest } from '../scripts/sync-manifest.mjs'

test('copyManifest throws when the source manifest is missing', () => {
  const dir = mkdtempSync(join(tmpdir(), 'sync-'))
  assert.throws(() => copyManifest(join(dir, 'absent.json'), join(dir, 'out', 'manifest.json')), /not found/)
})

test('copyManifest creates the destination directory and copies bytes', () => {
  const dir = mkdtempSync(join(tmpdir(), 'sync-'))
  const src = join(dir, 'manifest.json')
  writeFileSync(src, '{"ok":true}')
  const dest = copyManifest(src, join(dir, 'deep', 'nested', 'manifest.json'))
  assert.equal(readFileSync(dest, 'utf8'), '{"ok":true}')
})
