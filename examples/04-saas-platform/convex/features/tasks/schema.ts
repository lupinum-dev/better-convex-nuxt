import { defineTable } from 'convex/server'
import { v } from 'convex/values'

export const taskStatusValidator = v.union(
  v.literal('backlog'),
  v.literal('in_progress'),
  v.literal('done'),
)

export const taskPriorityValidator = v.union(
  v.literal('low'),
  v.literal('medium'),
  v.literal('high'),
)

export const taskTables = {
  tasks: defineTable({
    workspaceId: v.id('workspaces'),
    projectId: v.id('projects'),
    title: v.string(),
    status: taskStatusValidator,
    priority: taskPriorityValidator,
    assigneeId: v.optional(v.id('users')),
    ownerId: v.id('users'),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index('by_workspace', ['workspaceId'])
    .index('by_project', ['projectId'])
    .index('by_owner', ['ownerId'])
    .index('by_assignee', ['assigneeId']),
}
