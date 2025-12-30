/**
 * Backend Permission Helpers
 *
 * Server-side utilities that use the permission config.
 * Provides getUser, requireUser, authorize, and requireSameOrg.
 */

import type { Doc, Id } from '../_generated/dataModel'
import type { QueryCtx, MutationCtx } from '../_generated/server'

import {
  checkPermission,
  type Permission,
  type PermissionContext,
  type Role,
} from '../permissions.config'

// ============================================
// AUTH USER TYPE
// ============================================
// What we get back from the database.

export interface AuthUser {
  _id: Id<'users'>
  authId: string
  role: Role
  organizationId: Id<'organizations'>
  displayName?: string
  email?: string
}

// ============================================
// GET USER
// ============================================
// Fetches the current user from the database.
// Returns null if not authenticated or user not found.
//
// Usage:
//   const user = await getUser(ctx)
//   if (!user) return []  // Not logged in

export async function getUser(ctx: QueryCtx | MutationCtx): Promise<AuthUser | null> {
  // Get identity from auth provider (Better Auth)
  const identity = await ctx.auth.getUserIdentity()
  if (!identity) {
    return null
  }

  // Look up user in our database
  const user = await ctx.db
    .query('users')
    .withIndex('by_auth_id', (q) => q.eq('authId', identity.subject))
    .first()

  // User might be authenticated but not in our DB yet
  // (happens during onboarding)
  if (!user) {
    return null
  }

  // User must have an org for permission checks
  if (!user.organizationId) {
    return null
  }

  return user as AuthUser
}

// ============================================
// REQUIRE USER
// ============================================
// Like getUser, but throws if not authenticated.
// Use when you NEED a user and want to fail fast.
//
// Usage:
//   const user = await requireUser(ctx)
//   // If we get here, user is definitely logged in

export async function requireUser(ctx: QueryCtx | MutationCtx): Promise<AuthUser> {
  const user = await getUser(ctx)
  if (!user) {
    throw new Error('Unauthorized')
  }
  return user
}

// ============================================
// AUTHORIZE
// ============================================
// The main security gate. Use in EVERY mutation.
//
// Does three things:
// 1. Verifies user is authenticated
// 2. Verifies resource is in user's org (if resource provided)
// 3. Verifies user has the permission
//
// Throws "Forbidden: permission.name" if any check fails.
//
// Usage:
//   // Global permission (no resource)
//   await authorize(ctx, "org.invite")
//
//   // Resource permission (with resource)
//   await authorize(ctx, "post.update", post)

export async function authorize(
  ctx: QueryCtx | MutationCtx,
  permission: Permission,
  resource?: { ownerId?: string; organizationId?: Id<'organizations'> },
): Promise<AuthUser> {
  // Step 1: Must be authenticated
  const user = await requireUser(ctx)

  // Step 2: Resource must be in same org (if provided)
  if (resource?.organizationId && resource.organizationId !== user.organizationId) {
    throw new Error(`Forbidden: ${permission}`)
  }

  // Step 3: Build permission context and check
  const permCtx: PermissionContext = {
    role: user.role,
    userId: user.authId,
  }

  const allowed = checkPermission(permCtx, permission, resource)
  if (!allowed) {
    throw new Error(`Forbidden: ${permission}`)
  }

  // Return user so caller can use it
  return user
}

// ============================================
// REQUIRE SAME ORG
// ============================================
// Org isolation helper for queries.
// Returns false if user can't access this resource.
// Type guard that narrows resource type.
//
// Usage:
//   const post = await ctx.db.get(args.id)
//   if (!requireSameOrg(user, post)) return null

export function requireSameOrg<T extends { organizationId: Id<'organizations'> }>(
  user: AuthUser | null,
  resource: T | null,
): resource is T {
  if (!resource) return false
  if (!user) return false
  return resource.organizationId === user.organizationId
}

// ============================================
// BUILD PERMISSION CONTEXT
// ============================================
// Builds the context object for the frontend.
// Called by the auth.getPermissionContext query.

export function buildPermissionContext(user: AuthUser): PermissionContext & {
  orgId: Id<'organizations'>
  displayName?: string
  email?: string
} {
  return {
    role: user.role,
    userId: user.authId,
    orgId: user.organizationId,
    displayName: user.displayName,
    email: user.email,
  }
}
