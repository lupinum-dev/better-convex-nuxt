/**
 * Permission Configuration
 *
 * Shared checkPermission() used by both frontend (the app-owned
 * usePermissions() composable) and backend (authorize). This playground does
 * not enable the Better Auth Organization plugin, so the demo uses a minimal
 * "signed-in + ownership" model instead of org roles:
 *
 *   - any signed-in user can create/read posts
 *   - only the owner can update/delete/publish
 *
 * For the full role/org model, roles and membership must come from Better
 * Auth — never from an app-owned table. See the permissions docs.
 */

// ============================================
// PERMISSIONS CONFIG
// ============================================
// signedIn: any authenticated user may perform the action.
// own:      only the resource owner may perform the action.

export const permissions = {
  post: {
    create: { signedIn: true },
    read: { signedIn: true },
    update: { own: true },
    delete: { own: true },
    publish: { own: true },
  },
} as const

// ============================================
// TYPES (auto-generated from config)
// ============================================

type PostPermission = `post.${keyof (typeof permissions)['post']}`

export type Permission = PostPermission

// ============================================
// PERMISSION CONTEXT
// ============================================
// The minimal context returned by the permission-context query. `role` is a
// static placeholder ('member' for every signed-in user) — this playground
// has no org plugin, so there is no real role. In a real app, read role from
// Better Auth (see the permissions docs), never from an app-owned table.

export interface PermissionContext {
  role: string
  userId: string // authId from the auth provider
}

// ============================================
// RESOURCE INTERFACE
// ============================================

export interface Resource {
  ownerId?: string
}

// ============================================
// CHECK PERMISSION
// ============================================

type PermissionRule = { signedIn: true } | { own: true }

export function checkPermission(
  ctx: PermissionContext | null,
  permission: Permission,
  resource?: Resource,
): boolean {
  // No context = not signed in = no permission
  if (!ctx) return false

  const separatorIndex = permission.lastIndexOf('.')
  if (separatorIndex <= 0 || separatorIndex === permission.length - 1) return false
  const resourceType = permission.slice(0, separatorIndex)
  const action = permission.slice(separatorIndex + 1)

  const resourcePerms = permissions[resourceType as keyof typeof permissions]
  if (!resourcePerms) return false

  const rule = (resourcePerms as Record<string, PermissionRule>)[action]
  if (!rule) return false

  // Any signed-in user may perform this action.
  if ('signedIn' in rule) return true

  // Ownership: only the owner may perform this action.
  if (!resource?.ownerId) return false
  return resource.ownerId === ctx.userId
}
