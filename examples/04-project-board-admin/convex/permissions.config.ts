/**
 * Why this file exists:
 * This is the smallest rule set that still feels like a real app:
 * project boards, task ownership, comment participation, and admin-only member controls.
 */
import { definePermissions } from 'better-convex-nuxt/convex'

export const permissionConfig = definePermissions({
  roles: ['owner', 'admin', 'member', 'viewer'] as const,
  rules: {
    project: {
      create: { roles: ['owner', 'admin'] },
      read: { roles: ['owner', 'admin', 'member', 'viewer'] },
      update: { own: ['member'], any: ['owner', 'admin'] },
      delete: { roles: ['owner', 'admin'] },
      archive: { roles: ['owner', 'admin'] },
    },
    task: {
      create: { roles: ['owner', 'admin', 'member'] },
      read: { roles: ['owner', 'admin', 'member', 'viewer'] },
      update: { own: ['member'], any: ['owner', 'admin'] },
      assign: { roles: ['owner', 'admin'] },
      delete: { own: ['member'], any: ['owner', 'admin'] },
    },
    comment: {
      create: { roles: ['owner', 'admin', 'member', 'viewer'] },
      read: { roles: ['owner', 'admin', 'member', 'viewer'] },
      update: { own: ['viewer', 'member'], any: ['owner', 'admin'] },
      delete: { own: ['member'], any: ['owner', 'admin'] },
    },
    workspace: {
      members: { roles: ['owner', 'admin'] },
      audit: { roles: ['owner', 'admin'] },
    },
  },
})

export type WorkspaceRole = (typeof permissionConfig.roles)[number]
