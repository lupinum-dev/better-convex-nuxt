import { defineTable } from 'convex/server'
import { v } from 'convex/values'

export const workspaceTables = {
  workspaces: defineTable({
    name: v.string(),
    slug: v.string(),
    ownerId: v.id('users'),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index('by_slug', ['slug']),
}
