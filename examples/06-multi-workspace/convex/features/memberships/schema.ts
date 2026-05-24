import { literals } from 'convex-helpers/validators'
import { defineTable } from 'convex/server'
import { v } from 'convex/values'

export type MembershipRole = 'owner' | 'member' | 'viewer' | 'agency_admin' | 'agency_manager'

export const membershipRoleValidator = literals(
  'owner',
  'member',
  'viewer',
  'agency_admin',
  'agency_manager',
)

export const membershipTables = {
  memberships: defineTable({
    userId: v.id('users'),
    workspaceId: v.id('workspaces'),
    role: membershipRoleValidator,
    createdAt: v.number(),
  })
    .index('by_user', ['userId'])
    .index('by_user_workspace', ['userId', 'workspaceId'])
    .index('by_workspace', ['workspaceId']),
}
