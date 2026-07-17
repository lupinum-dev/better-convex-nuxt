import { createHash } from 'node:crypto'

/**
 * Package fields that define the published package's production dependency and
 * installation contract. Release verification compares these fields from the
 * extracted candidate with the reviewed source manifest before trusting its
 * SBOM.
 */
export const productionManifestContractFields = Object.freeze([
  'name',
  'version',
  'dependencies',
  'optionalDependencies',
  'peerDependencies',
  'peerDependenciesMeta',
  'engines',
  'packageManager',
  'bundleDependencies',
  'bundledDependencies',
  'os',
  'cpu',
  'libc',
  'private',
  'publishConfig',
])

export function selectProductionManifestContract(manifest) {
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) {
    throw new TypeError('Production package manifest must be a JSON object.')
  }
  return Object.fromEntries(
    productionManifestContractFields
      .filter((field) => Object.hasOwn(manifest, field))
      .map((field) => [field, manifest[field]]),
  )
}

export function productionManifestContractDigest(manifest) {
  const canonical = canonicalizeJson(selectProductionManifestContract(manifest))
  return createHash('sha256').update(JSON.stringify(canonical)).digest('hex')
}

function canonicalizeJson(value) {
  if (Array.isArray(value)) return value.map(canonicalizeJson)
  if (!value || typeof value !== 'object') return value
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, canonicalizeJson(value[key])]),
  )
}
