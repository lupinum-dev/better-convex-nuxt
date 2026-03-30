/**
 * Why this file exists:
 * The CRM example is about partial visibility, so the tests prove row filtering and field
 * redaction instead of only broad role checks.
 */
/// <reference types="vite/client" />

import { createTestContext } from 'better-convex-nuxt/testing'
import { anyApi } from 'convex/server'
import { describe, expect, it } from 'vitest'

import schema from './schema'
import { modules } from './test.setup'

const api = anyApi

function createCtx() {
  return createTestContext({
    schema,
    modules,
    tenant: {
      table: 'workspaces',
      field: 'workspaceId',
    },
    users: {
      table: 'users',
      authField: 'authId',
      roleField: 'role',
      tenantField: 'workspaceId',
      nameField: 'displayName',
      emailField: 'email',
    },
  })
}

describe('crm example', () => {
  it('lets a rep see only their own contacts', async () => {
    const ctx = createCtx()
    const team = await ctx.seedTenant({
      name: 'Pipeline',
      users: {
        manager: { role: 'manager', authId: 'pipeline-manager' },
        alice: { role: 'rep', managerId: 'pipeline-manager' },
        bob: { role: 'rep', managerId: 'pipeline-manager' },
      },
    })

    await team.users.alice.mutation(api.contacts.create, {
      name: 'Alice Lead',
      company: 'Acme',
      internalNotes: 'private',
    })
    await team.users.bob.mutation(api.contacts.create, {
      name: 'Bob Lead',
      company: 'Beta',
      internalNotes: 'private',
    })

    const contacts = await team.users.alice.query(api.contacts.list, {})
    expect(contacts).toHaveLength(1)
    expect(contacts[0]?.name).toBe('Alice Lead')
  })

  it('lets a manager see their team contacts', async () => {
    const ctx = createCtx()
    const team = await ctx.seedTenant({
      name: 'Pipeline',
      users: {
        manager: { role: 'manager', authId: 'pipeline-manager' },
        alice: { role: 'rep', managerId: 'pipeline-manager' },
        bob: { role: 'rep', managerId: 'pipeline-manager' },
      },
    })

    await team.users.alice.mutation(api.contacts.create, {
      name: 'Alice Lead',
      company: 'Acme',
      estimatedRevenue: 120000,
      internalNotes: 'priority',
    })
    await team.users.bob.mutation(api.contacts.create, {
      name: 'Bob Lead',
      company: 'Beta',
      estimatedRevenue: 90000,
      internalNotes: 'watch closely',
    })

    const contacts = await team.users.manager.query(api.contacts.list, {})
    expect(contacts).toHaveLength(2)
    expect(contacts.every((contact) => typeof contact.estimatedRevenue === 'number')).toBe(true)
  })

  it('redacts sensitive fields for reps', async () => {
    const ctx = createCtx()
    const team = await ctx.seedTenant({
      name: 'Pipeline',
      users: {
        alice: { role: 'rep' },
      },
    })

    await team.users.alice.mutation(api.contacts.create, {
      name: 'Alice Lead',
      company: 'Acme',
      estimatedRevenue: 120000,
      internalNotes: 'priority',
      phone: '+43-123',
      personalEmail: 'alice-lead@example.test',
    })

    const contacts = await team.users.alice.query(api.contacts.list, {})
    expect(contacts[0]?.estimatedRevenue).toBeUndefined()
    expect(contacts[0]?.internalNotes).toBeUndefined()
    expect(contacts[0]?.phone).toBe('+43-123')
  })

  it('lets an admin see every contact in the workspace', async () => {
    const ctx = createCtx()
    const team = await ctx.seedTenant({
      name: 'Pipeline',
      users: {
        admin: { role: 'admin' },
        alice: { role: 'rep' },
        bob: { role: 'rep' },
      },
    })

    await team.users.alice.mutation(api.contacts.create, {
      name: 'Alice Lead',
      company: 'Acme',
    })
    await team.users.bob.mutation(api.contacts.create, {
      name: 'Bob Lead',
      company: 'Beta',
    })

    const contacts = await team.users.admin.query(api.contacts.list, {})
    expect(contacts).toHaveLength(2)
  })

  it('lets a manager update notes on a rep-owned contact', async () => {
    const ctx = createCtx()
    const team = await ctx.seedTenant({
      name: 'Pipeline',
      users: {
        manager: { role: 'manager', authId: 'pipeline-manager' },
        alice: { role: 'rep', managerId: 'pipeline-manager' },
      },
    })

    const contactId = await team.users.alice.mutation(api.contacts.create, {
      name: 'Alice Lead',
      company: 'Acme',
    })

    await expect(
      team.users.manager.mutation(api.contacts.updateNotes, {
        id: contactId,
        internalNotes: 'manager review',
      }),
    ).resolves.toBeNull()

    const contacts = await team.users.manager.query(api.contacts.list, {})
    expect(contacts[0]?.internalNotes).toBe('manager review')
  })

  it('keeps contact visibility tenant-scoped across workspaces', async () => {
    const ctx = createCtx()
    const alpha = await ctx.seedTenant({
      name: 'Alpha Pipeline',
      users: {
        alice: { role: 'rep' },
      },
    })
    const beta = await ctx.seedTenant({
      name: 'Beta Pipeline',
      users: {
        bruno: { role: 'rep' },
      },
    })

    await alpha.users.alice.mutation(api.contacts.create, {
      name: 'Alpha Lead',
      company: 'Acme',
    })
    await beta.users.bruno.mutation(api.contacts.create, {
      name: 'Beta Lead',
      company: 'Beta',
    })

    const alphaContacts = await alpha.users.alice.query(api.contacts.list, {})
    expect(alphaContacts).toHaveLength(1)
    expect(alphaContacts[0]?.name).toBe('Alpha Lead')
  })

  it('returns permission context booleans for owners and reps', async () => {
    const ctx = createCtx()
    const team = await ctx.seedTenant({
      name: 'Pipeline',
      users: {
        owner: { role: 'owner' },
        rep: { role: 'rep' },
      },
    })

    const ownerCtx = await team.users.owner.query(api.workspaces.getPermissionContext, {})
    const repCtx = await team.users.rep.query(api.workspaces.getPermissionContext, {})

    expect(ownerCtx?.can['contact.create']).toBe(true)
    expect(repCtx?.can['contact.read']).toBe(true)
  })

  it('returns null context and rejects protected contact queries for anonymous callers', async () => {
    const ctx = createCtx()

    await expect(ctx.raw.query(api.workspaces.getPermissionContext, {})).resolves.toBeNull()
    await expect(ctx.raw.query(api.contacts.list, {})).rejects.toThrow('Forbidden: Read contacts')
  })
})
