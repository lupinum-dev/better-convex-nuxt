import { describe, expect, it } from 'vitest'

import { ConvexCallError, ConvexError, toConvexError } from '../../src/runtime/utils/call-result'

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

  it('keeps ConvexError as a deprecated alias of ConvexCallError', () => {
    const error = new ConvexError('Alias still works')

    expect(error).toBeInstanceOf(ConvexCallError)
    expect(error.name).toBe('ConvexCallError')
  })
})
