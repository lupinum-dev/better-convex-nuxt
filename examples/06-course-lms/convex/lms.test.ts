/// <reference types="vite/client" />

import { anyApi } from 'convex/server'
import { describe, expect, it, vi } from 'vitest'

import { createTestContext } from 'better-convex-nuxt/testing'

import schema from './schema'
import { modules } from './test.setup'

const api = anyApi

vi.mock('./_generated/server', async () => {
  const server = await import('convex/server')
  return {
    query: server.query,
    mutation: server.mutation,
    action: server.action,
    internalQuery: server.internalQuery,
    internalMutation: server.internalMutation,
    internalAction: server.internalAction,
    httpAction: server.httpAction,
  }
})

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
})
