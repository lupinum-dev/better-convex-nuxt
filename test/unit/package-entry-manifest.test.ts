import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

import { checkEntryExportShape } from '../../scripts/package-check/declarations.mjs'
import { entries as checkerEntries } from '../../scripts/package-check/entry-rules.mjs'
import {
  getPackageEntry,
  packageEntries,
  validatePackageEntries,
} from '../../scripts/package-entry-manifest.mjs'

describe('package entry manifest', () => {
  it('models the generated component declaration as one canonical types-only entry', () => {
    const entry = getPackageEntry('./convex-auth/_generated/component.js')
    expect(entry).toMatchObject({
      kind: 'types-only',
      distDts: 'dist/runtime/convex-auth/component/_generated/component.d.ts',
      valueExports: [],
      typeExports: ['ComponentApi'],
      exactDeclaredExports: true,
    })
    expect('distJs' in entry).toBe(false)

    const packageJson = JSON.parse(readFileSync(resolve('package.json'), 'utf8'))
    expect(packageJson.exports[entry.subpath]).toEqual({ types: `./${entry.distDts}` })
    expect(packageJson.typesVersions['*']['convex-auth/_generated/component.js']).toEqual([
      `./${entry.distDts}`,
    ])
  })

  it('rejects JavaScript targets and value exports on a types-only entry', () => {
    expect(() =>
      validatePackageEntries([
        {
          kind: 'types-only',
          subpath: './invalid',
          distJs: 'dist/invalid.js',
          distDts: 'dist/invalid.d.ts',
          valueExports: ['default'],
          typeExports: [],
          forbiddenNames: [],
        },
      ]),
    ).toThrow(/cannot declare JavaScript or values/)
  })

  it('checks a types-only declaration without requiring a JavaScript artifact', () => {
    const artifactRoot = mkdtempSync(join(tmpdir(), 'bcn-types-only-entry-'))
    try {
      writeFileSync(join(artifactRoot, 'component.d.ts'), 'export interface ComponentApi {}\n')
      const failures: string[] = []
      const warnings: string[] = []

      checkEntryExportShape(
        {
          kind: 'types-only',
          subpath: './component.js',
          distDts: 'component.d.ts',
          expectedValueExports: [],
          additionalExpectedDeclaredNames: ['ComponentApi'],
          exactDeclaredExports: true,
          forbiddenNames: [],
        },
        failures,
        warnings,
        artifactRoot,
      )

      expect(failures).toEqual([])
      expect(warnings).toEqual([])

      writeFileSync(
        join(artifactRoot, 'component.d.ts'),
        'export interface ComponentApi {}\nexport type AccidentalPublicType = string\n',
      )
      checkEntryExportShape(
        {
          kind: 'types-only',
          subpath: './component.js',
          distDts: 'component.d.ts',
          expectedValueExports: [],
          additionalExpectedDeclaredNames: ['ComponentApi'],
          exactDeclaredExports: true,
          forbiddenNames: [],
        },
        failures,
        warnings,
        artifactRoot,
      )
      expect(failures).toContainEqual(expect.stringContaining('AccidentalPublicType'))
    } finally {
      rmSync(artifactRoot, { recursive: true, force: true })
    }
  })

  it('declares each public subpath once', () => {
    expect(validatePackageEntries(packageEntries)).toBe(packageEntries)
    expect(new Set(packageEntries.map((entry) => entry.subpath)).size).toBe(packageEntries.length)
  })

  it('applies the Convex auth source boundary to the packed entry too', () => {
    const entry = checkerEntries.find((candidate) => candidate.subpath === './convex-auth')
    if (!entry?.purity) throw new Error('Missing Convex auth package purity rule')
    const isForbidden = (specifier: string) =>
      entry.purity?.forbiddenSpecifierPatterns.some((pattern) => pattern.test(specifier)) ?? false

    for (const specifier of [
      '<computed dynamic import>',
      'fs',
      'node:path',
      '#app',
      '~/server',
      '@/server',
      'convex/browser',
      'better-convex-nuxt/server',
      'vue',
    ]) {
      expect(isForbidden(specifier), specifier).toBe(true)
    }
    expect(isForbidden('convex/server')).toBe(false)
    expect(isForbidden('better-auth/db')).toBe(false)
  })
})
