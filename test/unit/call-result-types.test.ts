import { describe, expect, it } from 'vitest'

import { ConvexCallError, toConvexError } from '../../src/runtime/utils/call-result'

describe('Convex call error contracts', () => {
  it('normalizes structured errors into ConvexCallError', () => {
    const error = toConvexError({
      data: {
        message: 'Structured failure',
        code: 'STRUCTURED',
        status: 422,
      },
    })

    expect(error).toBeInstanceOf(ConvexCallError)
    expect(error.message).toBe('Structured failure')
    expect(error.code).toBe('STRUCTURED')
    expect(error.status).toBe(422)
  })

  it('has the isConvexCallError brand property', () => {
    const error = new ConvexCallError('Brand check')
    expect(error.isConvexCallError).toBe(true)
    expect(error.name).toBe('ConvexCallError')
  })
})
