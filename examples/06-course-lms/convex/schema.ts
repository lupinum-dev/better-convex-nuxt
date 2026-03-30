import { defineSchema, defineTable } from 'convex/server'
import { v } from 'convex/values'

export const roleValidator = v.union(
  v.literal('owner'),
  v.literal('admin'),
  v.literal('instructor'),
  v.literal('student'),
)

export const courseStatusValidator = v.union(v.literal('draft'), v.literal('published'))
export const lessonStatusValidator = v.union(v.literal('draft'), v.literal('published'))

export default defineSchema({
  workspaces: defineTable({
    name: v.string(),
    slug: v.string(),
    ownerId: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index('by_slug', ['slug']),

  users: defineTable({
    authId: v.string(),
    email: v.optional(v.string()),
    displayName: v.optional(v.string()),
    role: roleValidator,
    workspaceId: v.optional(v.id('workspaces')),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index('by_auth_id', ['authId'])
    .index('by_email', ['email'])
    .index('by_workspace', ['workspaceId']),

  courses: defineTable({
    workspaceId: v.id('workspaces'),
    title: v.string(),
    status: courseStatusValidator,
    ownerId: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index('by_workspace', ['workspaceId']),

  lessons: defineTable({
    workspaceId: v.id('workspaces'),
    courseId: v.id('courses'),
    title: v.string(),
    body: v.string(),
    status: lessonStatusValidator,
    availableAfter: v.optional(v.number()),
    prerequisiteIds: v.optional(v.array(v.id('lessons'))),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index('by_workspace', ['workspaceId'])
    .index('by_course', ['courseId']),

  enrollments: defineTable({
    workspaceId: v.id('workspaces'),
    userId: v.string(),
    courseId: v.id('courses'),
    status: v.union(v.literal('active'), v.literal('canceled')),
    createdAt: v.number(),
  })
    .index('by_workspace', ['workspaceId'])
    .index('by_user_course', ['userId', 'courseId']),

  lessonProgress: defineTable({
    workspaceId: v.id('workspaces'),
    userId: v.string(),
    lessonId: v.id('lessons'),
    completedAt: v.optional(v.number()),
  })
    .index('by_workspace', ['workspaceId'])
    .index('by_user_lesson', ['userId', 'lessonId']),
})
