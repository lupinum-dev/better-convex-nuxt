// ============================================================================
// Tenant Error Codes
// ============================================================================

export type TenantErrorCode =
  | 'UNAUTHENTICATED'
  | 'NO_ORGANIZATION'
  | 'CROSS_ORG_ACCESS'
  | 'MISSING_ORG_INDEX'
  | 'TABLE_NOT_SCOPED'
  | 'ORG_FIELD_CONFLICT'
  | 'PERMISSION_DENIED'
  | 'RESOURCE_NOT_FOUND'

// ============================================================================
// TenantError
// ============================================================================

export class TenantError extends Error {
  readonly isTenantError = true as const
  readonly code: TenantErrorCode

  constructor(message: string, code: TenantErrorCode, options?: { cause?: unknown }) {
    super(message, options)
    this.name = 'TenantError'
    this.code = code
  }
}
