import { expect } from 'vitest'

export interface ValidationIssueLike {
  path?: PropertyKey[]
  message?: string
}

export interface ValidationErrorLike {
  statusCode?: number
  statusMessage?: string
  message?: string
  data?: {
    issues: ValidationIssueLike[]
  }
}

export function expectValidationError(error: unknown): ValidationErrorLike {
  expect(error).toEqual(expect.objectContaining({ statusCode: 422 }))
  return error as ValidationErrorLike
}
