/**
 * Why this file exists:
 * Course-level handlers stay small so the auth story remains centered on relationships.
 */
import { mutation, query } from './_generated/server'

import { deny, authorize, requireAuth } from 'better-convex-nuxt/auth'

import { getActor } from './auth/actor'
import { hasRole } from './auth/checks'

export const seedDemoCourse = mutation({
  args: {},
  handler: async (ctx) => {
    const actor = await getActor(ctx)
    authorize(actor, 'Seed course', hasRole('owner', 'admin', 'instructor'))

    const now = Date.now()
    const courseId = await ctx.db.insert('courses', {
      workspaceId: actor.tenantId,
      title: 'Nuxt authorization fundamentals',
      status: 'published',
      ownerId: actor.userId,
      createdAt: now,
      updatedAt: now,
    })

    const introLessonId = await ctx.db.insert('lessons', {
      workspaceId: actor.tenantId,
      courseId,
      title: 'Intro lesson',
      body: 'Start here.',
      status: 'published',
      createdAt: now,
      updatedAt: now,
    })

    await ctx.db.insert('lessons', {
      workspaceId: actor.tenantId,
      courseId,
      title: 'Advanced lesson',
      body: 'This lesson is gated.',
      status: 'published',
      availableAfter: now - 1000,
      prerequisiteIds: [introLessonId],
      createdAt: now,
      updatedAt: now,
    })

    await ctx.db.insert('lessons', {
      workspaceId: actor.tenantId,
      courseId,
      title: 'Draft lesson',
      body: 'Still hidden.',
      status: 'draft',
      createdAt: now,
      updatedAt: now,
    })

    return courseId
  },
})

export const listCourses = query({
  args: {},
  handler: async (ctx) => {
    const actor = await getActor(ctx)
    requireAuth(actor)

    return ctx.db
      .query('courses')
      .withIndex('by_workspace', q => q.eq('workspaceId', actor.tenantId))
      .order('asc')
      .collect()
  },
})
