import { describe, expect, it } from 'vitest'
import { v } from 'convex/values'

import {
  isConvexValidator,
  isStandardSchema,
  resolveSchema,
  runValidation,
} from '../../src/runtime/utils/resolve-validator'
import { toConvexSchema } from '../../src/runtime/utils/convex-schema'
import type { StandardSchemaV1 } from '../../src/runtime/utils/standard-schema'

// ---------------------------------------------------------------------------
// Detection
// ---------------------------------------------------------------------------
describe('isConvexValidator', () => {
  it('returns true for a Convex validator', () => {
    expect(isConvexValidator(v.string())).toBe(true)
    expect(isConvexValidator(v.object({ a: v.string() }))).toBe(true)
  })

  it('returns false for non-Convex values', () => {
    expect(isConvexValidator(null)).toBe(false)
    expect(isConvexValidator(undefined)).toBe(false)
    expect(isConvexValidator('string')).toBe(false)
    expect(isConvexValidator({ foo: 'bar' })).toBe(false)
  })

  it('returns false for a Standard Schema object', () => {
    const ss = toConvexSchema(v.string())
    expect(isConvexValidator(ss)).toBe(false)
  })
})

describe('isStandardSchema', () => {
  it('returns true for a Standard Schema object', () => {
    const ss = toConvexSchema(v.string())
    expect(isStandardSchema(ss)).toBe(true)
  })

  it('returns false for a Convex validator', () => {
    expect(isStandardSchema(v.string())).toBe(false)
  })

  it('returns false for non-objects', () => {
    expect(isStandardSchema(null)).toBe(false)
    expect(isStandardSchema(42)).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// Resolution
// ---------------------------------------------------------------------------
describe('resolveSchema', () => {
  it('wraps a Convex validator into Standard Schema', () => {
    const schema = resolveSchema(v.string())
    expect(schema['~standard'].version).toBe(1)
    expect(schema['~standard'].vendor).toBe('better-convex-nuxt')
  })

  it('passes through a Standard Schema object unchanged', () => {
    const ss = toConvexSchema(v.string())
    const resolved = resolveSchema(ss)
    expect(resolved).toBe(ss)
  })

  it('throws for unknown input', () => {
    expect(() => resolveSchema({ foo: 'bar' } as any)).toThrow(/Expected a Convex validator/)
  })
})

// ---------------------------------------------------------------------------
// runValidation
// ---------------------------------------------------------------------------
describe('runValidation', () => {
  it('returns valid result on success', async () => {
    const schema = toConvexSchema(v.string())
    const result = await runValidation(schema, 'hello')
    expect(result).toEqual({ valid: true, value: 'hello' })
  })

  it('returns issues on failure', async () => {
    const schema = toConvexSchema(v.string())
    const result = await runValidation(schema, 42)
    expect(result.valid).toBe(false)
    if (!result.valid) {
      expect(result.issues).toHaveLength(1)
      expect(result.issues[0]!.message).toMatch(/Expected string/)
    }
  })

  it('converts path arrays to dot-notation strings', async () => {
    const schema = toConvexSchema(v.object({
      customer: v.object({ name: v.string() }),
    }))
    const result = await runValidation(schema, { customer: { name: 42 } })
    expect(result.valid).toBe(false)
    if (!result.valid) {
      expect(result.issues[0]!.path).toBe('customer.name')
    }
  })

  it('handles PathSegment objects in path', async () => {
    // Create a mock Standard Schema that returns PathSegment objects
    const mockSchema: StandardSchemaV1 = {
      '~standard': {
        version: 1,
        vendor: 'test',
        validate: () => ({
          issues: [{
            message: 'bad',
            path: [{ key: 'address' }, { key: 'zip' }],
          }],
        }),
      },
    }
    const result = await runValidation(mockSchema, {})
    expect(result.valid).toBe(false)
    if (!result.valid) {
      expect(result.issues[0]!.path).toBe('address.zip')
    }
  })

  it('handles mixed PropertyKey and PathSegment in path', async () => {
    const mockSchema: StandardSchemaV1 = {
      '~standard': {
        version: 1,
        vendor: 'test',
        validate: () => ({
          issues: [{
            message: 'bad',
            path: ['items', 0, { key: 'quantity' }],
          }],
        }),
      },
    }
    const result = await runValidation(mockSchema, {})
    expect(result.valid).toBe(false)
    if (!result.valid) {
      expect(result.issues[0]!.path).toBe('items.0.quantity')
    }
  })

  it('sets path to undefined when issue has no path', async () => {
    const mockSchema: StandardSchemaV1 = {
      '~standard': {
        version: 1,
        vendor: 'test',
        validate: () => ({
          issues: [{ message: 'bad' }],
        }),
      },
    }
    const result = await runValidation(mockSchema, {})
    expect(result.valid).toBe(false)
    if (!result.valid) {
      expect(result.issues[0]!.path).toBeUndefined()
    }
  })

  it('handles async validate functions', async () => {
    const mockSchema: StandardSchemaV1 = {
      '~standard': {
        version: 1,
        vendor: 'test',
        validate: async () => ({
          issues: [{ message: 'async error', path: ['field'] }],
        }),
      },
    }
    const result = await runValidation(mockSchema, {})
    expect(result.valid).toBe(false)
    if (!result.valid) {
      expect(result.issues[0]!.message).toBe('async error')
    }
  })

  it('collects multiple issues', async () => {
    const schema = toConvexSchema(v.object({
      name: v.string(),
      age: v.float64(),
    }))
    const result = await runValidation(schema, { name: 42, age: 'old' })
    expect(result.valid).toBe(false)
    if (!result.valid) {
      expect(result.issues).toHaveLength(2)
      expect(result.issues[0]!.path).toBe('name')
      expect(result.issues[1]!.path).toBe('age')
    }
  })
})
