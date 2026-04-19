import type { ConvexAuthChangedPayload, ConvexUser } from '../../utils/types.js'

export interface AuthSnapshot {
  isAuthenticated: boolean
  user: ConvexUser | null
  userId: string | null
}

export function buildAuthSnapshot(token: string | null, user: ConvexUser | null): AuthSnapshot {
  const isAuthenticated = Boolean(token && user)

  return {
    isAuthenticated,
    user: isAuthenticated ? user : null,
    userId: isAuthenticated ? user!.id : null,
  }
}

export function hasAuthSnapshotChanged(
  previousSnapshot: AuthSnapshot,
  nextSnapshot: AuthSnapshot,
): boolean {
  return (
    previousSnapshot.isAuthenticated !== nextSnapshot.isAuthenticated ||
    previousSnapshot.userId !== nextSnapshot.userId
  )
}

export function createAuthChangedPayload(
  previousSnapshot: AuthSnapshot,
  nextSnapshot: AuthSnapshot,
): ConvexAuthChangedPayload {
  return {
    isAuthenticated: nextSnapshot.isAuthenticated,
    previousIsAuthenticated: previousSnapshot.isAuthenticated,
    user: nextSnapshot.user,
    previousUser: previousSnapshot.user,
  }
}

export function isCurrentAuthOperation(
  expectedOperationId: number,
  currentOperationId: number,
): boolean {
  return expectedOperationId === currentOperationId
}
