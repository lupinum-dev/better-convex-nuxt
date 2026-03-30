/**
 * Why this file exists:
 * This is the central permission definition used by both backend builders and frontend permission checks.
 * Keeping it here gives literal autocomplete for `require: 'todo.create'` and `can('todo.delete', todo)`.
 */
import {
  definePermissions,
  type InferPermission,
  type InferRole,
} from 'better-convex-nuxt/convex'

export const ROLES = ['owner', 'admin', 'member', 'viewer'] as const

export const rules = {
  todo: {
    create: { roles: ['owner', 'admin', 'member'] },
    read: { roles: ['owner', 'admin', 'member', 'viewer'] },
    update: { own: ['member'], any: ['owner', 'admin'] },
    delete: { own: ['member'], any: ['owner', 'admin'] },
  },
} as const

export const permissionConfig = definePermissions({
  roles: ROLES,
  rules,
})

export type Role = InferRole<typeof permissionConfig>
export type Permission = InferPermission<typeof permissionConfig>
