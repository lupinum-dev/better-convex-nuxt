import { describe, expect, it } from 'vitest'
import { v } from 'convex/values'

import { defineConvexSchema } from '../../src/runtime/utils/define-convex-schema'
import { expectValidationError } from '../helpers/validation-error'

function getValidatorKind(value: unknown): string | undefined {
  return (value as { kind?: string }).kind
}

function hasValue<T>(value: unknown): value is { value: T } {
  return typeof value === 'object' && value !== null && 'value' in value
}

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
      expect(getValidatorKind(schema.args.title)).toBe('string')
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
      expect(hasValue(result)).toBe(true)
    })

    it('returns multi-error issues on invalid data', () => {
      const result = schema['~standard'].validate({}) as { issues: Array<{ message: string; path: PropertyKey[] }> }
      expect(result.issues.length).toBeGreaterThanOrEqual(2)
      expect(result.issues[0]!.path).toEqual(['title'])
      expect(result.issues[1]!.path).toEqual(['body'])
    })

    it('accepts optional fields as undefined', () => {
      const result = schema['~standard'].validate({ title: 'Hi', body: 'World' })
      expect(hasValue(result)).toBe(true)
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
      } catch (err: unknown) {
        const validationError = expectValidationError(err)
        expect(validationError.statusCode).toBe(422)
        expect(validationError.message).toBe('Validation Error')
      }
    })

    it('includes all issues in error data (multi-error)', () => {
      try {
        schema.validate({})
        expect.fail('Should have thrown')
      } catch (err: unknown) {
        const validationError = expectValidationError(err)
        expect(validationError.data?.issues.length).toBeGreaterThanOrEqual(2)
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

})
