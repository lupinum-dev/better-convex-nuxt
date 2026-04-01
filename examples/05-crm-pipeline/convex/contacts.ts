import { v } from 'convex/values'

import { applyVisibility, can, authorize, deny } from 'better-convex-nuxt/auth'

import { mutation, query } from './_generated/server'
import { getActor } from './auth/actor'
import { canCreateContact, canReadContacts, canUpdateContact, hasRole } from './auth/checks'
import { redactContact } from './auth/redaction'
import { withCan } from './auth/resource'
import { loadResource } from './auth/scope'
import {
  canAccessContactOwner,
  canUpdateVisibleContact,
  contactVisibility,
  getContactOwnerScope,
  requireAssignableContactOwner,
} from './auth/visibility'

export const list = query({
  args: {},
  handler: async (ctx) => {
    const actor = await getActor(ctx)
    authorize(actor, 'Read contacts', canReadContacts)

    const contacts = await applyVisibility(contactVisibility, actor, ctx.db)
    const ownerScope = await getContactOwnerScope(ctx.db, actor)

    return contacts.map(contact =>
      withCan(redactContact(actor, contact), {
        update: can(actor, canUpdateContact(contact))
          || canAccessContactOwner(ownerScope, contact.ownerId),
      }),
    )
  },
})

export const create = mutation({
  args: {
    name: v.string(),
    company: v.string(),
    phone: v.optional(v.string()),
    personalEmail: v.optional(v.string()),
    estimatedRevenue: v.optional(v.number()),
    internalNotes: v.optional(v.string()),
    ownerId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const actor = await getActor(ctx)
    authorize(actor, 'Create contact', canCreateContact)

    const ownerId = can(actor, hasRole('owner', 'admin', 'manager')) && args.ownerId
      ? args.ownerId
      : actor.userId
    await requireAssignableContactOwner(ctx.db, actor, ownerId)

    const now = Date.now()
    return ctx.db.insert('contacts', {
      workspaceId: actor.tenantId,
      ownerId,
      name: args.name,
      company: args.company,
      phone: args.phone,
      personalEmail: args.personalEmail,
      estimatedRevenue: args.estimatedRevenue,
      internalNotes: args.internalNotes,
      createdAt: now,
      updatedAt: now,
    })
  },
})

export const updateNotes = mutation({
  args: {
    id: v.id('contacts'),
    internalNotes: v.string(),
  },
  handler: async (ctx, args) => {
    const actor = await getActor(ctx)
    const contact = loadResource(actor, await ctx.db.get(args.id), 'Contact')
    authorize(actor, 'Update contact', canReadContacts)

    if (!await canUpdateVisibleContact(ctx.db, actor, contact)) {
      throw deny('Forbidden: Update contact')
    }

    await ctx.db.patch(args.id, {
      internalNotes: args.internalNotes,
      updatedAt: Date.now(),
    })
  },
})
