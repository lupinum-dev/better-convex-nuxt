import { describe, expect, it } from 'vitest'
import { v } from 'convex/values'

import { validateConvex, toConvexSchema } from '../../src/runtime/utils/convex-schema'

describe('validateConvex', () => {
  // -----------------------------------------------------------------------
  // Primitives
  // -----------------------------------------------------------------------
  describe('primitives', () => {
    it('validates v.string()', () => {
      expect(validateConvex(v.string(), 'hello')).toEqual([])
    })

    it('rejects non-string for v.string()', () => {
      const issues = validateConvex(v.string(), 42)
      expect(issues).toHaveLength(1)
      expect(issues[0]!.message).toMatch(/Expected string/)
    })

    it('validates v.float64()', () => {
      expect(validateConvex(v.float64(), 3.14)).toEqual([])
    })

    it('rejects non-number for v.float64()', () => {
      const issues = validateConvex(v.float64(), 'nope')
      expect(issues).toHaveLength(1)
      expect(issues[0]!.message).toMatch(/Expected number/)
    })

    it('validates v.int64()', () => {
      expect(validateConvex(v.int64(), BigInt(42))).toEqual([])
    })

    it('rejects non-bigint for v.int64()', () => {
      const issues = validateConvex(v.int64(), 42)
      expect(issues).toHaveLength(1)
      expect(issues[0]!.message).toMatch(/Expected bigint/)
    })

    it('validates v.boolean()', () => {
      expect(validateConvex(v.boolean(), true)).toEqual([])
    })

    it('rejects non-boolean for v.boolean()', () => {
      const issues = validateConvex(v.boolean(), 1)
      expect(issues).toHaveLength(1)
      expect(issues[0]!.message).toMatch(/Expected boolean/)
    })

    it('validates v.null()', () => {
      expect(validateConvex(v.null(), null)).toEqual([])
    })

    it('rejects non-null for v.null()', () => {
      const issues = validateConvex(v.null(), undefined)
      expect(issues).toHaveLength(1)
      // undefined on a required validator → "Required"
      expect(issues[0]!.message).toBe('Required')
    })

    it('validates v.bytes()', () => {
      expect(validateConvex(v.bytes(), new ArrayBuffer(8))).toEqual([])
    })

    it('rejects non-ArrayBuffer for v.bytes()', () => {
      const issues = validateConvex(v.bytes(), 'not bytes')
      expect(issues).toHaveLength(1)
      expect(issues[0]!.message).toMatch(/Expected ArrayBuffer/)
    })

    it('validates v.any() with any value', () => {
      expect(validateConvex(v.any(), 'anything')).toEqual([])
      expect(validateConvex(v.any(), 42)).toEqual([])
      expect(validateConvex(v.any(), null)).toEqual([])
      expect(validateConvex(v.any(), { nested: true })).toEqual([])
    })
  })

  // -----------------------------------------------------------------------
  // Literal
  // -----------------------------------------------------------------------
  describe('literal', () => {
    it('validates matching string literal', () => {
      expect(validateConvex(v.literal('admin'), 'admin')).toEqual([])
    })

    it('rejects non-matching string literal', () => {
      const issues = validateConvex(v.literal('admin'), 'user')
      expect(issues).toHaveLength(1)
      expect(issues[0]!.message).toMatch(/Expected literal "admin"/)
    })

    it('validates numeric literal', () => {
      expect(validateConvex(v.literal(42), 42)).toEqual([])
    })

    it('validates boolean literal', () => {
      expect(validateConvex(v.literal(true), true)).toEqual([])
    })

    it('rejects different type for literal', () => {
      const issues = validateConvex(v.literal('yes'), true)
      expect(issues).toHaveLength(1)
    })
  })

  // -----------------------------------------------------------------------
  // ID
  // -----------------------------------------------------------------------
  describe('id', () => {
    it('validates string for v.id()', () => {
      expect(validateConvex(v.id('users'), 'abc123')).toEqual([])
    })

    it('rejects non-string for v.id()', () => {
      const issues = validateConvex(v.id('users'), 42)
      expect(issues).toHaveLength(1)
      expect(issues[0]!.message).toMatch(/Expected ID/)
    })
  })

  // -----------------------------------------------------------------------
  // Array
  // -----------------------------------------------------------------------
  describe('array', () => {
    it('validates array of correct element type', () => {
      expect(validateConvex(v.array(v.string()), ['a', 'b', 'c'])).toEqual([])
    })

    it('validates empty array', () => {
      expect(validateConvex(v.array(v.string()), [])).toEqual([])
    })

    it('rejects non-array', () => {
      const issues = validateConvex(v.array(v.string()), 'not array')
      expect(issues).toHaveLength(1)
      expect(issues[0]!.message).toMatch(/Expected array/)
    })

    it('rejects array with wrong element type', () => {
      const issues = validateConvex(v.array(v.string()), ['a', 42, 'c'])
      expect(issues).toHaveLength(1)
      expect(issues[0]!.message).toMatch(/Expected string/)
    })

    it('includes index in path on element failure', () => {
      const issues = validateConvex(v.array(v.string()), ['ok', 123])
      expect(issues).toHaveLength(1)
      expect(issues[0]!.path).toEqual([1])
    })

    it('collects multiple element errors', () => {
      const issues = validateConvex(v.array(v.string()), [42, true, null])
      expect(issues).toHaveLength(3)
      expect(issues[0]!.path).toEqual([0])
      expect(issues[1]!.path).toEqual([1])
      expect(issues[2]!.path).toEqual([2])
    })
  })

  // -----------------------------------------------------------------------
  // Object
  // -----------------------------------------------------------------------
  describe('object', () => {
    const userValidator = v.object({
      name: v.string(),
      age: v.float64(),
      email: v.string(),
    })

    it('validates matching object', () => {
      expect(validateConvex(userValidator, { name: 'Alice', age: 30, email: 'a@b.com' })).toEqual([])
    })

    it('rejects missing required fields', () => {
      const issues = validateConvex(userValidator, { name: 'Alice' })
      expect(issues).toHaveLength(2)
      expect(issues.map(i => i.path)).toEqual([['age'], ['email']])
    })

    it('accepts missing optional fields', () => {
      const schema = v.object({
        name: v.string(),
        nickname: v.optional(v.string()),
      })
      expect(validateConvex(schema, { name: 'Alice' })).toEqual([])
    })

    it('rejects extra unknown fields', () => {
      const issues = validateConvex(userValidator, {
        name: 'Alice',
        age: 30,
        email: 'a@b.com',
        extra: true,
      })
      expect(issues).toHaveLength(1)
      expect(issues[0]!.message).toMatch(/Unexpected field "extra"/)
      expect(issues[0]!.path).toEqual(['extra'])
    })

    it('includes field name in path on failure', () => {
      const issues = validateConvex(userValidator, { name: 42, age: 'old', email: true })
      expect(issues).toHaveLength(3)
      expect(issues[0]!.path).toEqual(['name'])
      expect(issues[1]!.path).toEqual(['age'])
      expect(issues[2]!.path).toEqual(['email'])
    })

    it('handles nested objects with compound paths', () => {
      const schema = v.object({
        customer: v.object({
          name: v.string(),
          email: v.string(),
        }),
      })
      const issues = validateConvex(schema, { customer: { name: 42, email: true } })
      expect(issues).toHaveLength(2)
      expect(issues[0]!.path).toEqual(['customer', 'name'])
      expect(issues[1]!.path).toEqual(['customer', 'email'])
    })

    it('rejects non-object value', () => {
      const issues = validateConvex(userValidator, 'not an object')
      expect(issues).toHaveLength(1)
      expect(issues[0]!.message).toMatch(/Expected object/)
    })

    it('rejects null for object', () => {
      const issues = validateConvex(userValidator, null)
      expect(issues).toHaveLength(1)
      expect(issues[0]!.message).toMatch(/Expected object/)
    })
  })

  // -----------------------------------------------------------------------
  // Multi-error collection (critical differentiator from convex-helpers)
  // -----------------------------------------------------------------------
  describe('multi-error collection', () => {
    it('collects all errors from object with 3 missing required fields', () => {
      const schema = v.object({
        name: v.string(),
        email: v.string(),
        company: v.string(),
      })
      const issues = validateConvex(schema, {})
      expect(issues).toHaveLength(3)
      expect(issues.map(i => i.path)).toEqual([['name'], ['email'], ['company']])
    })

    it('collects errors at multiple nesting levels', () => {
      const schema = v.object({
        customer: v.object({
          name: v.string(),
          email: v.string(),
        }),
        shipping: v.object({
          street: v.string(),
          city: v.string(),
        }),
      })
      const issues = validateConvex(schema, {
        customer: { name: 42, email: true },
        shipping: { street: 123 },
      })
      // customer.name, customer.email, shipping.street (wrong type), shipping.city (missing)
      expect(issues).toHaveLength(4)
      expect(issues[0]!.path).toEqual(['customer', 'name'])
      expect(issues[1]!.path).toEqual(['customer', 'email'])
      expect(issues[2]!.path).toEqual(['shipping', 'street'])
      expect(issues[3]!.path).toEqual(['shipping', 'city'])
    })

    it('collects errors from array with multiple bad elements', () => {
      const schema = v.array(v.object({
        productId: v.id('products'),
        quantity: v.float64(),
      }))
      const issues = validateConvex(schema, [
        { productId: 'p1', quantity: 'bad' },
        { productId: 42, quantity: 5 },
      ])
      expect(issues).toHaveLength(2)
      expect(issues[0]!.path).toEqual([0, 'quantity'])
      expect(issues[1]!.path).toEqual([1, 'productId'])
    })

    it('reports only invalid fields when some are valid', () => {
      const schema = v.object({
        name: v.string(),
        age: v.float64(),
        email: v.string(),
        active: v.boolean(),
      })
      const issues = validateConvex(schema, {
        name: 'Alice',       // valid
        age: 'thirty',       // invalid
        email: 'a@b.com',    // valid
        active: 'yes',       // invalid
      })
      expect(issues).toHaveLength(2)
      expect(issues[0]!.path).toEqual(['age'])
      expect(issues[1]!.path).toEqual(['active'])
    })
  })

  // -----------------------------------------------------------------------
  // Record
  // -----------------------------------------------------------------------
  describe('record', () => {
    it('validates matching record', () => {
      const schema = v.record(v.string(), v.float64())
      expect(validateConvex(schema, { a: 1, b: 2 })).toEqual([])
    })

    it('rejects invalid value types', () => {
      const schema = v.record(v.string(), v.float64())
      const issues = validateConvex(schema, { a: 1, b: 'not a number' })
      expect(issues).toHaveLength(1)
      expect(issues[0]!.path).toEqual(['b'])
    })

    it('rejects non-object', () => {
      const schema = v.record(v.string(), v.string())
      const issues = validateConvex(schema, 'nope')
      expect(issues).toHaveLength(1)
      expect(issues[0]!.message).toMatch(/Expected object/)
    })
  })

  // -----------------------------------------------------------------------
  // Union
  // -----------------------------------------------------------------------
  describe('union', () => {
    it('accepts value matching any member', () => {
      const schema = v.union(v.string(), v.float64())
      expect(validateConvex(schema, 'hello')).toEqual([])
      expect(validateConvex(schema, 42)).toEqual([])
    })

    it('rejects value matching no member', () => {
      const schema = v.union(v.string(), v.float64())
      const issues = validateConvex(schema, true)
      expect(issues).toHaveLength(1)
      expect(issues[0]!.message).toMatch(/Expected one of/)
    })

    it('accepts discriminated union member', () => {
      const schema = v.union(
        v.object({ type: v.literal('text'), content: v.string() }),
        v.object({ type: v.literal('image'), url: v.string() }),
      )
      expect(validateConvex(schema, { type: 'text', content: 'hello' })).toEqual([])
      expect(validateConvex(schema, { type: 'image', url: 'http://...' })).toEqual([])
    })
  })

  // -----------------------------------------------------------------------
  // Optional handling
  // -----------------------------------------------------------------------
  describe('optional', () => {
    it('accepts undefined for optional validator', () => {
      expect(validateConvex(v.optional(v.string()), undefined)).toEqual([])
    })

    it('rejects undefined for required validator', () => {
      const issues = validateConvex(v.string(), undefined)
      expect(issues).toHaveLength(1)
      expect(issues[0]!.message).toBe('Required')
    })

    it('validates the inner type when present', () => {
      const issues = validateConvex(v.optional(v.string()), 42)
      expect(issues).toHaveLength(1)
      expect(issues[0]!.message).toMatch(/Expected string/)
    })
  })
})

