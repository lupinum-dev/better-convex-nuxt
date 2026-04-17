import { deny, getAuth, open } from '@lupinum/trellis/auth'
import { v } from 'convex/values'

import {
  addWorkspaceMemberArgs,
  createWorkspaceArgs,
  switchWorkspaceArgs,
} from '../shared/schemas/kanban'
import type { Id } from './_generated/dataModel'
import type { MutationCtx } from './_generated/server'
import { canManageMembers, canReadWorkspace } from './auth/checks'
import { mutation, query, raw } from './functions'
import { getMembership, getUserByAuthId, listMemberships, resolveWorkspaceAccess, slugify } from './lib/access'
import { writeAuditEvent } from './lib/audit'
import { getKanbanPermissions, type KanbanRole } from '../shared/permissions'

const starterColumns = ['Inbox', 'Doing', 'Done']

async function seedStarterBoard(
  db: MutationCtx['db'],
  workspaceId: Id<'workspaces'>,
  userId: string,
  workspaceName: string,
) {
  const now = Date.now()
  const boardId = await db.insert('boards', {
    workspaceId,
    title: `${workspaceName} board`,
    slug: 'workspace-board',
    archived: false,
    createdBy: userId,
    createdAt: now,
    updatedAt: now,
  })

  for (const [index, title] of starterColumns.entries()) {
    await db.insert('columns', {
      workspaceId,
      boardId,
      title,
      position: index * 1000,
      createdAt: now,
      updatedAt: now,
    })
  }
}

export const getSessionContext = query({
  guard: open,
  args: {},
  handler: async (ctx) => {
    const principal = await ctx.principal()
    if (principal.kind === 'anonymous') return null

    const user = await getUserByAuthId(ctx.db, principal.userId)
    if (!user) throw new Error('Current user row not found.')

    const memberships = await listMemberships(ctx.db, user.authId)
    const accessibleWorkspaces = (
      await Promise.all(
        memberships.map(async (membership) => {
          const workspace = await ctx.db.get(membership.workspaceId)
          if (!workspace) return null
          return {
            workspaceId: workspace._id,
            name: workspace.name,
            slug: workspace.slug,
            role: membership.role,
          }
        }),
      )
    ).filter(
      (
        entry,
      ): entry is { workspaceId: Id<'workspaces'>; name: string; slug: string; role: KanbanRole } =>
        !!entry,
    )

    const activeWorkspace = user.activeWorkspaceId ? await ctx.db.get(user.activeWorkspaceId) : null
    const activeMembership = user.activeWorkspaceId
      ? await getMembership(ctx.db, user.authId, user.activeWorkspaceId)
      : null

    return {
      user: {
        authId: user.authId,
        email: user.email ?? null,
        displayName: user.displayName ?? null,
      },
      activeWorkspace: activeWorkspace
        ? {
            _id: activeWorkspace._id,
            name: activeWorkspace.name,
            slug: activeWorkspace.slug,
          }
        : null,
      activeRole: activeMembership?.role ?? null,
      memberships: accessibleWorkspaces,
      permissions: getKanbanPermissions(activeMembership?.role ?? null),
    }
  },
})

export const getPermissionContext = query({
  guard: open,
  args: {},
  handler: async (ctx) => {
    const principal = await ctx.principal()
    if (principal.kind === 'anonymous') return null

    const user = await getUserByAuthId(ctx.db, principal.userId)
    if (!user) throw new Error('Current user row not found.')

    const membership = user.activeWorkspaceId
      ? await getMembership(ctx.db, user.authId, user.activeWorkspaceId)
      : null

    return {
      userId: user.authId,
      activeWorkspaceId: user.activeWorkspaceId ?? null,
      role: membership?.role ?? null,
      can: getKanbanPermissions(membership?.role ?? null),
    }
  },
})

export const listAccessibleWorkspaces = query({
  guard: open,
  args: {},
  handler: async (ctx) => {
    const principal = await ctx.principal()
    if (principal.kind === 'anonymous') return []

    const user = await getUserByAuthId(ctx.db, principal.userId)
    if (!user) return []

    const memberships = await listMemberships(ctx.db, user.authId)
    const workspaces = await Promise.all(
      memberships.map(async (membership) => {
        const workspace = await ctx.db.get(membership.workspaceId)
        if (!workspace) return null
        return {
          workspaceId: workspace._id,
          name: workspace.name,
          slug: workspace.slug,
          role: membership.role,
          active: user.activeWorkspaceId === workspace._id,
        }
      }),
    )

    return workspaces.filter((entry): entry is NonNullable<(typeof workspaces)[number]> => !!entry)
  },
})

