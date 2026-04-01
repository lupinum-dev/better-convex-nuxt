import { and, or } from 'better-convex-nuxt/auth'

import type { Actor, Role } from './actor'

export const ROLES = ['owner', 'admin', 'member', 'viewer'] as const satisfies readonly Role[]

export const ROLE_INFO: Record<
  Role,
  { label: string; icon: string; color: string; description: string }
> = {
  owner: {
    label: 'Owner',
    icon: 'i-lucide-crown',
    color: 'amber',
    description: 'Full control over the organization',
  },
  admin: {
    label: 'Admin',
    icon: 'i-lucide-shield',
    color: 'blue',
    description: 'Manage content and members',
  },
  member: {
    label: 'Member',
    icon: 'i-lucide-user',
    color: 'green',
    description: 'Create and manage own content',
  },
  viewer: {
    label: 'Viewer',
    icon: 'i-lucide-eye',
    color: 'gray',
    description: 'Read-only access with limited comment ownership',
  },
}

export const isAuthenticated = (actor: Actor) => actor !== null
export const hasRole =
  (...roles: Role[]) =>
  (actor: Actor) =>
    !!actor && roles.includes(actor.role)
export const isOwnerOf = (resource: { ownerId: string }) => (actor: Actor) =>
  !!actor && actor.kind === 'user' && resource.ownerId === actor.userId

export const canManageOrgSettings = hasRole('owner')
export const canViewBilling = hasRole('owner')
export const canInviteMembers = hasRole('owner', 'admin')
export const canManageMembers = hasRole('owner', 'admin')

export const canCreatePost = hasRole('owner', 'admin', 'member')
export const canReadPost = hasRole('owner', 'admin', 'member', 'viewer')
export const canPublishPost = hasRole('owner', 'admin')
export const canUpdatePost = (post: { ownerId: string }) =>
  or(hasRole('owner', 'admin'), and(hasRole('member'), isOwnerOf(post)))
export const canDeletePost = (post: { ownerId: string }) =>
  or(hasRole('owner', 'admin'), and(hasRole('member'), isOwnerOf(post)))

export const canCreateComment = hasRole('owner', 'admin', 'member', 'viewer')
export const canReadComment = hasRole('owner', 'admin', 'member', 'viewer')
export const canUpdateComment = (comment: { ownerId: string }) =>
  or(hasRole('owner', 'admin'), and(hasRole('viewer'), isOwnerOf(comment)))
export const canDeleteComment = (comment: { ownerId: string }) =>
  or(hasRole('owner', 'admin'), and(hasRole('viewer'), isOwnerOf(comment)))