describe('toConvexSchema', () => {
  it('returns ~standard.version === 1', () => {
    const schema = toConvexSchema(v.string())
    expect(schema['~standard'].version).toBe(1)
  })

  it('returns ~standard.vendor === "better-convex-nuxt"', () => {
    const schema = toConvexSchema(v.string())
    expect(schema['~standard'].vendor).toBe('better-convex-nuxt')
  })

  it('returns SuccessResult with value on valid input', () => {
    const schema = toConvexSchema(v.string())
    const result = schema['~standard'].validate('hello')
    expect(result).toEqual({ value: 'hello' })
  })

  it('returns FailureResult with issues array on invalid input', () => {
    const schema = toConvexSchema(v.string())
    const result = schema['~standard'].validate(42)
    expect('issues' in result).toBe(true)
    const failure = result as unknown as { issues: Array<{ message: string }> }
    expect(failure.issues).toHaveLength(1)
    expect(failure.issues[0]!.message).toMatch(/Expected string/)
  })

  it('returns multiple issues for object with multiple errors', () => {
    const schema = toConvexSchema(v.object({ a: v.string(), b: v.string() }))
    const result = schema['~standard'].validate({ a: 1, b: 2 })
    expect('issues' in result).toBe(true)
    const failure = result as unknown as { issues: Array<{ message: string; path: PropertyKey[] }> }
    expect(failure.issues).toHaveLength(2)
    expect(failure.issues[0]!.path).toEqual(['a'])
    expect(failure.issues[1]!.path).toEqual(['b'])
  })

  it('issues have path as PropertyKey array', () => {
    const schema = toConvexSchema(v.object({ name: v.string() }))
    const result = schema['~standard'].validate({ name: 42 })
    const failure = result as unknown as { issues: Array<{ path: PropertyKey[] }> }
    expect(failure.issues[0]!.path).toEqual(['name'])
  })
})
