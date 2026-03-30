import type { FunctionReference } from 'convex/server'

import type { Identity, Visibility } from '../../src/runtime/auth'
import {
  and,
  applyVisibility,
  can,
  deny,
  requirePrincipal,
  guard,
  verifyKey,
  defineVisibility,
} from '../../src/runtime/auth'
import type { PermissionKey } from '../../src/runtime/composables/usePermissions'
import { createAuth } from '../../src/runtime/composables/usePermissions'
import { createTestContext } from '../../src/runtime/testing'

type Assert<T extends true> = T
type IsEqual<A, B> =
  (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2)
    ? true
    : false

type Actor = { role: 'owner' | 'member'; userId: string; tenantId: string } | null
type ActorCheck = (actor: Actor) => boolean

const isOwner: ActorCheck = (actor: Actor) => !!actor && actor.role === 'owner'
const isMember: ActorCheck = (actor: Actor) => !!actor && actor.role === 'member'

const composed = and(isOwner, isMember)
const allowed = can({ role: 'owner', userId: 'u1', tenantId: 't1' }, composed)
void allowed

const requiredActor = {} as Actor
requirePrincipal(requiredActor)
type _requiredActor = Assert<IsEqual<typeof requiredActor, NonNullable<Actor>>>

deny('Blocked')
guard(null, 'Admin page', false)
verifyKey('a', 'b')

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

const permissionQuery =
  {} as FunctionReference<'query', 'public', Record<string, never>, PermissionContext | null>

const _auth = createAuth({
  query: permissionQuery,
})

type UsePermissionsApi = ReturnType<typeof _auth.usePermissions>
type GuardOptions = Parameters<typeof _auth.useAuthGuard>[0]
type _permissionKey = Assert<IsEqual<PermissionKey<PermissionContext>, 'task.create' | 'workspace.members'>>
type _ctxFromComposable = Assert<IsEqual<UsePermissionsApi['ctx']['value'], PermissionContext | null>>
type _roleFromComposable = Assert<IsEqual<UsePermissionsApi['role']['value'], PermissionContext['role'] | null>>
type _planFromComposable = Assert<IsEqual<UsePermissionsApi['plan']['value'], PermissionContext['plan'] | null>>
type _ctxDisplayName = Assert<IsEqual<NonNullable<UsePermissionsApi['ctx']['value']>['displayName'], string | null>>
type _ctxUsageCurrent = Assert<IsEqual<NonNullable<UsePermissionsApi['ctx']['value']>['usage']['projects']['current'], number>>
type _canParameter = Assert<IsEqual<Parameters<UsePermissionsApi['can']>[0], 'task.create' | 'workspace.members'>>
type _guardCanKey = Assert<IsEqual<GuardOptions['can'], 'task.create' | 'workspace.members' | undefined>>
type _guardCheck = Assert<IsEqual<GuardOptions['check'], ((ctx: PermissionContext) => boolean) | undefined>>

const _validGuardOptions: GuardOptions = {
  can: 'task.create',
  check: ctx => ctx.usage.projects.current > 0,
}
void _validGuardOptions

// @ts-expect-error invalid capability should not type-check
const _invalidGuardOptions: GuardOptions = { can: 'task.delete' }
void _invalidGuardOptions

type GenericPermissionContext = {
  can: Record<string, boolean>
}

const genericPermissionQuery =
  {} as FunctionReference<'query', 'public', Record<string, never>, GenericPermissionContext | null>

const _genericAuth = createAuth({
  query: genericPermissionQuery,
})

type GenericUsePermissionsApi = ReturnType<typeof _genericAuth.usePermissions>
type GenericGuardOptions = Parameters<typeof _genericAuth.useAuthGuard>[0]
type _genericPermissionKey = Assert<IsEqual<PermissionKey<GenericPermissionContext>, string>>
type _genericCanParameter = Assert<IsEqual<Parameters<GenericUsePermissionsApi['can']>[0], string>>
type _genericGuardCanKey = Assert<IsEqual<GenericGuardOptions['can'], string | undefined>>

const _identity = {} as Identity | null
void _identity
const _visibility = {} as Visibility<{ _id: string }, { userId: string }>
void _visibility

const testContext = createTestContext({ schema: {} as never })
void testContext
