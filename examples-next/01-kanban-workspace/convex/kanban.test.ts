/// <reference types="vite/client" />

import { createTestContext } from '@lupinum/trellis/testing'
import { anyApi } from 'convex/server'
import { describe, expect, it } from 'vitest'

import { deriveKanbanCapabilities } from '../shared/mcp-capabilities'
import type { Doc, Id } from './_generated/dataModel'
import schema from './schema'
import { modules } from './test.setup'

const api = anyApi as any
type MembershipRole = Doc<'memberships'>['role']

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
) {
  const slug = name.toLowerCase()
  const now = Date.now()
  const ownerEntry =
    Object.entries(users).find(([, user]) => user.role === 'owner') ?? Object.entries(users)[0]
  if (!ownerEntry) throw new Error('seedWorkspace requires at least one user.')
  const [ownerKey] = ownerEntry

  const workspaceId = await ctx.seed('workspaces', {
    name,
    slug,
    ownerId: `${slug}-${ownerEntry[0]}`,
    createdAt: now,
    updatedAt: now,
  })

  const seededUsers = {} as Record<
    string,
    {
      authId: string
      role: MembershipRole
      query: ReturnType<ReturnType<typeof createCtx>['raw']['withIdentity']>['query']
      mutation: ReturnType<ReturnType<typeof createCtx>['raw']['withIdentity']>['mutation']
    }
  >

  for (const [key, config] of Object.entries(users)) {
    const authId = `${slug}-${key}`
    await ctx.seed('users', {
      authId,
      email: `${authId}@example.test`,
      displayName: key,
      activeWorkspaceId: workspaceId,
      createdAt: now,
      updatedAt: now,
    })
    await ctx.seed('memberships', {
      userId: authId,
      workspaceId,
      role: config.role,
      createdAt: now,
      updatedAt: now,
    })

    const caller = ctx.raw.withIdentity({ subject: authId })
    seededUsers[key] = {
      authId,
      role: config.role,
      query: caller.query,
      mutation: caller.mutation,
    }
  }

  const boardId = await ctx.seed('boards', {
    workspaceId,
    title: `${name} board`,
    slug: `${slug}-board`,
    archived: false,
    createdBy: seededUsers[ownerKey]!.authId,
    createdAt: now,
    updatedAt: now,
  })

  const inboxId = await ctx.seed('columns', {
    workspaceId,
    boardId,
    title: 'Inbox',
    position: 0,
    createdAt: now,
    updatedAt: now,
  })
  const doingId = await ctx.seed('columns', {
    workspaceId,
    boardId,
    title: 'Doing',
    position: 1000,
    createdAt: now,
    updatedAt: now,
  })
  const doneId = await ctx.seed('columns', {
    workspaceId,
    boardId,
    title: 'Done',
    position: 2000,
    createdAt: now,
    updatedAt: now,
  })

  return {
    workspaceId,
    boardId,
    columns: {
      inboxId,
      doingId,
      doneId,
    },
    users: seededUsers,
  }
}

