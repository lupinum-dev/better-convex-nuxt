export function isConvexUnauthorizedError(error: unknown): boolean {
  if (error && typeof error === 'object') {
    const record = error as { status?: unknown; code?: unknown; data?: unknown; message?: unknown }
    const status = typeof record.status === 'number' ? record.status : undefined
    if (status === 401 || status === 403) {
      return true
    }

    const code = typeof record.code === 'string' ? record.code.toUpperCase() : ''
    if (code.includes('UNAUTH') || code === 'FORBIDDEN') {
      return true
    }

    if (record.data && typeof record.data === 'object') {
      const data = record.data as { status?: unknown; code?: unknown }
      const dataStatus = typeof data.status === 'number' ? data.status : undefined
      if (dataStatus === 401 || dataStatus === 403) {
        return true
      }
      const dataCode = typeof data.code === 'string' ? data.code.toUpperCase() : ''
      if (dataCode.includes('UNAUTH') || dataCode === 'FORBIDDEN') {
        return true
      }
    }

    if (typeof record.message === 'string') {
      const message = record.message.toLowerCase()
      return (
        message.includes('unauthorized') ||
        message.includes('not authenticated') ||
        message.includes('authentication')
      )
    }
  }

  if (error instanceof Error) {
    const message = error.message.toLowerCase()
    return (
      message.includes('unauthorized') ||
      message.includes('not authenticated') ||
      message.includes('authentication')
    )
  }

  if (typeof error === 'string') {
    const message = error.toLowerCase()
    return (
      message.includes('unauthorized') ||
      message.includes('not authenticated') ||
      message.includes('authentication')
    )
  }

  return false
}
