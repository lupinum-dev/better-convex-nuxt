/// <reference types="vite/client" />

import { createTestContext } from '@lupinum/trellis/testing'
import { describe, expect, it } from 'vitest'

import { api } from './_generated/api'
import type { Doc, Id } from './_generated/dataModel'
import { projectCreate } from './features/projects'
import schema from './schema'
import { modules } from './test.setup'
type MembershipRole = Doc<'memberships'>['role']
type SeededUser = {
  id: Id<'users'>
  authKey: string
  role: MembershipRole
  query: ReturnType<ReturnType<typeof createCtx>['raw']['withIdentity']>['query']
  mutation: ReturnType<ReturnType<typeof createCtx>['raw']['withIdentity']>['mutation']
}

function createCtx() {
  return createTestContext({ schema, modules })
}

async function seedWorkspace(
  ctx: ReturnType<typeof createCtx>,
  {
    name,
    users,
  }: {
    name: string
    users: Record<string, { role: MembershipRole }>
  },
): Promise<{ id: Id<'workspaces'>; users: Record<string, SeededUser> }> {
  const slug = name.toLowerCase()
  const ownerEntry =
    Object.entries(users).find(([, user]) => user.role === 'owner') ?? Object.entries(users)[0]
  if (!ownerEntry) throw new Error('seedWorkspace requires at least one user.')

  const now = Date.now()
  const seededUsers = {} as Record<string, SeededUser>
  for (const [key, user] of Object.entries(users)) {
    const authKey = `${slug}-${key}`
    const userId = (await ctx.seed('users', {
      authKey,
      email: `${authKey}@example.test`,
      displayName: key,
      createdAt: now,
      updatedAt: now,
    })) as Id<'users'>

    const caller = ctx.raw.withIdentity({ subject: authKey, tokenIdentifier: authKey })
    seededUsers[key] = {
      id: userId,
      authKey,
      role: user.role,
      query: caller.query,
      mutation: caller.mutation,
    }
  }

  const ownerUser = seededUsers[ownerEntry[0]]
  if (!ownerUser) throw new Error('seedWorkspace owner user was not seeded.')

  const workspaceId = (await ctx.seed('workspaces', {
    name,
    slug,
    ownerId: ownerUser.id,
    createdAt: now,
    updatedAt: now,
  })) as Id<'workspaces'>

  for (const [key, user] of Object.entries(users)) {
    const seededUser = seededUsers[key]
    if (!seededUser) continue

    await ctx.raw.run(async (innerCtx) => {
      await innerCtx.db.patch(seededUser.id, { workspaceId } as never)
    })

    await ctx.seed('memberships', {
      userId: seededUser.id,
      workspaceId,
      role: user.role,
      createdAt: now,
    })
  }

  return { id: workspaceId, users: seededUsers }
}

describe('agency example', () => {
  it('keeps client users tenant-scoped', async () => {
    const ctx = createCtx()
    const alpha = await seedWorkspace(ctx, {
      name: 'Alpha',
      users: { owner: { role: 'owner' } },
    })
    const beta = await seedWorkspace(ctx, {
      name: 'Beta',
      users: { owner: { role: 'owner' } },
    })

    await alpha.users.owner.mutation(api.features.projects.domain.create, { name: 'Alpha project' })

    const betaProjects = await beta.users.owner.query(api.features.projects.domain.list, {})
    expect(betaProjects).toHaveLength(0)
  })

  it('shows only assigned clients on the agency dashboard', async () => {
    const ctx = createCtx()
    const user = await ctx.seed('users', {
      authKey: 'agent-1',
      email: 'agent@example.test',
      displayName: 'Agent',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    })
    const clientA = await ctx.seed('workspaces', {
      name: 'Client A',
      slug: 'client-a',
      ownerId: user,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    })
    const clientB = await ctx.seed('workspaces', {
      name: 'Client B',
      slug: 'client-b',
      ownerId: user,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    })
    const clientC = await ctx.seed('workspaces', {
      name: 'Client C',
      slug: 'client-c',
      ownerId: user,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    })

    await ctx.raw.run(async (innerCtx) => {
      await innerCtx.db.patch(user, { workspaceId: clientA } as never)
    })
    await ctx.seed('memberships', {
      userId: user,
      workspaceId: clientA,
      role: 'agency_manager',
      createdAt: Date.now(),
    })
    await ctx.seed('memberships', {
      userId: user,
      workspaceId: clientB,
      role: 'agency_manager',
      createdAt: Date.now(),
    })

    await ctx.seed('projects', {
      workspaceId: clientA,
      name: 'A',
      status: 'active',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    })
    await ctx.seed('projects', {
      workspaceId: clientB,
      name: 'B',
      status: 'active',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    })
    await ctx.seed('projects', {
      workspaceId: clientC,
      name: 'C',
      status: 'active',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    })

    const agent = ctx.raw.withIdentity({ subject: 'agent-1', tokenIdentifier: 'agent-1' })
    const portfolio = await agent.query(api.features.dashboard.domain.portfolio, {})
    expect(portfolio).toHaveLength(2)
    expect(
      portfolio.map((entry: (typeof portfolio)[number]) => entry.workspace.name).sort(),
    ).toEqual(['Client A', 'Client B'])
  })

  it('returns access context booleans for owners and viewers inside a workspace', async () => {
    const ctx = createCtx()
    const team = await seedWorkspace(ctx, {
      name: 'Alpha',
      users: {
        owner: { role: 'owner' },
        viewer: { role: 'viewer' },
      },
    })

    const ownerCtx = await team.users.owner.query(api.permissions.context.getAccessContext, {})
    const viewerCtx = await team.users.viewer.query(api.permissions.context.getAccessContext, {})

    expect(ownerCtx?.can[projectCreate.key]).toBe(true)
    expect(viewerCtx?.can[projectCreate.key]).toBe(false)
  })

  it('returns null context and denies the agency dashboard for anonymous callers', async () => {
    const ctx = createCtx()

    await expect(ctx.raw.query(api.permissions.context.getAccessContext, {})).resolves.toBeNull()
    await expect(ctx.raw.query(api.features.dashboard.domain.portfolio, {})).rejects.toThrow(
      'Not authenticated.',
    )
  })

  it('creates a single owner membership when creating a workspace', async () => {
    const ctx = createCtx()
    const team = await seedWorkspace(ctx, {
      name: 'Alpha',
      users: {
        owner: { role: 'owner' },
        member: { role: 'member' },
      },
    })

    const workspaceId = await team.users.owner.mutation(
      api.features.workspaces.domain.createWorkspaceMutation,
      {
        name: 'Client Workspace',
        slug: 'client-workspace',
      },
    )

    const memberships = await ctx.readAll('memberships')
    const ownerMemberships = memberships.filter((membership: Doc<'memberships'>) => {
      return (
        membership.userId === team.users.owner.id &&
        membership.workspaceId === workspaceId &&
        membership.role === 'owner'
      )
    })

    expect(ownerMemberships).toHaveLength(1)
  })
})
