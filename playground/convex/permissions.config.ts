/**
 * Permission Configuration
 *
 * The heart of the permission system. Defines roles, rules,
 * and the shared checkPermission() function used by both frontend and backend.
 */

import {
  definePermissions,
  type InferPermission,
  type InferRole,
} from '../../src/runtime/convex'

// ============================================
// ROLES
// ============================================
// Ordered from most to least privileged

export const ROLES = ['owner', 'admin', 'member', 'viewer'] as const

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

export const rules = {
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

  // Example nested resource key to demonstrate split-last-dot parsing
  'settings.billing': {
    view: { roles: ['owner', 'admin'] },
  },

  // ------------------------------------------
  // Add more resources here as needed...
  // ------------------------------------------
} as const

// ============================================
// TYPES (auto-generated from config)
// ============================================
type PermissionShape = {
  roles: typeof ROLES
  rules: typeof rules
}

export type Role = InferRole<PermissionShape>
export type Permission = InferPermission<PermissionShape>
export type { PermissionContext, Resource } from '../../src/runtime/convex'

export const permissionConfig = definePermissions({
  roles: ROLES,
  rules,
})

export const checkPermission = permissionConfig.checkPermission
