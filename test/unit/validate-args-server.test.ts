import { describe, expect, it } from 'vitest'
import { v } from 'convex/values'

import { validateConvexArgs } from '../../src/runtime/server/utils/validate'

describe('validateConvexArgs', () => {
  it('returns validated data on success', () => {
    const validate = validateConvexArgs(v.object({ name: v.string() }))
    const result = validate({ name: 'Alice' })
    expect(result).toEqual({ name: 'Alice' })
  })

  it('throws H3 error with 422 on validation failure', () => {
    const validate = validateConvexArgs(v.string())
    try {
      validate(42)
      expect.fail('Should have thrown')
    } catch (err: any) {
      expect(err.statusCode).toBe(422)
      expect(err.statusMessage).toBe('Validation Error')
    }
  })

  it('includes issues array in error data', () => {
    const validate = validateConvexArgs(v.object({
      name: v.string(),
      email: v.string(),
    }))
    try {
      validate({ name: 42, email: true })
      expect.fail('Should have thrown')
    } catch (err: any) {
      expect(err.data.issues).toHaveLength(2)
      expect(err.data.issues[0].path).toEqual(['name'])
      expect(err.data.issues[1].path).toEqual(['email'])
    }
  })

  it('returns typed value matching the validator', () => {
    const validate = validateConvexArgs(v.object({
      count: v.float64(),
      active: v.boolean(),
    }))
    const result = validate({ count: 5, active: true })
    expect(result.count).toBe(5)
    expect(result.active).toBe(true)
  })

  it('collects multiple validation issues (multi-error)', () => {
    const validate = validateConvexArgs(v.object({
      a: v.string(),
      b: v.string(),
      c: v.string(),
    }))
    try {
      validate({})
      expect.fail('Should have thrown')
    } catch (err: any) {
      expect(err.data.issues).toHaveLength(3)
    }
  })
})
