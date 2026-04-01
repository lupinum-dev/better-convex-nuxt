import { deny } from 'better-convex-nuxt/auth'
import { defineVisibility } from 'better-convex-nuxt/visibility'

import type { DatabaseReader } from '../_generated/server'
import type { Doc } from '../_generated/dataModel'
import type { Actor } from './actor'

type ContactOwnerScope = 'all' | Set<string>

export async function getContactOwnerScope(
  db: DatabaseReader,
  actor: Exclude<Actor, null>,
): Promise<ContactOwnerScope> {
  if (actor.role === 'owner' || actor.role === 'admin') {
    return 'all'
  }

  if (actor.role === 'manager') {
    const team = await db
      .query('users')
      .withIndex('by_manager', q => q.eq('managerId', actor.userId))
      .collect()

    return new Set([actor.userId, ...team.map(user => user.authId)])
  }

  return new Set([actor.userId])
}

export function canAccessContactOwner(scope: ContactOwnerScope, ownerId: string): boolean {
  return scope === 'all' || scope.has(ownerId)
}

export async function canUpdateVisibleContact(
  db: DatabaseReader,
  actor: Exclude<Actor, null>,
  contact: Doc<'contacts'>,
): Promise<boolean> {
  const scope = await getContactOwnerScope(db, actor)
  return canAccessContactOwner(scope, contact.ownerId)
}

export async function requireAssignableContactOwner(
  db: DatabaseReader,
  actor: Exclude<Actor, null>,
  ownerId: string,
): Promise<Doc<'users'>> {
  const owner = await db
    .query('users')
    .withIndex('by_auth_id', q => q.eq('authId', ownerId))
    .first()

  if (!owner || owner.workspaceId !== actor.tenantId) {
    throw deny('Contact owner not found.')
  }

  const scope = await getContactOwnerScope(db, actor)
  if (!canAccessContactOwner(scope, ownerId)) {
    throw deny('You cannot assign contacts to that owner.')
  }

  return owner
}

export const contactVisibility = defineVisibility(async (actor: Actor, db) => {
  if (!actor) return []

  const ownerScope = await getContactOwnerScope(db, actor)

  if (ownerScope === 'all') {
    return db
      .query('contacts')
      .withIndex('by_workspace', q => q.eq('workspaceId', actor.tenantId))
  }

  const contacts = await db
    .query('contacts')
    .withIndex('by_workspace', q => q.eq('workspaceId', actor.tenantId))
    .collect()

  return contacts.filter(contact => canAccessContactOwner(ownerScope, contact.ownerId))
})
