import { v } from 'convex/values'

import { can, deny, guard } from 'better-convex-nuxt/auth'

import { mutation, query } from './_generated/server'
import { getActor } from './auth/actor'
import { canReadLesson, hasRole, isAuthenticated } from './auth/checks'
import { requireEnrollment } from './auth/enrollment'
import { ensurePrerequisites } from './auth/prerequisites'
import { ensureFound, loadResource } from './auth/scope'

export const listLessonsByCourse = query({
  args: { courseId: v.id('courses') },
  handler: async (ctx, args) => {
    const actor = await getActor(ctx)
    guard(actor, 'Read lesson', isAuthenticated)

    loadResource(actor, await ctx.db.get(args.courseId), 'Course')

    return ctx.db
      .query('lessons')
      .withIndex('by_course', q => q.eq('courseId', args.courseId))
      .order('asc')
      .collect()
  },
})

export const getLesson = query({
  args: { id: v.id('lessons') },
  handler: async (ctx, args) => {
    const actor = await getActor(ctx)
    guard(actor, 'Read lesson', canReadLesson)

    const lesson = loadResource(actor, await ctx.db.get(args.id), 'Lesson')
    const course = await ctx.db.get(lesson.courseId)
    ensureFound(course, 'Course')

    if (can(actor, hasRole('owner', 'admin', 'instructor'))) return lesson

    if (course.status !== 'published') throw deny('Course not available.')
    if (lesson.status !== 'published') throw deny('Lesson not available.')

    const enrollment = await requireEnrollment(ctx.db, actor, course._id)
    await ensurePrerequisites(ctx.db, actor!.userId, lesson)

    if (lesson.availableAfter && lesson.availableAfter > Date.now()) {
      throw deny('This lesson is not available yet.')
    }

    return {
      ...lesson,
      enrolledAt: enrollment.createdAt,
    }
  },
})

export const enrollSelf = mutation({
  args: { courseId: v.id('courses') },
  handler: async (ctx, args) => {
    const actor = await getActor(ctx)
    guard(actor, 'Enroll self', hasRole('owner', 'admin', 'instructor', 'student'))

    const course = loadResource(actor, await ctx.db.get(args.courseId), 'Course')
    const existing = await ctx.db
      .query('enrollments')
      .withIndex('by_user_course', q => q.eq('userId', actor!.userId).eq('courseId', course._id))
      .first()

    if (existing) return existing._id

    return ctx.db.insert('enrollments', {
      workspaceId: actor!.tenantId,
      userId: actor!.userId,
      courseId: course._id,
      status: 'active',
      createdAt: Date.now(),
    })
  },
})

export const completeLesson = mutation({
  args: { lessonId: v.id('lessons') },
  handler: async (ctx, args) => {
    const actor = await getActor(ctx)
    guard(actor, 'Complete lesson', hasRole('owner', 'admin', 'instructor', 'student'))

    const lesson = loadResource(actor, await ctx.db.get(args.lessonId), 'Lesson')
    const existing = await ctx.db
      .query('lessonProgress')
      .withIndex('by_user_lesson', q => q.eq('userId', actor!.userId).eq('lessonId', lesson._id))
      .first()

    if (existing) {
      await ctx.db.patch(existing._id, { completedAt: Date.now() })
      return existing._id
    }

    return ctx.db.insert('lessonProgress', {
      workspaceId: actor!.tenantId,
      userId: actor!.userId,
      lessonId: lesson._id,
      completedAt: Date.now(),
    })
  },
})
