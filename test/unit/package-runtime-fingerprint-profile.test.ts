import { describe, expect, it } from 'vitest'

import {
  assertRuntimeFingerprintEvidence,
  assertRuntimeFingerprintProfile,
  getPackageRuntimeFingerprintProfile,
} from '../../scripts/package-runtime-fingerprint-profile.mjs'

describe('package runtime-fingerprint profiles', () => {
  it('selects the exact required Nuxt runtime binding', () => {
    const selected = getPackageRuntimeFingerprintProfile('nuxt')
    expect(selected.descriptor.profiles.runtimeFingerprint).toBe('nuxt-runtime-binding')
    expect(selected.profile).toEqual({
      buildFiles: ['dist/runtime/shared/release-fingerprint.js'],
      mode: 'required',
      moduleBindings: [
        {
          helperImport: '../dist/runtime/shared/release-fingerprint.js',
          packedFile: 'dist/module.mjs',
        },
      ],
      packedFiles: ['dist/runtime/shared/release-fingerprint.js'],
      token: '__BCN_RELEASE_RUNTIME_FINGERPRINT__',
    })
    expect(Object.isFrozen(selected.profile)).toBe(true)
    expect(Object.isFrozen(selected.profile.buildFiles)).toBe(true)
    expect(Object.isFrozen(selected.profile.moduleBindings[0])).toBe(true)
  })

  it('requires a generated fingerprint and rejects placeholders or malformed values', () => {
    const { profile } = getPackageRuntimeFingerprintProfile('nuxt')
    expect(() =>
      assertRuntimeFingerprintEvidence(profile, `bcn-release-v1-${'a'.repeat(64)}`),
    ).not.toThrow()
    for (const value of [
      undefined,
      null,
      '',
      '__BCN_RELEASE_RUNTIME_FINGERPRINT__',
      `bcn-release-v1-${'g'.repeat(64)}`,
    ]) {
      expect(() => assertRuntimeFingerprintEvidence(profile, value), String(value)).toThrow(
        'Runtime fingerprint is required',
      )
    }
  })

  it('requires null evidence for a library-only forbidden profile', () => {
    const selected = getPackageRuntimeFingerprintProfile('vue')
    expect(selected.descriptor.profiles.runtimeFingerprint).toBe('vue-no-runtime-fingerprint')
    expect(selected.profile).toEqual({ mode: 'forbidden' })
    const profile = selected.profile
    expect(() => assertRuntimeFingerprintEvidence(profile, null)).not.toThrow()
    for (const value of [
      undefined,
      '',
      '__BCN_RELEASE_RUNTIME_FINGERPRINT__',
      `bcn-release-v1-${'a'.repeat(64)}`,
    ]) {
      expect(() => assertRuntimeFingerprintEvidence(profile, value), String(value)).toThrow(
        'Runtime fingerprint is forbidden',
      )
    }
  })

  it('forbids a runtime fingerprint in the MCP library package', () => {
    const selected = getPackageRuntimeFingerprintProfile('mcp')
    expect(selected.descriptor.profiles.runtimeFingerprint).toBe('mcp-no-runtime-fingerprint')
    expect(selected.profile).toEqual({ mode: 'forbidden' })
    expect(() => assertRuntimeFingerprintEvidence(selected.profile, null)).not.toThrow()
  })

  it('rejects permissive or malformed profile shapes', () => {
    expect(() => assertRuntimeFingerprintProfile({ mode: 'optional' })).toThrow(
      'Required runtime-fingerprint profile is invalid',
    )
    expect(() =>
      assertRuntimeFingerprintProfile({
        mode: 'forbidden',
        token: 'unexpected',
      }),
    ).toThrow('Forbidden runtime-fingerprint profile is invalid')
    expect(() => getPackageRuntimeFingerprintProfile('not-reviewed')).toThrow(
      'Unknown package certification descriptor: not-reviewed',
    )
  })
})
