/**
 * Permission Configuration
 *
 * The heart of the permission system. Defines roles, permissions,
 * and the shared checkPermission() function used by both frontend and backend.
 */

// ============================================
// ROLES
// ============================================
// Ordered from most to least privileged

const ROLES = ['owner', 'admin', 'member', 'viewer'] as const
export type Role = (typeof ROLES)[number]

// ============================================
// PERMISSIONS CONFIG
// ============================================
// This is where you define WHO can do WHAT.
//
// Format for simple permissions:
//   action: { roles: ["role1", "role2"] }
//
// Format for ownership-based permissions:
//   action: { own: ["role1"], any: ["role2"] }
//   - "own" = can do to resources they created
//   - "any" = can do to any resource in their org

export const permissions = {
  // ------------------------------------------
  // Global permissions (not tied to a resource)
  // ------------------------------------------
  global: {
    'org.settings': { roles: ['owner'] },
    'org.billing': { roles: ['owner'] },
    'org.invite': { roles: ['owner', 'admin'] },
    'org.members': { roles: ['owner', 'admin'] },
  },

  // ------------------------------------------
  // Post permissions
  // ------------------------------------------
  post: {
    create: { roles: ['owner', 'admin', 'member'] },
    read: { roles: ['owner', 'admin', 'member', 'viewer'] },
    update: { own: ['member'], any: ['owner', 'admin'] },
    delete: { own: ['member'], any: ['owner', 'admin'] },
    publish: { roles: ['owner', 'admin'] },
  },

  // ------------------------------------------
  // Comment permissions
  // ------------------------------------------
  comment: {
    create: { roles: ['owner', 'admin', 'member', 'viewer'] },
    read: { roles: ['owner', 'admin', 'member', 'viewer'] },
    update: { own: ['viewer'], any: ['owner', 'admin'] },
    delete: { own: ['viewer'], any: ['owner', 'admin'] },
  },

  // ------------------------------------------
  // Add more resources here as needed...
  // ------------------------------------------
} as const

// ============================================
// TYPES (auto-generated from config)
// ============================================

type GlobalPermission = keyof (typeof permissions)['global']

type PostPermission = `post.${keyof (typeof permissions)['post']}`
type CommentPermission = `comment.${keyof (typeof permissions)['comment']}`

// Add new resource types here as you add them to config
export type Permission = GlobalPermission | PostPermission | CommentPermission

// ============================================
// PERMISSION CONTEXT
// ============================================
// This is what we need to check permissions.
// Fetched once and passed around.

export interface PermissionContext {
  role: Role
  userId: string // authId from auth provider
}

// ============================================
// RESOURCE INTERFACE
// ============================================
// Resources need these fields for ownership checks.

export interface Resource {
  ownerId?: string
}

// ============================================
// CHECK PERMISSION
// ============================================
// The core logic. Used by both frontend and backend.
//
// Usage:
//   checkPermission(ctx, "post.update", post)  // Resource permission
//   checkPermission(ctx, "org.invite")         // Global permission

type PermissionRule = { roles: readonly Role[] } | { own: readonly Role[]; any: readonly Role[] }

export function checkPermission(
  ctx: PermissionContext | null,
  permission: Permission,
  resource?: Resource,
): boolean {
  // No context = not logged in = no permission
  if (!ctx) return false

  // ------------------------------------------
  // Check global permissions first
  // ------------------------------------------
  if (permission in permissions.global) {
    const rule = permissions.global[permission as GlobalPermission]
    return (rule.roles as readonly string[]).includes(ctx.role)
  }

  // ------------------------------------------
  // Parse resource permission: "post.update" → ["post", "update"]
  // ------------------------------------------
  const [resourceType, action] = permission.split('.') as [string, string]

  // Get the resource config
  const resourcePerms = permissions[resourceType as keyof typeof permissions]
  if (!resourcePerms || resourceType === 'global') return false

  // Get the action rule
  const rule = (resourcePerms as Record<string, PermissionRule>)[action]
  if (!rule) return false

  // ------------------------------------------
  // Simple permission: { roles: [...] }
  // ------------------------------------------
  if ('roles' in rule) {
    return (rule.roles as readonly string[]).includes(ctx.role)
  }

  // ------------------------------------------
  // Ownership permission: { own: [...], any: [...] }
  // ------------------------------------------

  // Check "any" first - can do to any resource
  if ('any' in rule && (rule.any as readonly string[]).includes(ctx.role)) {
    return true
  }

  // Check "own" - can only do to own resources
  if ('own' in rule && (rule.own as readonly string[]).includes(ctx.role)) {
    // Must have a resource to check ownership
    if (!resource) return false
    return resource.ownerId === ctx.userId
  }

  return false
}
