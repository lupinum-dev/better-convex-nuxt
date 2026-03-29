import type { Actor } from '../../../src/runtime/actor'

import { checkPermission, type Permission, type Resource, type Role } from '../permissions.config'

export function assertPermission(
  actor: Actor,
  permission: Permission,
  resource?: Resource,
): void {
  const allowed = checkPermission(
    {
      role: actor.role as Role,
      userId: actor.userId,
    },
    permission,
    resource,
  )

  if (!allowed) {
    throw new Error(`Forbidden: ${permission}`)
  }
}
