import assert from 'node:assert/strict'
import { test } from 'node:test'
import { validateManifest } from '../src/lib/manifest.mjs'

const valid = () => ({
  marketplace: { name: 'laugh-tale', description: 'Travel-site skills.' },
  groups: [{ id: 'trip-sites', label: 'Trip Sites' }],
  plugins: [{
    id: 'eternal-pose', name: 'eternal-pose', version: '0.1.0',
    description: 'Build trip sites.', tagline: 'Turn itineraries into sites',
    intro: 'Create or evolve a travel website.',
    skills: [{ name: 'eternal-pose', examples: [] }],
  }],
})

test('accepts and returns a valid manifest', () => {
  const data = valid()
  assert.equal(validateManifest(data), data)
})

test('rejects an empty plugin list', () => {
  const data = valid()
  data.plugins = []
  assert.throws(() => validateManifest(data), /plugins/)
})

test('rejects a plugin missing its tagline', () => {
  const data = valid()
  delete data.plugins[0].tagline
  assert.throws(() => validateManifest(data), /tagline/)
})

test('rejects a plugin with no skills', () => {
  const data = valid()
  data.plugins[0].skills = []
  assert.throws(() => validateManifest(data), /skills/)
})
