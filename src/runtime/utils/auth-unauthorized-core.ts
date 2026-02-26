export function isConvexUnauthorizedError(error: unknown): boolean {
  if (error instanceof Error) {
    const message = error.message.toLowerCase()
    return (
      message.includes('unauthorized')
      || message.includes('not authenticated')
      || message.includes('authentication')
    )
  }

  if (typeof error === 'string') {
    const message = error.toLowerCase()
    return (
      message.includes('unauthorized')
      || message.includes('not authenticated')
      || message.includes('authentication')
    )
  }

  return false
}

