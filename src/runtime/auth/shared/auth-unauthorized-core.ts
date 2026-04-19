export function isConvexUnauthorizedError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false

  const record = error as { status?: unknown; code?: unknown; data?: unknown }

  const status = typeof record.status === 'number' ? record.status : undefined
  if (status === 401 || status === 403) return true

  const code = typeof record.code === 'string' ? record.code.toUpperCase() : ''
  if (code.includes('UNAUTH') || code === 'FORBIDDEN') return true

  if (record.data && typeof record.data === 'object') {
    const data = record.data as { status?: unknown; code?: unknown }
    const dataStatus = typeof data.status === 'number' ? data.status : undefined
    if (dataStatus === 401 || dataStatus === 403) return true
    const dataCode = typeof data.code === 'string' ? data.code.toUpperCase() : ''
    if (dataCode.includes('UNAUTH') || dataCode === 'FORBIDDEN') return true
  }

  return false
}
