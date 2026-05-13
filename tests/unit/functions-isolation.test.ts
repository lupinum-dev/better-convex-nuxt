import { describe, expect, it } from 'vitest'

import { defineTrellis } from '../../src/runtime/functions'

describe('defineTrellis isolation validation', () => {
  it('rejects an empty isolation table list', () => {
    expect(() =>
      defineTrellis(
        { query: () => null as never, mutation: () => null as never },
        {
          isolation: {
            tables: [],
          },
        },
      ),
    ).toThrow('isolation.tables must include at least one table.')
  })

  it('rejects duplicate isolation tables', () => {
    expect(() =>
      defineTrellis(
        { query: () => null as never, mutation: () => null as never },
        {
          isolation: {
            tables: ['todos', 'todos'] as never[],
          },
        },
      ),
    ).toThrow('isolation.tables contains a duplicate table: "todos".')
  })

  it('rejects a blank isolation field', () => {
    expect(() =>
      defineTrellis(
        { query: () => null as never, mutation: () => null as never },
        {
          isolation: {
            tables: ['todos'] as never[],
            field: '   ',
          },
        },
      ),
    ).toThrow('isolation.field must be a non-empty string when provided.')
  })

  it('rejects duplicate isolation global tables', () => {
    expect(() =>
      defineTrellis(
        { query: () => null as never, mutation: () => null as never },
        {
          isolation: {
            tables: ['todos'] as never[],
            sharedTables: ['users', 'users'] as never[],
          },
        },
      ),
    ).toThrow('isolation.sharedTables contains a duplicate table: "users".')
  })

  it('rejects overlapping tenant and global table classification', () => {
    expect(() =>
      defineTrellis(
        { query: () => null as never, mutation: () => null as never },
        {
          isolation: {
            tables: ['todos'] as never[],
            sharedTables: ['todos'] as never[],
          },
        },
      ),
    ).toThrow('isolation cannot classify table "todos" as both tenant-scoped and global.')
  })

  it('rejects removed custom RLS authoring', () => {
    expect(() =>
      defineTrellis({ query: () => null as never, mutation: () => null as never }, {
        rls: {
          rules: {},
        },
      } as never),
    ).toThrow(
      'defineTrellis({ rls }) has been removed. Keep business authorization in guard/load/authorize/handler and use isolation/services for runtime guardrails.',
    )
  })
})
