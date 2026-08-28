const REQUIRED_PLUGIN_FIELDS = ['id', 'name', 'version', 'description', 'tagline', 'intro']

function assertText(value, label) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`manifest ${label} is missing or empty`)
  }
}

/**
 * Validate the cc-marketspec manifest shape the landing page renders.
 * Throws so a contract break fails the build instead of deploying blanks.
 * @template T
 * @param {T} data
 * @returns {T}
 */
export function validateManifest(data) {
  assertText(data?.marketplace?.name, 'marketplace.name')
  assertText(data?.marketplace?.description, 'marketplace.description')
  if (!Array.isArray(data.groups)) throw new Error('manifest groups must be an array')
  if (!Array.isArray(data.plugins) || data.plugins.length === 0) {
    throw new Error('manifest plugins must be a non-empty array')
  }
  for (const [i, plugin] of data.plugins.entries()) {
    for (const field of REQUIRED_PLUGIN_FIELDS) assertText(plugin?.[field], `plugins[${i}].${field}`)
    if (!Array.isArray(plugin.skills) || plugin.skills.length === 0) {
      throw new Error(`manifest plugins[${i}].skills must be a non-empty array`)
    }
  }
  return data
}
