import type { TableMeta } from 'better-convex-nuxt/schema'

import { describe, expect, it } from 'vitest'

import { extractScopedTables } from '../../src/runtime/scoping/extract-scoped-tables'

describe('extractScopedTables', () => {
  it('returns table names where tenant.scoped is true', () => {
    const metas = {
      posts: { tenant: { scoped: true } },
      comments: { tenant: { scoped: true } },
      users: { description: 'Global users table' },
    } satisfies Record<string, TableMeta>

    const result = extractScopedTables(metas)

    expect(result).toEqual(['posts', 'comments'])
  })

  it('excludes tables without tenant meta', () => {
    const metas = {
      settings: { description: 'App settings' },
      users: {},
    } satisfies Record<string, TableMeta>

    const result = extractScopedTables(metas)

    expect(result).toEqual([])
  })

  it('excludes tables with tenant but without scoped: true', () => {
    const metas = {
      posts: { tenant: { scoped: true } },
      logs: { tenant: { scoped: true, ownerField: 'userId' } },
      // TypeScript enforces scoped: true, but runtime should still filter
    } satisfies Record<string, TableMeta>

    const result = extractScopedTables(metas)

    expect(result).toEqual(['posts', 'logs'])
  })

  it('returns empty array when no tables are scoped', () => {
    const metas = {
      users: {},
      settings: { description: 'Global' },
    } satisfies Record<string, TableMeta>

    expect(extractScopedTables(metas)).toEqual([])
  })

  it('returns empty array for empty input', () => {
    expect(extractScopedTables({})).toEqual([])
  })

  it('preserves ownerField metadata', () => {
    const metas = {
      posts: { tenant: { scoped: true, ownerField: 'authorId' } },
    } satisfies Record<string, TableMeta>

    // extractScopedTables only returns names, but the metadata is preserved
    // in the original object for other consumers
    const result = extractScopedTables(metas)
    expect(result).toEqual(['posts'])
    expect(metas.posts.tenant?.ownerField).toBe('authorId')
  })
})
