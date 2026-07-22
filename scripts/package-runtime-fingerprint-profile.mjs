import { getPackageCertificationDescriptor } from './package-certification-manifest.mjs'

export const runtimeFingerprintPattern = /^bcn-release-v1-[0-9a-f]{64}$/u

const runtimeFingerprintProfiles = Object.freeze({
  'nuxt-runtime-binding': Object.freeze({
    buildFiles: Object.freeze(['dist/runtime/shared/release-fingerprint.js']),
    mode: 'required',
    moduleBindings: Object.freeze([
      Object.freeze({
        helperImport: '../dist/runtime/shared/release-fingerprint.js',
        packedFile: 'dist/module.mjs',
      }),
    ]),
    packedFiles: Object.freeze(['dist/runtime/shared/release-fingerprint.js']),
    token: '__BCN_RELEASE_RUNTIME_FINGERPRINT__',
  }),
  'vue-no-runtime-fingerprint': Object.freeze({ mode: 'forbidden' }),
  'mcp-no-runtime-fingerprint': Object.freeze({ mode: 'forbidden' }),
})

function assertExactFields(value, fields, label) {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    Object.keys(value).length !== fields.length ||
    !fields.every((field) => Object.hasOwn(value, field))
  ) {
    throw new Error(`${label} is invalid.`)
  }
}

export function assertRuntimeFingerprintProfile(profile) {
  if (profile?.mode === 'forbidden') {
    assertExactFields(profile, ['mode'], 'Forbidden runtime-fingerprint profile')
    return profile
  }
  assertExactFields(
    profile,
    ['buildFiles', 'mode', 'moduleBindings', 'packedFiles', 'token'],
    'Required runtime-fingerprint profile',
  )
  if (
    profile.mode !== 'required' ||
    !Array.isArray(profile.buildFiles) ||
    profile.buildFiles.length === 0 ||
    !Array.isArray(profile.packedFiles) ||
    profile.packedFiles.length === 0 ||
    !Array.isArray(profile.moduleBindings) ||
    profile.moduleBindings.length === 0 ||
    typeof profile.token !== 'string' ||
    runtimeFingerprintPattern.test(profile.token) ||
    [...profile.buildFiles, ...profile.packedFiles].some(
      (path) => typeof path !== 'string' || !/^dist\/[\w./-]+$/u.test(path),
    ) ||
    profile.moduleBindings.some(
      (binding) =>
        !binding ||
        typeof binding !== 'object' ||
        Object.keys(binding).sort().join(',') !== 'helperImport,packedFile' ||
        typeof binding.helperImport !== 'string' ||
        !/^\.\.\/dist\/[\w./-]+$/u.test(binding.helperImport) ||
        typeof binding.packedFile !== 'string' ||
        !/^dist\/[\w./-]+$/u.test(binding.packedFile),
    )
  ) {
    throw new Error('Required runtime-fingerprint profile is invalid.')
  }
  return profile
}

export function getPackageRuntimeFingerprintProfile(packageId) {
  const descriptor = getPackageCertificationDescriptor(packageId)
  const profileId = descriptor.profiles.runtimeFingerprint
  const profile = runtimeFingerprintProfiles[profileId]
  if (!profile) {
    throw new Error(`Package ${descriptor.id} has no reviewed runtime-fingerprint profile.`)
  }
  assertRuntimeFingerprintProfile(profile)
  return Object.freeze({ descriptor, profile })
}

export function assertRuntimeFingerprintEvidence(profile, value) {
  assertRuntimeFingerprintProfile(profile)
  if (profile.mode === 'forbidden') {
    if (value !== null) {
      throw new Error('Runtime fingerprint is forbidden for this package profile.')
    }
    return
  }
  if (typeof value !== 'string' || !runtimeFingerprintPattern.test(value)) {
    throw new Error('Runtime fingerprint is required for this package profile.')
  }
}
