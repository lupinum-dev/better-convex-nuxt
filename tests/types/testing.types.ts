import { defineSchema, defineTable } from 'convex/server'
import { v } from 'convex/values'

import { defineAccessContext } from '../../src/runtime/auth/define-access-context'
import { defineGuard, definePermission } from '../../src/runtime/auth/index'
import { createTestContext } from '../../src/runtime/testing'

type Assert<T extends true> = T
type IsEqual<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false

const schema = defineSchema({
  workspaces: defineTable({
    name: v.string(),
    slug: v.string(),
    ownerId: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
  }),
  users: defineTable({
    authKey: v.string(),
    role: v.union(v.literal('owner'), v.literal('member')),
    workspaceId: v.id('workspaces'),
    createdAt: v.number(),
    updatedAt: v.number(),
  }),
  organizations: defineTable({
    name: v.string(),
    slug: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
  }),
  members: defineTable({
    authKey: v.string(),
    role: v.union(v.literal('owner'), v.literal('member')),
    organizationId: v.id('organizations'),
    createdAt: v.number(),
    updatedAt: v.number(),
  }),
})

const defaultCtx = createTestContext({ schema })
type DefaultTenant = Awaited<ReturnType<typeof defaultCtx.seedTenant>>
type _defaultWorkspaceId = Assert<
  IsEqual<DefaultTenant['id'], { __tableName: 'workspaces' } & string>
>
type _defaultUserId = Assert<
  IsEqual<DefaultTenant['users'][string]['id'], { __tableName: 'users' } & string>
>
const _keyedTenant = defaultCtx.seedTenant({
  name: 'Keyed',
  users: {
    owner: { role: 'owner' as const },
    member: { role: 'member' as const },
  },
})
type KeyedTenant = Awaited<typeof _keyedTenant>
type _keyedOwnerRole = Assert<IsEqual<KeyedTenant['users']['owner']['role'], 'owner'>>
type _keyedMemberRole = Assert<IsEqual<KeyedTenant['users']['member']['role'], 'member'>>
const _forwardedClient = defaultCtx.asCaller({ kind: 'user', userId: 'owner-1' })
type _forwardedClientSurface = Assert<
  IsEqual<keyof typeof _forwardedClient, 'action' | 'mutation' | 'query'>
>

const _organizationCtx = createTestContext({
  schema,
  tenant: { table: 'organizations', field: 'organizationId' },
  users: {
    table: 'members',
    authField: 'authKey',
    roleField: 'role',
    tenantField: 'organizationId',
  },
})
type OrganizationTenant = Awaited<ReturnType<typeof _organizationCtx.seedTenant>>
type _organizationWorkspaceId = Assert<
  IsEqual<OrganizationTenant['id'], { __tableName: 'organizations' } & string>
>
type _organizationUserId = Assert<
  IsEqual<OrganizationTenant['users'][string]['id'], { __tableName: 'members' } & string>
>

const canExport = defineGuard<{ role: 'owner' | 'member'; userId: string; workspaceId: string }>(
  'workspace.exports',
  (appIdentity) => appIdentity.role === 'owner',
)

const exportsPermission = definePermission({
  key: 'workspace.exports',
  check: canExport,
})

const _accessContext = defineAccessContext({
  resolve: async () => ({
    role: 'owner' as const,
    userId: 'owner-1',
    workspaceId: 'workspace-1',
    plan: 'pro' as const,
  }),
  permissions: [exportsPermission],
  extend: async () => ({
    plan: 'pro' as const,
    usage: {
      projects: {
        current: 2,
      },
    },
  }),
})
type AccessContextResult = Awaited<ReturnType<typeof _accessContext.handler>>
type _accessContextPlan = Assert<IsEqual<NonNullable<AccessContextResult>['plan'], 'pro'>>
type _accessContextUsage = Assert<
  IsEqual<NonNullable<AccessContextResult>['usage']['projects']['current'], number>
>
