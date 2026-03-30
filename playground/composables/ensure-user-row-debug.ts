export type EnsureUserDebugContext = {
  _debug?: { hasIdentity?: boolean, hasUser?: boolean, reason?: string }
} | null

export function shouldEnsureUserRow(ctx: EnsureUserDebugContext): boolean {
  const debugInfo = ctx?._debug
  return !!(
    debugInfo?.hasIdentity
    && !debugInfo?.hasUser
    && debugInfo?.reason === 'user not found in DB, needs to be created'
  )
}
