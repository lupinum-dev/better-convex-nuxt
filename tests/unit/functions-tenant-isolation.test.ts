import { describe, expect, it } from 'vitest'

import { defineTrellis } from '../../src/runtime/functions'

describe('defineTrellis tenant isolation validation', () => {
  it('rejects an empty tenantIsolation table list', () => {
    expect(() =>
      defineTrellis(
        { query: () => null as never, mutation: () => null as never },
        {
          tenantIsolation: {
            tables: [],
          },
        },
      ),
    ).toThrow('tenantIsolation.tables must include at least one table.')
  })

  it('rejects duplicate tenantIsolation tables', () => {
    expect(() =>
      defineTrellis(
        { query: () => null as never, mutation: () => null as never },
        {
          tenantIsolation: {
            tables: ['todos', 'todos'] as never[],
          },
        },
      ),
    ).toThrow('tenantIsolation.tables contains a duplicate table: "todos".')
  })

  it('rejects a blank tenantIsolation field', () => {
    expect(() =>
      defineTrellis(
        { query: () => null as never, mutation: () => null as never },
        {
          tenantIsolation: {
            tables: ['todos'] as never[],
            field: '   ',
          },
        },
      ),
    ).toThrow('tenantIsolation.field must be a non-empty string when provided.')
  })

  it('rejects duplicate tenantIsolation global tables', () => {
    expect(() =>
      defineTrellis(
        { query: () => null as never, mutation: () => null as never },
        {
          tenantIsolation: {
            tables: ['todos'] as never[],
            globalTables: ['users', 'users'] as never[],
          },
        },
      ),
    ).toThrow('tenantIsolation.globalTables contains a duplicate table: "users".')
  })

  it('rejects overlapping tenant and global table classification', () => {
    expect(() =>
      defineTrellis(
        { query: () => null as never, mutation: () => null as never },
        {
          tenantIsolation: {
            tables: ['todos'] as never[],
            globalTables: ['todos'] as never[],
          },
        },
      ),
    ).toThrow('tenantIsolation cannot classify table "todos" as both tenant-scoped and global.')
  })

  it('rejects removed custom RLS authoring', () => {
    expect(() =>
      defineTrellis({ query: () => null as never, mutation: () => null as never }, {
        rls: {
          rules: {},
        },
      } as never),
    ).toThrow(
      'defineTrellis({ rls }) has been removed. Keep business authorization in guard/load/authorize/handler and use tenantIsolation/services for runtime guardrails.',
    )
  })
})
