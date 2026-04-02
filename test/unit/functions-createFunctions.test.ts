import { describe, expect, it } from 'vitest'

import { createFunctions } from '../../src/runtime/functions'

describe('createFunctions tenant isolation validation', () => {
  it('rejects an empty tenantIsolation table list', () => {
    expect(() =>
      createFunctions(
        () => null as never,
        () => null as never,
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
      createFunctions(
        () => null as never,
        () => null as never,
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
      createFunctions(
        () => null as never,
        () => null as never,
        {
          tenantIsolation: {
            tables: ['todos'] as never[],
            field: '   ',
          },
        },
      ),
    ).toThrow('tenantIsolation.field must be a non-empty string when provided.')
  })
})
