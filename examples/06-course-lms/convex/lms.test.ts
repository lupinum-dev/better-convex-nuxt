/// <reference types="vite/client" />

import { anyApi } from 'convex/server'
import { describe, expect, it } from 'vitest'

import { createTestContext } from 'better-convex-nuxt/testing'

import schema from './schema'
import { modules } from './test.setup'

const api = anyApi

function createCtx() {
  return createTestContext({
    schema,
    modules,
    tenant: {
      table: 'workspaces',
      field: 'workspaceId',
    },
    users: {
      table: 'users',
      authField: 'authId',
      roleField: 'role',
      tenantField: 'workspaceId',
      nameField: 'displayName',
      emailField: 'email',
    },
  })
}

describe('lms example', () => {
  it('lets an enrolled student read a published lesson', async () => {
    const ctx = createCtx()
    const team = await ctx.seedTenant({
      name: 'Academy',
      users: {
        owner: { role: 'owner' },
        student: { role: 'student' },
      },
    })

    const courseId = await team.users.owner.mutation(api.courses.seedDemoCourse, {})
    const lessons = await team.users.owner.query(api.lessons.listLessonsByCourse, { courseId })
    const introLesson = lessons.find(lesson => lesson.title === 'Intro lesson')

    await team.users.student.mutation(api.lessons.enrollSelf, { courseId })
    const lesson = await team.users.student.query(api.lessons.getLesson, { id: introLesson!._id })
    expect(lesson.title).toBe('Intro lesson')
  })

  it('blocks a student without enrollment', async () => {
    const ctx = createCtx()
    const team = await ctx.seedTenant({
      name: 'Academy',
      users: {
        owner: { role: 'owner' },
        student: { role: 'student' },
      },
    })

    const courseId = await team.users.owner.mutation(api.courses.seedDemoCourse, {})
    const lessons = await team.users.owner.query(api.lessons.listLessonsByCourse, { courseId })
    const introLesson = lessons.find(lesson => lesson.title === 'Intro lesson')

    await expect(
      team.users.student.query(api.lessons.getLesson, { id: introLesson!._id }),
    ).rejects.toThrow('Not enrolled in this course.')
  })

  it('blocks a student on missing prerequisites', async () => {
    const ctx = createCtx()
    const team = await ctx.seedTenant({
      name: 'Academy',
      users: {
        owner: { role: 'owner' },
        student: { role: 'student' },
      },
    })

    const courseId = await team.users.owner.mutation(api.courses.seedDemoCourse, {})
    const lessons = await team.users.owner.query(api.lessons.listLessonsByCourse, { courseId })
    const advancedLesson = lessons.find(lesson => lesson.title === 'Advanced lesson')

    await team.users.student.mutation(api.lessons.enrollSelf, { courseId })
    await expect(
      team.users.student.query(api.lessons.getLesson, { id: advancedLesson!._id }),
    ).rejects.toThrow('Complete')
  })

  it('blocks a student from completing a lesson without enrollment', async () => {
    const ctx = createCtx()
    const team = await ctx.seedTenant({
      name: 'Academy',
      users: {
        owner: { role: 'owner' },
        student: { role: 'student' },
      },
    })

    const courseId = await team.users.owner.mutation(api.courses.seedDemoCourse, {})
    const lessons = await team.users.owner.query(api.lessons.listLessonsByCourse, { courseId })
    const introLesson = lessons.find(lesson => lesson.title === 'Intro lesson')

    await expect(
      team.users.student.mutation(api.lessons.completeLesson, { lessonId: introLesson!._id }),
    ).rejects.toThrow('Not enrolled in this course.')
  })

  it('blocks a student on unpublished lessons', async () => {
    const ctx = createCtx()
    const team = await ctx.seedTenant({
      name: 'Academy',
      users: {
        owner: { role: 'owner' },
        student: { role: 'student' },
      },
    })

    const courseId = await team.users.owner.mutation(api.courses.seedDemoCourse, {})
    const lessons = await team.users.owner.query(api.lessons.listLessonsByCourse, { courseId })
    const draftLesson = lessons.find(lesson => lesson.title === 'Draft lesson')

    await team.users.student.mutation(api.lessons.enrollSelf, { courseId })
    await expect(
      team.users.student.query(api.lessons.getLesson, { id: draftLesson!._id }),
    ).rejects.toThrow('Lesson not available.')
  })

  it('blocks a student from completing an unpublished lesson', async () => {
    const ctx = createCtx()
    const team = await ctx.seedTenant({
      name: 'Academy',
      users: {
        owner: { role: 'owner' },
        student: { role: 'student' },
      },
    })

    const courseId = await team.users.owner.mutation(api.courses.seedDemoCourse, {})
    const lessons = await team.users.owner.query(api.lessons.listLessonsByCourse, { courseId })
    const draftLesson = lessons.find(lesson => lesson.title === 'Draft lesson')

    await team.users.student.mutation(api.lessons.enrollSelf, { courseId })
    await expect(
      team.users.student.mutation(api.lessons.completeLesson, { lessonId: draftLesson!._id }),
    ).rejects.toThrow('Lesson not available.')
  })

  it('blocks a student from completing a lesson with unmet prerequisites', async () => {
    const ctx = createCtx()
    const team = await ctx.seedTenant({
      name: 'Academy',
      users: {
        owner: { role: 'owner' },
        student: { role: 'student' },
      },
    })

    const courseId = await team.users.owner.mutation(api.courses.seedDemoCourse, {})
    const lessons = await team.users.owner.query(api.lessons.listLessonsByCourse, { courseId })
    const advancedLesson = lessons.find(lesson => lesson.title === 'Advanced lesson')

    await team.users.student.mutation(api.lessons.enrollSelf, { courseId })
    await expect(
      team.users.student.mutation(api.lessons.completeLesson, { lessonId: advancedLesson!._id }),
    ).rejects.toThrow('Complete')
  })

  it('blocks a student from completing a lesson before its availability window', async () => {
    const ctx = createCtx()
    const team = await ctx.seedTenant({
      name: 'Academy',
      users: {
        owner: { role: 'owner' },
        student: { role: 'student' },
      },
    })

    const courseId = await team.users.owner.mutation(api.courses.seedDemoCourse, {})
    const futureLessonId = await ctx.seed('lessons', {
      workspaceId: team.id,
      courseId,
      title: 'Timed lesson',
      body: 'Not yet available.',
      status: 'published',
      availableAfter: Date.now() + 60_000,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    })

    await team.users.student.mutation(api.lessons.enrollSelf, { courseId })
    await expect(
      team.users.student.mutation(api.lessons.completeLesson, { lessonId: futureLessonId }),
    ).rejects.toThrow('This lesson is not available yet.')
  })

  it('unlocks the advanced lesson after the prerequisite is completed', async () => {
    const ctx = createCtx()
    const team = await ctx.seedTenant({
      name: 'Academy',
      users: {
        owner: { role: 'owner' },
        student: { role: 'student' },
      },
    })

    const courseId = await team.users.owner.mutation(api.courses.seedDemoCourse, {})
    const lessons = await team.users.owner.query(api.lessons.listLessonsByCourse, { courseId })
    const introLesson = lessons.find(lesson => lesson.title === 'Intro lesson')
    const advancedLesson = lessons.find(lesson => lesson.title === 'Advanced lesson')

    await team.users.student.mutation(api.lessons.enrollSelf, { courseId })
    const listedLessons = await team.users.student.query(api.lessons.listLessonsByCourse, { courseId })
    expect(listedLessons.map(lesson => lesson.title)).toEqual(['Intro lesson', 'Advanced lesson'])

    await team.users.student.mutation(api.lessons.completeLesson, { lessonId: introLesson!._id })
    const lesson = await team.users.student.query(api.lessons.getLesson, { id: advancedLesson!._id })
    expect(lesson.title).toBe('Advanced lesson')
  })

  it('still lets staff complete lessons without the student access chain', async () => {
    const ctx = createCtx()
    const team = await ctx.seedTenant({
      name: 'Academy',
      users: {
        instructor: { role: 'instructor' },
      },
    })

    const courseId = await team.users.instructor.mutation(api.courses.seedDemoCourse, {})
    const lessons = await team.users.instructor.query(api.lessons.listLessonsByCourse, { courseId })
    const draftLesson = lessons.find(lesson => lesson.title === 'Draft lesson')

    await expect(
      team.users.instructor.mutation(api.lessons.completeLesson, { lessonId: draftLesson!._id }),
    ).resolves.toBeTruthy()
  })

  it('returns permission context booleans for staff and students', async () => {
    const ctx = createCtx()
    const team = await ctx.seedTenant({
      name: 'Academy',
      users: {
        owner: { role: 'owner' },
        student: { role: 'student' },
      },
    })

    const ownerCtx = await team.users.owner.query(api.workspaces.getPermissionContext, {})
    const studentCtx = await team.users.student.query(api.workspaces.getPermissionContext, {})

    expect(ownerCtx?.can['course.seed']).toBe(true)
    expect(studentCtx?.can['course.seed']).toBe(false)
    expect(studentCtx?.can['lesson.read']).toBe(true)
  })

  it('returns null context and rejects protected lesson queries for anonymous callers', async () => {
    const ctx = createCtx()

    await expect(ctx.raw.query(api.workspaces.getPermissionContext, {})).resolves.toBeNull()
    await expect(ctx.raw.query(api.courses.listCourses, {})).rejects.toThrow('Not authenticated.')
  })
})
