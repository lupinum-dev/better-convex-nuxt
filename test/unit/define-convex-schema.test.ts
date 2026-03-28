import { describe, expect, it } from 'vitest'
import { v } from 'convex/values'
import { z } from 'zod'

import { defineConvexSchema } from '../../src/runtime/utils/define-convex-schema'

describe('defineConvexSchema', () => {
  const schema = defineConvexSchema({
    title: v.string(),
    body: v.string(),
    priority: v.optional(v.union(v.literal('low'), v.literal('medium'), v.literal('high'))),
  }, {
    description: 'Create a new task',
    fields: {
      title: { label: 'Title', description: 'The task title' },
      body: { label: 'Body', description: 'Task description' },
      priority: { label: 'Priority', description: 'Priority level' },
    },
  })

  // -----------------------------------------------------------------------
  // .args
  // -----------------------------------------------------------------------
  describe('.args', () => {
    it('returns the raw validators object', () => {
      expect(schema.args.title).toBeDefined()
      expect(schema.args.body).toBeDefined()
      expect(schema.args.priority).toBeDefined()
      expect((schema.args.title as any).kind).toBe('string')
    })

    it('can be spread into a mutation definition', () => {
      // Simulates: mutation({ args: schema.args, handler: ... })
      const args = { ...schema.args }
      expect(Object.keys(args)).toEqual(['title', 'body', 'priority'])
    })
  })

  // -----------------------------------------------------------------------
  // Standard Schema (~standard)
  // -----------------------------------------------------------------------
  describe('Standard Schema', () => {
    it('has ~standard property (is a StandardSchemaV1)', () => {
      expect(schema['~standard']).toBeDefined()
      expect(schema['~standard'].version).toBe(1)
      expect(schema['~standard'].vendor).toBe('better-convex-nuxt')
    })

    it('.standard is also a StandardSchemaV1', () => {
      expect(schema.standard['~standard'].version).toBe(1)
    })

    it('passes isStandardSchema detection', () => {
      // This is how resolve-validator.ts detects Standard Schema objects
      expect('~standard' in schema).toBe(true)
    })

    it('validates successfully for correct data', () => {
      const result = schema['~standard'].validate({ title: 'Hello', body: 'World' })
      expect('value' in (result as any)).toBe(true)
    })

    it('returns multi-error issues on invalid data', () => {
      const result = schema['~standard'].validate({}) as { issues: Array<{ message: string; path: PropertyKey[] }> }
      expect(result.issues.length).toBeGreaterThanOrEqual(2)
      expect(result.issues[0]!.path).toEqual(['title'])
      expect(result.issues[1]!.path).toEqual(['body'])
    })

    it('accepts optional fields as undefined', () => {
      const result = schema['~standard'].validate({ title: 'Hi', body: 'World' })
      expect('value' in (result as any)).toBe(true)
    })
  })

  // -----------------------------------------------------------------------
  // .validate (H3-compatible)
  // -----------------------------------------------------------------------
  describe('.validate', () => {
    it('returns typed data on success', () => {
      const data = schema.validate({ title: 'Hello', body: 'World', priority: 'high' })
      expect(data).toEqual({ title: 'Hello', body: 'World', priority: 'high' })
    })

    it('throws with statusCode 422 on failure', () => {
      try {
        schema.validate({ title: 42 })
        expect.fail('Should have thrown')
      } catch (err: any) {
        expect(err.statusCode).toBe(422)
        expect(err.message).toBe('Validation Error')
      }
    })

    it('includes all issues in error data (multi-error)', () => {
      try {
        schema.validate({})
        expect.fail('Should have thrown')
      } catch (err: any) {
        expect(err.data.issues.length).toBeGreaterThanOrEqual(2)
      }
    })
  })

  // -----------------------------------------------------------------------
  // .meta
  // -----------------------------------------------------------------------
  describe('.meta', () => {
    it('carries metadata when provided', () => {
      expect(schema.meta).toBeDefined()
      expect(schema.meta!.description).toBe('Create a new task')
      expect(schema.meta!.fields!.title!.label).toBe('Title')
      expect(schema.meta!.fields!.title!.description).toBe('The task title')
    })

    it('is undefined when no options provided', () => {
      const bare = defineConvexSchema({ name: v.string() })
      expect(bare.meta).toBeUndefined()
    })
  })

  // -----------------------------------------------------------------------
  // .toMcpInput (Zod conversion)
  // -----------------------------------------------------------------------
  describe('.toMcpInput', () => {
    it('returns a Zod schema shape', () => {
      const shape = schema.toMcpInput(z)
      // Should be an object with Zod schemas as values
      expect(shape.title).toBeDefined()
      expect(shape.body).toBeDefined()
      expect(shape.priority).toBeDefined()
    })

    it('generated Zod fields have correct types', () => {
      const shape = schema.toMcpInput(z)
      // Zod schemas have _def.type
      expect((shape.title as any)._def.type).toBe('string')
    })

    it('applies descriptions from metadata', () => {
      const shape = schema.toMcpInput(z)
      expect((shape.title as any).description).toBe('The task title')
      expect((shape.body as any).description).toBe('Task description')
    })

    it('handles optional fields', () => {
      const shape = schema.toMcpInput(z)
      // Optional fields should be wrapped in ZodOptional
      expect((shape.priority as any)._def.type).toBe('optional')
    })
  })

  // -----------------------------------------------------------------------
  // Zod conversion of various Convex kinds
  // -----------------------------------------------------------------------
  describe('toMcpInput — kind mapping', () => {
    it('converts float64 to z.number()', () => {
      const s = defineConvexSchema({ age: v.float64() })
      const shape = s.toMcpInput(z)
      expect((shape.age as any)._def.type).toBe('number')
    })

    it('converts boolean to z.boolean()', () => {
      const s = defineConvexSchema({ active: v.boolean() })
      const shape = s.toMcpInput(z)
      expect((shape.active as any)._def.type).toBe('boolean')
    })

    it('converts literal to z.literal()', () => {
      const s = defineConvexSchema({ role: v.literal('admin') })
      const shape = s.toMcpInput(z)
      expect((shape.role as any)._def.type).toBe('literal')
      expect((shape.role as any)._def.values).toContain('admin')
    })

    it('converts array to z.array()', () => {
      const s = defineConvexSchema({ tags: v.array(v.string()) })
      const shape = s.toMcpInput(z)
      expect((shape.tags as any)._def.type).toBe('array')
    })

    it('converts nested object', () => {
      const s = defineConvexSchema({
        address: v.object({ street: v.string(), city: v.string() }),
      })
      const shape = s.toMcpInput(z)
      expect((shape.address as any)._def.type).toBe('object')
    })

    it('converts id to z.string()', () => {
      const s = defineConvexSchema({ userId: v.id('users') })
      const shape = s.toMcpInput(z)
      expect((shape.userId as any)._def.type).toBe('string')
    })

    it('converts union to z.union()', () => {
      const s = defineConvexSchema({
        status: v.union(v.literal('active'), v.literal('archived')),
      })
      const shape = s.toMcpInput(z)
      expect((shape.status as any)._def.type).toBe('union')
    })
  })
})
