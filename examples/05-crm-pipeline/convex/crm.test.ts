/**
 * Why this file exists:
 * The CRM example is about partial visibility, so the tests prove row filtering and field
 * redaction instead of only broad role checks.
 */
/// <reference types="vite/client" />

import { anyApi } from 'convex/server'
import { describe, expect, it, vi } from 'vitest'

import { createTestContext } from 'better-convex-nuxt/testing'

import schema from './schema'
import { modules } from './test.setup'

const api = anyApi

vi.mock('./_generated/server', async () => {
  const server = await import('convex/server')
  return {
    query: server.query,
    mutation: server.mutation,
    action: server.action,
    internalQuery: server.internalQuery,
    internalMutation: server.internalMutation,
    internalAction: server.internalAction,
    httpAction: server.httpAction,
  }
})

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
    expect(contacts.every(contact => typeof contact.estimatedRevenue === 'number')).toBe(true)
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
})