export const createWorkspace = raw.mutation({
  args: createWorkspaceArgs.args,
  handler: async (ctx, args) => {
    const auth = await getAuth(ctx)
    if (!auth) throw deny('Not authenticated.')

    const user = await ctx.db
      .query('users')
      .withIndex('by_auth_id', (q) => q.eq('authId', auth.subject))
      .first()
    if (!user) throw new Error('Current user row not found.')

    const slug = slugify(args.slug)
    const existing = await ctx.db
      .query('workspaces')
      .withIndex('by_slug', (q) => q.eq('slug', slug))
      .first()
    if (existing) throw new Error('That workspace slug is already taken.')

    const now = Date.now()
    const workspaceId = await ctx.db.insert('workspaces', {
      name: args.name.trim(),
      slug,
      ownerId: user.authId,
      createdAt: now,
      updatedAt: now,
    })

    await ctx.db.insert('memberships', {
      userId: user.authId,
      workspaceId,
      role: 'owner',
      createdAt: now,
      updatedAt: now,
    })

    await ctx.db.patch(user._id, {
      activeWorkspaceId: workspaceId,
      updatedAt: now,
    })

    await seedStarterBoard(ctx.db, workspaceId, user.authId, args.name.trim())

    return workspaceId
  },
})

export const switchWorkspace = raw.mutation({
  args: switchWorkspaceArgs.args,
  handler: async (ctx, args) => {
    const auth = await getAuth(ctx)
    if (!auth) throw deny('Not authenticated.')

    const user = await ctx.db
      .query('users')
      .withIndex('by_auth_id', (q) => q.eq('authId', auth.subject))
      .first()
    if (!user) throw new Error('Current user row not found.')

    const membership = await ctx.db
      .query('memberships')
      .withIndex('by_user_workspace', (q) => q.eq('userId', user.authId).eq('workspaceId', args.workspaceId))
      .first()
    if (!membership) throw new Error('You do not belong to that workspace.')

    await ctx.db.patch(user._id, {
      activeWorkspaceId: args.workspaceId,
      updatedAt: Date.now(),
    })

    return args.workspaceId
  },
})

export const addWorkspaceMember = mutation({
  guard: canManageMembers,
  args: addWorkspaceMemberArgs.args,
  handler: async (ctx, args) => {
    const actor = await ctx.actor()
    const principal = await ctx.principal()

    const targetUser = await ctx.db
      .query('users')
      .withIndex('by_email', (q) => q.eq('email', args.email.trim().toLowerCase()))
      .first()
    if (!targetUser) {
      throw new Error('User not found. They need to sign up before they can be added.')
    }

    const existingMembership = await ctx.db
      .query('memberships')
      .withIndex('by_user_workspace', (q) =>
        q.eq('userId', targetUser.authId).eq('workspaceId', actor.tenantId),
      )
      .first()

    const now = Date.now()
    if (existingMembership) {
      await ctx.db.patch(existingMembership._id, {
        role: args.role,
        updatedAt: now,
      })

      await writeAuditEvent(ctx, {
        principal,
        actor,
        action: 'workspace.member.role_changed',
        summary: `Changed ${args.email.trim()} to ${args.role}.`,
        workspaceId: actor.tenantId,
        metadata: { email: args.email.trim(), role: args.role },
      })

      return existingMembership._id
    }

    const membershipId = await ctx.db.insert('memberships', {
      userId: targetUser.authId,
      workspaceId: actor.tenantId,
      role: args.role,
      invitedBy: actor.userId,
      createdAt: now,
      updatedAt: now,
    })

    if (!targetUser.activeWorkspaceId) {
      await ctx.db.patch(targetUser._id, {
        activeWorkspaceId: actor.tenantId,
        updatedAt: now,
      })
    }

    await writeAuditEvent(ctx, {
      principal,
      actor,
      action: 'workspace.member.added',
      summary: `Added ${args.email.trim()} as ${args.role}.`,
      workspaceId: actor.tenantId,
      metadata: { email: args.email.trim(), role: args.role },
    })

    return membershipId
  },
})

export const listMembers = query({
  guard: canReadWorkspace,
  args: {},
  handler: async (ctx) => {
    const actor = await ctx.actor()
    const memberships = await ctx.db
      .query('memberships')
      .withIndex('by_workspace', (q) => q.eq('workspaceId', actor.tenantId))
      .collect()

    const members = await Promise.all(
      memberships.map(async (membership) => {
        const user = await ctx.db
          .query('users')
          .withIndex('by_auth_id', (q) => q.eq('authId', membership.userId))
          .first()

        return {
          _id: membership._id,
          userId: membership.userId,
          role: membership.role,
          displayName: user?.displayName ?? null,
          email: user?.email ?? null,
        }
      }),
    )

    return members.sort((left, right) => (left.email ?? '').localeCompare(right.email ?? ''))
  },
})

export const listAuditEvents = query({
  guard: canReadWorkspace,
  args: {},
  handler: async (ctx) => {
    const actor = await ctx.actor()
    const events = await ctx.db
      .query('auditEvents')
      .withIndex('by_workspace_created', (q) => q.eq('workspaceId', actor.tenantId))
      .order('desc')
      .take(20)

    return events.map((event) => ({
      _id: event._id,
      origin: event.origin,
      action: event.action,
      summary: event.summary,
      createdAt: event.createdAt,
      metadata: event.metadata ? JSON.parse(event.metadata) : null,
    }))
  },
})

export const resolveWorkspaceForAgent = query({
  guard: open,
  args: {
    workspace: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const principal = await ctx.principal()
    const access = await resolveWorkspaceAccess(ctx.db, principal, args.workspace)

    return {
      workspaceId: access.workspace._id,
      name: access.workspace.name,
      slug: access.workspace.slug,
      role: access.membership.role,
    }
  },
})
