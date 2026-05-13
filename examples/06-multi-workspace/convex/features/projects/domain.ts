import {
  createProject,
  listProjects,
  toggleProjectStatus,
} from '../../../shared/features/projects/contract'
import { mutation, query } from '../../functions'
import { projectCreate, projectRead } from './permissions'

export const list = query.protected({
  args: listProjects.args,
  guard: projectRead,
  handler: async (ctx) => {
    const appIdentity = await ctx.appIdentity()
    if (!appIdentity) throw new Error('Current appIdentity is not assigned to a workspace.')

    return ctx.db
      .query('projects')
      .withIndex('by_workspace', (q) => q.eq('workspaceId', appIdentity.workspaceId))
      .order('desc')
      .collect()
  },
})

export const create = mutation.protected({
  args: createProject.args,
  guard: projectCreate,
  handler: async (ctx, args) => {
    const appIdentity = await ctx.appIdentity()
    if (!appIdentity) throw new Error('Current appIdentity is not assigned to a workspace.')

    return ctx.db.insert('projects', {
      workspaceId: appIdentity.workspaceId,
      name: args.name,
      status: 'active',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    })
  },
})

export const toggleStatus = mutation.protected({
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
