import type { Doc, Id } from '../_generated/dataModel'
import type { MutationCtx, QueryCtx } from '../_generated/server'
import type { KanbanPrincipal } from '../auth/principal'

type KanbanDb = QueryCtx['db'] | MutationCtx['db']

export function slugify(input: string) {
  return input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

export async function getUserByAuthId(db: KanbanDb, authId: string) {
  return (await db
    .query('users')
    .withIndex('by_auth_id', (q) => q.eq('authId', authId))
    .first()) as Doc<'users'> | null
}

export async function listMemberships(db: KanbanDb, authId: string) {
  return (await db
    .query('memberships')
    .withIndex('by_user', (q) => q.eq('userId', authId))
    .collect()) as Doc<'memberships'>[]
}

export async function getMembership(
  db: KanbanDb,
  authId: string,
  workspaceId: Id<'workspaces'>,
) {
  return (await db
    .query('memberships')
    .withIndex('by_user_workspace', (q) => q.eq('userId', authId).eq('workspaceId', workspaceId))
    .first()) as Doc<'memberships'> | null
}

export async function resolveWorkspaceAccess(
  db: KanbanDb,
  principal: KanbanPrincipal,
  workspaceName?: string,
) {
  if (principal.kind === 'anonymous') {
    throw new Error('Not authenticated.')
  }

  const user = await getUserByAuthId(db, principal.userId)
  if (!user) throw new Error('Current user row not found.')

  const memberships = await listMemberships(db, user.authId)
  if (memberships.length === 0) {
    throw new Error('You do not belong to any workspace yet.')
  }

  const membershipMap = new Map(memberships.map((membership) => [String(membership.workspaceId), membership]))

  const workspaces = (
    await Promise.all(
      memberships.map(async (membership) => {
        const workspace = (await db.get(membership.workspaceId)) as Doc<'workspaces'> | null
        return workspace
          ? {
              workspace,
              membership,
            }
          : null
      }),
    )
  ).filter((entry): entry is { workspace: Doc<'workspaces'>; membership: Doc<'memberships'> } => !!entry)

  if (workspaceName) {
    const normalized = workspaceName.trim().toLowerCase()
    const matches = workspaces.filter(({ workspace }) => {
      return (
        workspace.slug.toLowerCase() === normalized || workspace.name.trim().toLowerCase() === normalized
      )
    })

    if (matches.length === 0) {
      throw new Error(`Workspace "${workspaceName}" was not found in your memberships.`)
    }
    if (matches.length > 1) {
      throw new Error(`Workspace "${workspaceName}" is ambiguous. Use the slug instead.`)
    }
    const match = matches[0]
    return {
      user,
      workspace: match!.workspace,
      membership: match!.membership,
    }
  }

  if (user.activeWorkspaceId) {
    const workspace = (await db.get(user.activeWorkspaceId)) as Doc<'workspaces'> | null
    const membership = membershipMap.get(String(user.activeWorkspaceId))
    if (workspace && membership) {
      return { user, workspace, membership }
    }
  }

  if (workspaces.length === 1) {
    const onlyWorkspace = workspaces[0]
    return {
      user,
      workspace: onlyWorkspace!.workspace,
      membership: onlyWorkspace!.membership,
    }
  }

  throw new Error('Workspace is required because you belong to multiple workspaces.')
}
