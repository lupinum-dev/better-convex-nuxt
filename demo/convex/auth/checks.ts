import { and, or } from 'better-convex-nuxt/auth'

import type { Actor, Role } from './actor'

export const ROLES = ['admin', 'member', 'viewer'] as const satisfies readonly Role[]

export const ROLE_INFO: Record<
  Role,
  { label: string; icon: string; color: string; description: string }
> = {
  admin: {
    label: 'Admin',
    icon: 'i-lucide-shield',
    color: 'blue',
    description: 'Full access to everything',
  },
  member: {
    label: 'Member',
    icon: 'i-lucide-user',
    color: 'green',
    description: 'Create and edit own content',
  },
  viewer: {
    label: 'Viewer',
    icon: 'i-lucide-eye',
    color: 'gray',
    description: 'View content only',
  },
}

export const isAuthenticated = (actor: Actor) => actor !== null
export const hasRole = (...roles: Role[]) => (actor: Actor) => !!actor && roles.includes(actor.role)
export const isOwnerOf = (resource: { ownerId: string }) =>
  (actor: Actor) => !!actor && resource.ownerId === actor.userId

export const canAdminSettings = hasRole('admin')
export const canViewAll = hasRole('admin', 'member', 'viewer')
export const canCreateFeed = hasRole('admin', 'member')
export const canDeleteFeed = (item: { authorId: string }) =>
  or(hasRole('admin'), and(hasRole('member'), isOwnerOf({ ownerId: item.authorId })))
export const canUploadFile = hasRole('admin', 'member')
export const canDeleteFile = (file: { uploadedBy: string }) =>
  or(hasRole('admin'), and(hasRole('member'), isOwnerOf({ ownerId: file.uploadedBy })))
