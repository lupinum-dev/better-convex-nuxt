import type { FunctionReference } from 'convex/server'

import { defineArgs } from '../../src/runtime/args'
import type { AuthIdentity } from '../../src/runtime/auth'
import { enforce, can, deny, requireAuth, and } from '../../src/runtime/auth'
import type { PermissionKey } from '../../src/runtime/composables/configured-permissions'
import { createConfiguredPermissionsComposables } from '../../src/runtime/composables/configured-permissions'
import { defineTool } from '../../src/runtime/mcp'
import { createTestContext } from '../../src/runtime/testing'
import { verifyTrustedCallerKey } from '../../src/runtime/trusted-caller'
import type { Visibility } from '../../src/runtime/visibility'
import { applyVisibility, defineVisibility } from '../../src/runtime/visibility'

type Assert<T extends true> = T
type IsEqual<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false

type Actor = { role: 'owner' | 'member'; userId: string; tenantId: string } | null
type ActorCheck = (actor: Actor) => boolean

const isOwner: ActorCheck = (actor: Actor) => !!actor && actor.role === 'owner'
const isMember: ActorCheck = (actor: Actor) => !!actor && actor.role === 'member'

const composed = and(isOwner, isMember)
const allowed = can({ role: 'owner', userId: 'u1', tenantId: 't1' }, composed)
void allowed

const requiredActor = {} as Actor
requireAuth(requiredActor)
type _requiredActor = Assert<IsEqual<typeof requiredActor, NonNullable<Actor>>>

deny('Blocked', { source: 'dx-typing' })
enforce(null, 'Admin page', false)
verifyTrustedCallerKey('a', 'b')

const visibility = defineVisibility(async () => [{ _id: '1' }])
void applyVisibility(visibility, { userId: 'u1' }, {} as never)

type PermissionContext = {
  role: 'owner' | 'member'
  plan: 'free' | 'pro'
  userId: string
  tenantId: string
  displayName: string | null
  usage: { projects: { current: number } }
  can: Record<'task.create' | 'workspace.members', boolean>
}

const permissionQuery = {} as FunctionReference<
  'query',
  'public',
  Record<string, never>,
  PermissionContext | null
>

const _auth = createConfiguredPermissionsComposables(
  permissionQuery,
  'workspaces.getPermissionContext',
)

type UsePermissionsApi = ReturnType<typeof _auth.usePermissions>
type GuardOptions = Parameters<typeof _auth.useAuthGuard>[0]
type _permissionKey = Assert<
  IsEqual<PermissionKey<PermissionContext>, 'task.create' | 'workspace.members'>
>
type _ctxFromComposable = Assert<
  IsEqual<UsePermissionsApi['ctx']['value'], PermissionContext | null>
>
type _roleFromComposable = Assert<
  IsEqual<UsePermissionsApi['role']['value'], PermissionContext['role'] | null>
>
type _planFromComposable = Assert<
  IsEqual<UsePermissionsApi['plan']['value'], PermissionContext['plan'] | null>
>
type _ctxDisplayName = Assert<
  IsEqual<NonNullable<UsePermissionsApi['ctx']['value']>['displayName'], string | null>
>
type _ctxUsageCurrent = Assert<
  IsEqual<NonNullable<UsePermissionsApi['ctx']['value']>['usage']['projects']['current'], number>
>
type _allowsParameter = Assert<
  IsEqual<Parameters<UsePermissionsApi['allows']>[0], 'task.create' | 'workspace.members'>
>
type _guardPermissionKey = Assert<
  IsEqual<GuardOptions['permission'], 'task.create' | 'workspace.members' | undefined>
>
type _guardCheck = Assert<
  IsEqual<GuardOptions['check'], ((ctx: PermissionContext) => boolean) | undefined>
>

const _validGuardOptions: GuardOptions = {
  permission: 'task.create',
  check: (ctx) => ctx.usage.projects.current > 0,
}
void _validGuardOptions

// @ts-expect-error invalid capability should not type-check
const _invalidGuardOptions: GuardOptions = { permission: 'task.delete' }
void _invalidGuardOptions

type GenericPermissionContext = {
  can: Record<string, boolean>
}

const genericPermissionQuery = {} as FunctionReference<
  'query',
  'public',
  Record<string, never>,
  GenericPermissionContext | null
>

const _genericAuth = createConfiguredPermissionsComposables(
  genericPermissionQuery,
  'auth.getPermissionContext',
)

type GenericUsePermissionsApi = ReturnType<typeof _genericAuth.usePermissions>
type GenericGuardOptions = Parameters<typeof _genericAuth.useAuthGuard>[0]
type _genericPermissionKey = Assert<IsEqual<PermissionKey<GenericPermissionContext>, string>>
type _genericAllowsParameter = Assert<
  IsEqual<Parameters<GenericUsePermissionsApi['allows']>[0], string>
>
type _genericGuardPermissionKey = Assert<
  IsEqual<GenericGuardOptions['permission'], string | undefined>
>

const _identity = {} as AuthIdentity | null
void _identity
const _visibility = {} as Visibility<{ _id: string }, { userId: string }>
void _visibility

const toolSchema = defineArgs({
  args: {},
})

defineTool({
  schema: toolSchema,
  auth: 'required',
  scoped: true,
  handler: async () => ({ ok: true }),
})

// @ts-expect-error scoped tools must require auth
defineTool({
  schema: toolSchema,
  auth: 'optional',
  scoped: true,
  handler: async () => ({ ok: true }),
})

// @ts-expect-error scoped tools must require auth explicitly
defineTool({
  schema: toolSchema,
  scoped: true,
  handler: async () => ({ ok: true }),
})

const testContext = createTestContext({ schema: {} as never })
void testContext
