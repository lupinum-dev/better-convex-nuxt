import type { FunctionReference } from 'convex/server'

import { defineArgs } from '../../src/runtime/args'
import {
  definePermission,
  type PermissionKeyHandle,
  type AuthIdentity,
  enforce,
  can,
  deny,
  requireAuth,
  and,
} from '../../src/runtime/auth'
import type { PermissionKey } from '../../src/runtime/composables/configured-permissions'
import { createConfiguredPermissionsComposables } from '../../src/runtime/composables/configured-permissions'
import { defineOperation } from '../../src/runtime/functions'
import { createIdentityForwardingEnvelope } from '../../src/runtime/identity-forwarding'
import { defineTool } from '../../src/runtime/mcp/advanced'
import { createTestContext } from '../../src/runtime/testing'

type Assert<T extends true> = T
type IsEqual<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false

type AppIdentity = { role: 'owner' | 'member'; userId: string; workspaceId: string } | null
type AppIdentityCheck = (appIdentity: AppIdentity) => boolean

const isOwner: AppIdentityCheck = (appIdentity: AppIdentity) =>
  !!appIdentity && appIdentity.role === 'owner'
const isMember: AppIdentityCheck = (appIdentity: AppIdentity) =>
  !!appIdentity && appIdentity.role === 'member'

const composed = and(isOwner, isMember)
const allowed = can({ role: 'owner', userId: 'u1', workspaceId: 't1' }, composed)
void allowed

const requiredAppIdentity = {} as AppIdentity
requireAuth(requiredAppIdentity)
type _requiredAppIdentity = Assert<IsEqual<typeof requiredAppIdentity, NonNullable<AppIdentity>>>

deny('Blocked', { source: 'dx-typing' })
enforce(null, 'Admin page', false)
createIdentityForwardingEnvelope({
  key: 'identity-forwarding-key-with-enough-entropy',
  keyId: 'default',
  iss: 'trellis://server',
  aud: 'trellis://convex',
  jti: 'typed-call',
  sub: 'user:u1',
  caller: { subject: 'user:u1' },
  transport: 'server',
  purpose: 'query',
  functionRef: 'tasks:list',
  args: {},
  ttlMs: 60_000,
})

type AccessContext = {
  role: 'owner' | 'member'
  plan: 'free' | 'pro'
  userId: string
  workspaceId: string
  displayName: string | null
  usage: { projects: { current: number } }
  can: Record<'task.create' | 'workspace.members', boolean>
}

const permissionQuery = {} as FunctionReference<
  'query',
  'public',
  Record<string, never>,
  AccessContext | null
>

const _auth = createConfiguredPermissionsComposables(permissionQuery, 'workspaces.getAccessContext')

const createTaskPermission = definePermission({
  key: 'task.create',
  check: true,
})

const deleteTaskPermission = definePermission({
  key: 'task.delete',
  check: true,
})

type UseAccessApi = ReturnType<typeof _auth.useAccess>
type GuardOptions = Parameters<typeof _auth.useAuthGuard>[0]
type _permissionKey = Assert<
  IsEqual<PermissionKey<AccessContext>, 'task.create' | 'workspace.members'>
>
type _ctxFromComposable = Assert<IsEqual<UseAccessApi['ctx']['value'], AccessContext | null>>
type _roleFromComposable = Assert<
  IsEqual<UseAccessApi['role']['value'], AccessContext['role'] | null>
>
type _planFromComposable = Assert<
  IsEqual<UseAccessApi['plan']['value'], AccessContext['plan'] | null>
>
type _ctxDisplayName = Assert<
  IsEqual<NonNullable<UseAccessApi['ctx']['value']>['displayName'], string | null>
>
type _ctxUsageCurrent = Assert<
  IsEqual<NonNullable<UseAccessApi['ctx']['value']>['usage']['projects']['current'], number>
>
type _canParameter = Assert<
  IsEqual<
    Parameters<UseAccessApi['can']>[0],
    PermissionKeyHandle<'task.create' | 'workspace.members'>
  >
>
type _guardPermissionKey = Assert<
  IsEqual<
    GuardOptions['permission'],
    PermissionKeyHandle<'task.create' | 'workspace.members'> | undefined
  >
>
type _guardCheck = Assert<
  IsEqual<GuardOptions['check'], ((ctx: AccessContext) => boolean) | undefined>
>

const _validGuardOptions: GuardOptions = {
  permission: createTaskPermission,
  check: (ctx) => ctx.usage.projects.current > 0,
}
void _validGuardOptions

// @ts-expect-error invalid recordAccess should not type-check
const _invalidGuardOptions: GuardOptions = { permission: deleteTaskPermission }
void _invalidGuardOptions

type GenericAccessContext = {
  userId: string | null
  workspaceId: string | null
  role: string | null
  can: Record<string, boolean>
}

const genericPermissionQuery = {} as FunctionReference<
  'query',
  'public',
  Record<string, never>,
  GenericAccessContext | null
>

const _genericAuth = createConfiguredPermissionsComposables(
  genericPermissionQuery,
  'auth.getAccessContext',
)

type GenericUseAccessApi = ReturnType<typeof _genericAuth.useAccess>
type GenericGuardOptions = Parameters<typeof _genericAuth.useAuthGuard>[0]
type _genericPermissionKey = Assert<IsEqual<PermissionKey<GenericAccessContext>, string>>
type _genericCanParameter = Assert<
  IsEqual<Parameters<GenericUseAccessApi['can']>[0], PermissionKeyHandle<string>>
>
type _genericGuardPermissionKey = Assert<
  IsEqual<GenericGuardOptions['permission'], PermissionKeyHandle<string> | undefined>
>

const _identity = {} as AuthIdentity | null
void _identity
const toolSchema = defineArgs({
  args: {},
})

const _createTaskOperation = defineOperation({
  args: toolSchema.args,
  guard: createTaskPermission,
  handler: async (_ctx, _args, _loaded) => null,
})
void _createTaskOperation

// @ts-expect-error standalone MCP tools must declare a custom-tool effect
defineTool({
  schema: toolSchema,
  handler: async () => ({ ok: true }),
})

defineTool({
  schema: toolSchema,
  effect: 'read',
  auth: 'required',
  scoped: true,
  handler: async (_args, ctx) => {
    // @ts-expect-error standalone custom tools cannot call Convex mutations
    await ctx.mutation({} as never)
    // @ts-expect-error standalone custom tools cannot call Convex actions
    await ctx.action({} as never)
    return { ok: true }
  },
})

// @ts-expect-error scoped tools must require auth
defineTool({
  schema: toolSchema,
  effect: 'read',
  auth: 'optional',
  scoped: true,
  handler: async () => ({ ok: true }),
})

// @ts-expect-error scoped tools must require auth explicitly
defineTool({
  schema: toolSchema,
  effect: 'read',
  scoped: true,
  handler: async () => ({ ok: true }),
})

const testContext = createTestContext({ schema: {} as never })
void testContext
