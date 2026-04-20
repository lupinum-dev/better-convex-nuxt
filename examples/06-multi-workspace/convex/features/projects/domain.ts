import {
  createProject,
  listProjects,
  toggleProjectStatus,
} from '../../../shared/features/projects/contract'
import { mutation, query } from '../../functions'
import { projectCreate, projectRead } from './permissions'

export const list = query({
  args: listProjects.args,
  guard: projectRead,
  handler: async (ctx) => {
    const actor = await ctx.actor()
    if (!actor) throw new Error('Current actor is not assigned to a workspace.')

    return ctx.db
      .query('projects')
      .withIndex('by_workspace', (q) => q.eq('workspaceId', actor.tenantId))
      .order('desc')
      .collect()
  },
})

export const create = mutation({
  args: createProject.args,
  guard: projectCreate,
  handler: async (ctx, args) => {
    const actor = await ctx.actor()
    if (!actor) throw new Error('Current actor is not assigned to a workspace.')

    return ctx.db.insert('projects', {
      workspaceId: actor.tenantId,
      name: args.name,
      status: 'active',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    })
  },
})

export const toggleStatus = mutation({
  args: toggleProjectStatus.args,
  guard: projectCreate,
  handler: async (ctx, args) => {
    const project = await ctx.db.get(args.id)
    if (!project) throw new Error('Project not found.')

    const newStatus = project.status === 'active' ? 'paused' : 'active'
    await ctx.db.patch(args.id, { status: newStatus, updatedAt: Date.now() })
    return newStatus
  },
})
