import { beforeEach, describe, expect, it, vi } from 'vitest'
import { v } from 'convex/values'

import * as convexSchema from '../../src/runtime/utils/convex-schema'
import { validateConvexArgs } from '../../src/runtime/server/utils/validate'
import { expectValidationError } from '../helpers/validation-error'

describe('validateConvexArgs', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('returns validated data on success', async () => {
    const validate = validateConvexArgs(v.object({ name: v.string() }))
    const result = await validate({ name: 'Alice' })
    expect(result).toEqual({ name: 'Alice' })
  })

  it('throws H3 error with 422 on validation failure', async () => {
    const validate = validateConvexArgs(v.string())
    try {
      await validate(42)
      expect.fail('Should have thrown')
    } catch (err: unknown) {
      const validationError = expectValidationError(err)
      expect(validationError.statusCode).toBe(422)
      expect(validationError.statusMessage).toBe('Validation Error')
    }
  })

  it('includes issues array in error data', async () => {
    const validate = validateConvexArgs(v.object({
      name: v.string(),
      email: v.string(),
    }))
    try {
      await validate({ name: 42, email: true })
      expect.fail('Should have thrown')
    } catch (err: unknown) {
      const validationError = expectValidationError(err)
      expect(validationError.data?.issues).toHaveLength(2)
      expect(validationError.data?.issues[0]?.path).toEqual(['name'])
      expect(validationError.data?.issues[1]?.path).toEqual(['email'])
    }
  })

  it('returns typed value matching the validator', async () => {
    const validate = validateConvexArgs(v.object({
      count: v.float64(),
      active: v.boolean(),
    }))
    const result = await validate({ count: 5, active: true })
    expect(result.count).toBe(5)
    expect(result.active).toBe(true)
  })

  it('collects multiple validation issues (multi-error)', async () => {
    const validate = validateConvexArgs(v.object({
      a: v.string(),
      b: v.string(),
      c: v.string(),
    }))
    try {
      await validate({})
      expect.fail('Should have thrown')
    } catch (err: unknown) {
      const validationError = expectValidationError(err)
      expect(validationError.data?.issues).toHaveLength(3)
    }
  })

  it('awaits async Standard Schema success results', async () => {
    const validateMock = vi.fn(async (value: unknown) => ({ value }))
    vi.spyOn(convexSchema, 'toConvexSchema').mockReturnValue({
      '~standard': {
        version: 1,
        vendor: 'test',
        validate: validateMock,
      },
    })

    const validate = validateConvexArgs(v.string())
    await expect(validate('Alice')).resolves.toBe('Alice')
    expect(validateMock).toHaveBeenCalledWith('Alice')
  })

  it('awaits async Standard Schema failures instead of accepting the Promise object', async () => {
    const issues = [{ message: 'Expected string', path: ['name'] as PropertyKey[] }]
    vi.spyOn(convexSchema, 'toConvexSchema').mockReturnValue({
      '~standard': {
        version: 1,
        vendor: 'test',
        validate: vi.fn(async () => ({ issues })),
      },
    })

    const validate = validateConvexArgs(v.string())

    try {
      await validate({ name: 42 })
      expect.fail('Should have thrown')
    } catch (err: unknown) {
      const validationError = expectValidationError(err)
      expect(validationError.statusMessage).toBe('Validation Error')
      expect(validationError.data?.issues).toEqual(issues)
    }
  })
})
