export type ScopingErrorCode =
  | 'CROSS_ORG_ACCESS'
  | 'MISSING_ORG_INDEX'
  | 'ORG_FIELD_CONFLICT'
  | 'RESOURCE_NOT_FOUND'

export class ScopingError extends Error {
  readonly code: ScopingErrorCode

  constructor(
    message: string,
    code: ScopingErrorCode,
    options?: { cause?: unknown },
  ) {
    super(message)
    this.name = 'ScopingError'
    this.code = code

    if (options?.cause !== undefined) {
      ;(this as Error & { cause?: unknown }).cause = options.cause
    }
  }
}
