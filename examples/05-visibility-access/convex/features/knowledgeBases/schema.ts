import { defineTable } from 'convex/server'
import { v } from 'convex/values'

import { knowledgeBaseStatusValidator } from '../../../shared/features/knowledgeBases/contract'

export const knowledgeBaseTables = {
  knowledgeBases: defineTable({
    workspaceId: v.id('workspaces'),
    title: v.string(),
    status: knowledgeBaseStatusValidator,
    ownerId: v.id('users'),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index('by_workspace', ['workspaceId']),

  enrollments: defineTable({
    workspaceId: v.id('workspaces'),
    userId: v.id('users'),
    knowledgeBaseId: v.id('knowledgeBases'),
    status: v.union(v.literal('active'), v.literal('canceled')),
    createdAt: v.number(),
  })
    .index('by_workspace', ['workspaceId'])
    .index('by_user_kb', ['userId', 'knowledgeBaseId']),
}