describe('kanban workspace example', () => {
  it('adds a member once and updates the role instead of duplicating memberships', async () => {
    const ctx = createCtx()
    const team = await seedWorkspace(ctx, {
      name: 'Alpha',
      users: {
        owner: { role: 'owner' },
      },
    })

    await ctx.seed('users', {
      authId: 'beta-user',
      email: 'beta@example.test',
      displayName: 'Beta',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    })
    const owner = team.users.owner!

    await owner.mutation(api.workspaces.addWorkspaceMember, {
      email: 'beta@example.test',
      role: 'viewer',
    })
    await owner.mutation(api.workspaces.addWorkspaceMember, {
      email: 'beta@example.test',
      role: 'member',
    })

    const memberships = await ctx.readAll('memberships')
    const betaMemberships = memberships.filter((membership: Doc<'memberships'>) => {
      return membership.userId === 'beta-user' && membership.workspaceId === team.workspaceId
    })

    expect(betaMemberships).toHaveLength(1)
    expect(betaMemberships[0]?.role).toBe('member')
  })

  it('blocks viewers from writing cards while members can move them', async () => {
    const ctx = createCtx()
    const team = await seedWorkspace(ctx, {
      name: 'Alpha',
      users: {
        owner: { role: 'owner' },
        viewer: { role: 'viewer' },
        member: { role: 'member' },
      },
    })
    const owner = team.users.owner!
    const viewer = team.users.viewer!
    const member = team.users.member!

    const cardId = await owner.mutation(api.boards.createCard, {
      columnId: team.columns.inboxId,
      title: 'Ship stress test',
    })

    await expect(
      viewer.mutation(api.boards.createCard, {
        columnId: team.columns.inboxId,
        title: 'Should fail',
      }),
    ).rejects.toThrow('Forbidden: Write cards')

    await member.mutation(api.boards.moveCard, {
      cardId,
      toColumnId: team.columns.doingId,
    })

    const board = await member.query(api.boards.getBoardView, {
      boardId: team.boardId,
    })
    expect(board?.columns.find((column: any) => column._id === team.columns.doingId)?.cards[0]?.title).toBe(
      'Ship stress test',
    )
  })

  it('supports real reorder semantics for columns and cards', async () => {
    const ctx = createCtx()
    const team = await seedWorkspace(ctx, {
      name: 'Alpha',
      users: {
        owner: { role: 'owner' },
      },
    })
    const owner = team.users.owner!

    const firstCardId = await owner.mutation(api.boards.createCard, {
      columnId: team.columns.inboxId,
      title: 'First',
    })
    const secondCardId = await owner.mutation(api.boards.createCard, {
      columnId: team.columns.inboxId,
      title: 'Second',
    })

    await owner.mutation(api.boards.moveCard, {
      cardId: secondCardId,
      toColumnId: team.columns.inboxId,
      beforeCardId: firstCardId,
    })
    await owner.mutation(api.boards.reorderColumn, {
      columnId: team.columns.doneId,
      beforeColumnId: team.columns.doingId,
    })

    const board = await owner.query(api.boards.getBoardView, {
      boardId: team.boardId,
    })

    expect(board?.columns.map((column: any) => column.title)).toEqual(['Inbox', 'Done', 'Doing'])
    expect(board?.columns[0]?.cards.map((card: any) => card.title)).toEqual(['Second', 'First'])
  })

  it('previews and archives boards through the destructive operation', async () => {
    const ctx = createCtx()
    const team = await seedWorkspace(ctx, {
      name: 'Alpha',
      users: {
        owner: { role: 'owner' },
      },
    })
    const owner = team.users.owner!

    await owner.mutation(api.boards.createCard, {
      columnId: team.columns.inboxId,
      title: 'Preview me',
    })

    const preview = await owner.query(api.boards.previewArchiveBoard, {
      boardId: team.boardId,
    })
    expect(preview.display.affects.columns).toBe(3)
    expect(preview.display.affects.cards).toBe(1)

    await owner.mutation(api.boards.archiveBoard, {
      boardId: team.boardId,
    })

    const boards = await owner.query(api.boards.listBoards, {
      includeArchived: true,
    })
    expect(boards[0]?.archived).toBe(true)
  })

  it('lets the named-workspace MCP mutation path create and move cards', async () => {
    const ctx = createCtx()
    const team = await seedWorkspace(ctx, {
      name: 'Alpha',
      users: {
        member: { role: 'member' },
      },
    })
    const member = team.users.member!

    await member.mutation(api.boards.createCardByAgent, {
      workspace: 'alpha',
      board: 'alpha-board',
      column: 'Inbox',
      title: 'Agent card',
    })
    await member.mutation(api.boards.moveCardByAgent, {
      workspace: 'alpha',
      board: 'alpha-board',
      cardTitle: 'Agent card',
      toColumn: 'Doing',
    })

    const board = await member.query(api.boards.getBoardView, {
      boardId: team.boardId,
    })
    expect(board?.columns.find((column: any) => column.title === 'Doing')?.cards[0]?.title).toBe(
      'Agent card',
    )
  })

  it('derives MCP capabilities from the strongest accessible workspace role', async () => {
    const capabilities = deriveKanbanCapabilities(['viewer', 'admin'])

    expect(capabilities.listWorkspaces).toBe(true)
    expect(capabilities.createCard).toBe(true)
    expect(capabilities.moveCard).toBe(true)
    expect(capabilities.archiveBoard).toBe(true)
  })
})
