import { defineVisibility } from 'better-convex-nuxt/auth'

import type { Actor } from './actor'

export const contactVisibility = defineVisibility(async (actor: Actor, db) => {
  if (!actor) return []

  if (['owner', 'admin'].includes(actor.role)) {
    return db
      .query('contacts')
      .withIndex('by_workspace', q => q.eq('workspaceId', actor.tenantId))
  }

  if (actor.role === 'manager') {
    const team = await db
      .query('users')
      .withIndex('by_manager', q => q.eq('managerId', actor.userId))
      .collect()
    const teamIds = [actor.userId, ...team.map(user => user.authId)]

    const contacts = await db
      .query('contacts')
      .withIndex('by_workspace', q => q.eq('workspaceId', actor.tenantId))
      .collect()

    return contacts.filter(contact => teamIds.includes(contact.ownerId))
  }

  return db
    .query('contacts')
    .withIndex('by_owner', q => q.eq('ownerId', actor.userId))
})
