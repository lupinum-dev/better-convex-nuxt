/**
 * Why this file exists:
 * Learning products are where role checks stop being enough. Lesson access depends on
 * enrollment, prerequisite progress, and publication state.
 */
import { v } from 'convex/values'

import { deny, authorize, requireAuth } from 'better-convex-nuxt/auth'

import { mutation, query } from './_generated/server'
import { getActor } from './auth/actor'
import { canReadLesson, hasRole, isAuthenticated } from './auth/checks'
import { isStaffActor, requireEnrollment } from './auth/enrollment'
import { ensurePrerequisites } from './auth/prerequisites'
import { requireRecord, loadResource } from './auth/scope'

export const listLessonsByCourse = query({
  args: { courseId: v.id('courses') },
  handler: async (ctx, args) => {
    const actor = await getActor(ctx)
    authorize(actor, 'Read lesson', isAuthenticated)
    requireAuth(actor)

    const course = loadResource(actor, await ctx.db.get(args.courseId), 'Course')
    const lessons = await ctx.db
      .query('lessons')
      .withIndex('by_course', q => q.eq('courseId', args.courseId))
      .order('asc')
      .collect()

    if (isStaffActor(actor)) return lessons
    if (course.status !== 'published') throw deny('Course not available.')

    await requireEnrollment(ctx.db, actor, course._id)
    return lessons
      .filter(lesson => lesson.status === 'published')
      .map(({ _id, title, status }) => ({ _id, title, status }))
  },
})

export const getLesson = query({
  args: { id: v.id('lessons') },
  handler: async (ctx, args) => {
    const actor = await getActor(ctx)
    authorize(actor, 'Read lesson', canReadLesson)
    requireAuth(actor)

    const lesson = loadResource(actor, await ctx.db.get(args.id), 'Lesson')
    const course = await ctx.db.get(lesson.courseId)
    requireRecord(course, 'Course')

    if (isStaffActor(actor)) return lesson

    if (course.status !== 'published') throw deny('Course not available.')
    if (lesson.status !== 'published') throw deny('Lesson not available.')

    const enrollment = await requireEnrollment(ctx.db, actor, course._id)
    await ensurePrerequisites(ctx.db, actor.userId, lesson)

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
    authorize(actor, 'Enroll self', hasRole('owner', 'admin', 'instructor', 'student'))
    requireAuth(actor)

    const course = loadResource(actor, await ctx.db.get(args.courseId), 'Course')
    const existing = await ctx.db
      .query('enrollments')
      .withIndex('by_user_course', q => q.eq('userId', actor.userId).eq('courseId', course._id))
      .first()

    if (existing) return existing._id

    return ctx.db.insert('enrollments', {
      workspaceId: actor.tenantId,
      userId: actor.userId,
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
    authorize(actor, 'Complete lesson', hasRole('owner', 'admin', 'instructor', 'student'))
    requireAuth(actor)

    const lesson = loadResource(actor, await ctx.db.get(args.lessonId), 'Lesson')
    const existing = await ctx.db
      .query('lessonProgress')
      .withIndex('by_user_lesson', q => q.eq('userId', actor.userId).eq('lessonId', lesson._id))
      .first()

    if (existing) {
      await ctx.db.patch(existing._id, { completedAt: Date.now() })
      return existing._id
    }

    return ctx.db.insert('lessonProgress', {
      workspaceId: actor.tenantId,
      userId: actor.userId,
      lessonId: lesson._id,
      completedAt: Date.now(),
    })
  },
})
