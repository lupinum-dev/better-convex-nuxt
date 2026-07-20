import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

import { buildEdges, RULES } from '../../scripts/check-boundaries.mjs'

type BoundaryEdge = {
  isRelative: boolean
  isTypeOnly: boolean
  resolvedAbsPath: string | null
  specifier: string
}

function rule(name: string) {
  const match = RULES.find((candidate) => candidate.name === name)
  if (!match) throw new Error(`Missing boundary rule ${name}`)
  return match
}

function bare(specifier: string): BoundaryEdge {
  return { isRelative: false, isTypeOnly: false, resolvedAbsPath: null, specifier }
}

function relativeEdge(specifier: string, resolvedAbsPath: string): BoundaryEdge {
  return { isRelative: true, isTypeOnly: false, resolvedAbsPath, specifier }
}

describe('Convex auth dependency boundaries', () => {
  const islandFile = resolve('src/runtime/convex-auth/index.ts')
  const islandSibling = resolve('src/runtime/convex-auth/context.ts')
  const sharedOrigin = resolve('src/runtime/shared/auth-origin.ts')
  const sharedClientIp = resolve('src/runtime/shared/client-ip.ts')

  it('keeps the Convex auth island framework-free and edge-compatible', () => {
    const boundary = rule('convex-auth-island-framework-free')
    expect(boundary.from(islandFile)).toBe(true)
    expect(boundary.disallow(relativeEdge('./context', islandSibling))).toBe(false)
    expect(boundary.disallow(relativeEdge('../shared/auth-origin', sharedOrigin))).toBe(false)
    expect(boundary.disallow(relativeEdge('../shared/client-ip', sharedClientIp))).toBe(false)

    for (const specifier of [
      'vue',
      'nuxt',
      'nitropack/runtime',
      'h3',
      '#app',
      '~/runtime/server',
      '@/runtime/server',
      'fs',
      'node:crypto',
      'convex/browser',
      'better-convex-nuxt/server',
    ]) {
      expect(boundary.disallow(bare(specifier)), specifier).toBe(true)
    }
    expect(boundary.disallow(bare('convex/server'))).toBe(false)
    expect(boundary.typeOnlyExempt).toBe(false)
  })

  it('prevents module and browser surfaces from importing the backend island', () => {
    const backendEdge = relativeEdge('./runtime/convex-auth', islandFile)
    const moduleBoundary = rule('module-no-convex-auth-imports')
    const browserBoundary = rule('browser-no-convex-auth-imports')

    expect(moduleBoundary.from(resolve('src/module.ts'))).toBe(true)
    expect(moduleBoundary.disallow(backendEdge)).toBe(true)
    expect(browserBoundary.from(resolve('src/runtime/auth-client/index.ts'))).toBe(true)
    expect(browserBoundary.disallow(backendEdge)).toBe(true)
    expect(browserBoundary.disallow(bare('better-convex-nuxt/convex-auth'))).toBe(true)
  })

  it('keeps the shared origin parser dependency-free', () => {
    const boundary = rule('shared-auth-origin-dependency-free')
    expect(boundary.from(sharedOrigin)).toBe(true)
    expect(boundary.disallow(bare('convex/server'))).toBe(true)
    expect(boundary.typeOnlyExempt).toBe(false)
  })

  it('keeps the shared client IP signer dependency-free', () => {
    const boundary = rule('shared-client-ip-dependency-free')
    expect(boundary.from(sharedClientIp)).toBe(true)
    expect(boundary.disallow(bare('convex/server'))).toBe(true)
    expect(boundary.typeOnlyExempt).toBe(false)
  })

  it('resolves emitted .js specifiers to their TypeScript source target', () => {
    const directory = mkdtempSync(join(tmpdir(), 'bcn-boundary-resolution-'))
    try {
      const source = join(directory, 'source.ts')
      const target = join(directory, 'target.ts')
      writeFileSync(source, "export { target } from './target.js'\n")
      writeFileSync(target, 'export const target = true\n')

      expect(buildEdges(source)).toEqual([
        {
          isRelative: true,
          isTypeOnly: false,
          resolvedAbsPath: target,
          specifier: './target.js',
        },
      ])
    } finally {
      rmSync(directory, { recursive: true, force: true })
    }
  })

  it('rejects computed dynamic imports that cannot be statically audited', () => {
    const directory = mkdtempSync(join(tmpdir(), 'bcn-boundary-dynamic-import-'))
    try {
      const source = join(directory, 'source.ts')
      writeFileSync(source, "void import(['node', 'path'].join(':'))\n")

      const [edge] = buildEdges(source)
      expect(edge).toBeDefined()
      if (!edge) throw new Error('Expected one computed dynamic import edge.')
      expect(edge).toMatchObject({
        isRelative: false,
        isTypeOnly: false,
        specifier: '<computed dynamic import>',
      })
      expect(rule('convex-auth-island-framework-free').disallow(edge)).toBe(true)
    } finally {
      rmSync(directory, { recursive: true, force: true })
    }
  })
})
