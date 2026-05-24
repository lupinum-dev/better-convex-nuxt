import type { ConvexAuthChangedPayload, AuthSessionUser } from '../../utils/types.js'

export interface AuthSnapshot {
  isAuthenticated: boolean
  user: AuthSessionUser | null
  tokenFingerprint: string | null
}

export function buildAuthSnapshot(
  token: string | null,
  user: AuthSessionUser | null,
): AuthSnapshot {
  const isAuthenticated = Boolean(token && user)

  return {
    isAuthenticated,
    user: isAuthenticated ? user : null,
    tokenFingerprint: isAuthenticated ? token : null,
  }
}

export function hasAuthSnapshotChanged(
  previousSnapshot: AuthSnapshot,
  nextSnapshot: AuthSnapshot,
): boolean {
  return (
    previousSnapshot.isAuthenticated !== nextSnapshot.isAuthenticated ||
    previousSnapshot.tokenFingerprint !== nextSnapshot.tokenFingerprint
  )
}

export function createAuthChangedPayload(
  previousSnapshot: AuthSnapshot,
  nextSnapshot: AuthSnapshot,
): ConvexAuthChangedPayload {
  return {
    isAuthenticated: nextSnapshot.isAuthenticated,
    previousIsAuthenticated: previousSnapshot.isAuthenticated,
    sessionUser: nextSnapshot.user,
    previousSessionUser: previousSnapshot.user,
  }
}

export function isCurrentAuthOperation(
  expectedOperationId: number,
  currentOperationId: number,
): boolean {
  return expectedOperationId === currentOperationId
}
