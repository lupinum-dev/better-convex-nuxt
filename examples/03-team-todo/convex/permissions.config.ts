/**
 * Why this file exists:
 * This is the central permission definition used by both backend builders and frontend permission checks.
 * Keeping it here gives literal autocomplete for `require: 'todo.create'` and `can('todo.delete', todo)`.
 */
import {
  definePermissions,
  type InferPermission,
  type InferRole,
  type PermissionContext,
  type Resource,
} from 'better-convex-nuxt/convex'

export const ROLES = ['owner', 'admin', 'member', 'viewer'] as const

export const permissions = {
  todo: {
    create: { roles: ['owner', 'admin', 'member'] },
    read: { roles: ['owner', 'admin', 'member', 'viewer'] },
    update: { own: ['member'], any: ['owner', 'admin'] },
    delete: { own: ['member'], any: ['owner', 'admin'] },
  },
} as const

type PermissionShape = {
  roles: typeof ROLES
  permissions: typeof permissions
}

export type Role = InferRole<PermissionShape>
export type Permission = InferPermission<PermissionShape>
type PermissionRule =
  | { roles: readonly Role[] }
  | { own: readonly Role[], any: readonly Role[] }

export function checkPermission(
  ctx: PermissionContext<Role> | null,
  permission: Permission,
  resource?: Resource,
): boolean {
  if (!ctx) return false

  const separatorIndex = permission.lastIndexOf('.')
  if (separatorIndex <= 0 || separatorIndex === permission.length - 1) return false

  const resourceType = permission.slice(0, separatorIndex)
  const action = permission.slice(separatorIndex + 1)
  const resourceRules = permissions[resourceType as keyof typeof permissions]
  const rule = resourceRules
    ? (resourceRules as Record<string, PermissionRule>)[action]
    : undefined

  if (!rule) return false

  if ('roles' in rule) {
    return (rule.roles as readonly string[]).includes(ctx.role)
  }

  if ('any' in rule && (rule.any as readonly string[]).includes(ctx.role)) {
    return true
  }

  if ('own' in rule && (rule.own as readonly string[]).includes(ctx.role)) {
    return resource?.ownerId === ctx.userId
  }

  return false
}

export const permissionConfig = definePermissions({
  roles: ROLES,
  permissions,
  checkPermission,
})
