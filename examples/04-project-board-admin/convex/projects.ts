/**
 * Why this file exists:
 * Projects are the parent resource for the board. This file demonstrates pagination plus the
 * project-level permission layer that later task and comment operations build on.
 */
import { paginationOptsValidator } from 'convex/server'
import { v } from 'convex/values'

import {
  scopedMutation,
  scopedQuery,
} from './functions'
import {
  archiveProject,
  createProject,
} from '../shared/schemas/project'

export const list = scopedQuery({
  args: { paginationOpts: paginationOptsValidator },
  require: 'project.read',
  handler: async ({ db }, args) => {
    return await db
      .query('projects')
      .filter(q => q.neq(q.field('status'), 'archived'))
      .order('desc')
      .paginate(args.paginationOpts)
  },
})

export const get = scopedQuery({
  args: { id: v.id('projects') },
  require: 'project.read',
  resource: args => args.id,
  handler: async ({ resource }) => {
    return resource
  },
})

export const create = scopedMutation({
  args: createProject.validators,
  require: 'project.create',
  handler: async ({ db, actor }, args) => {
    const now = Date.now()
    const projectId = await db.insert('projects', {
      name: args.name,
      summary: args.summary,
      status: 'active',
      ownerId: actor.userId,
      createdAt: now,
      updatedAt: now,
    })

    await db.insert('auditEvents', {
      actorId: actor.userId,
      entityType: 'project',
      entityId: projectId,
      action: 'project.created',
      description: `Created project "${args.name}".`,
      createdAt: now,
    })

    return projectId
  },
})

export const archive = scopedMutation({
  args: archiveProject.validators,
  require: 'project.archive',
  resource: args => args.id,
  handler: async ({ db, actor, resource }, args) => {
    const now = Date.now()
    await db.patch(args.id, {
      status: 'archived',
      updatedAt: now,
    })

    await db.insert('auditEvents', {
      actorId: actor.userId,
      entityType: 'project',
      entityId: args.id,
      action: 'project.archived',
      description: `Archived project "${resource.name}".`,
      createdAt: now,
    })
  },
})
