import type { FunctionReference } from 'convex/server'

import type { Identity, Visibility } from '../../src/runtime/auth'
import {
  and,
  applyVisibility,
  can,
  deny,
  guard,
  verifyKey,
  defineVisibility,
} from '../../src/runtime/auth'
import { createAuth } from '../../src/runtime/composables/usePermissions'
import { createTestContext } from '../../src/runtime/testing'

type Assert<T extends true> = T
type IsEqual<A, B> =
  (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2)
    ? true
    : false
type Extends<A, B> = A extends B ? true : false

type Actor = { role: 'owner' | 'member'; userId: string; tenantId: string } | null
type ActorCheck = (actor: Actor) => boolean

const isOwner: ActorCheck = (actor: Actor) => !!actor && actor.role === 'owner'
const isMember: ActorCheck = (actor: Actor) => !!actor && actor.role === 'member'

const composed = and(isOwner, isMember)
const allowed = can({ role: 'owner', userId: 'u1', tenantId: 't1' }, composed)
void allowed

deny('Blocked')
guard(null, 'Admin page', false)
verifyKey('a', 'b')

const visibility = defineVisibility(async () => [{ _id: '1' }])
void applyVisibility(visibility, { userId: 'u1' }, {} as never)

const permissionQuery =
  {} as FunctionReference<'query', 'public', Record<string, never>, {
    role: 'owner' | 'member'
    plan: 'free' | 'pro'
    userId: string
    tenantId: string
    can: Record<'task.create' | 'workspace.members', boolean>
  } | null>

const auth = createAuth({
  query: permissionQuery,
})

type UsePermissionsApi = ReturnType<typeof auth.usePermissions>
type GuardOptions = Parameters<typeof auth.useAuthGuard>[0]
type _roleFromComposable = Assert<Extends<UsePermissionsApi['role']['value'], string | null | undefined>>
type _planFromComposable = Assert<Extends<UsePermissionsApi['plan']['value'], string | null | undefined>>
type _guardCanKey = Assert<IsEqual<GuardOptions['can'], string | undefined>>
type _guardCheck = Assert<IsEqual<GuardOptions['check'], ((ctx: import('../../src/runtime/composables/usePermissions').AuthContext) => boolean) | undefined>>

const _identity = {} as Identity | null
void _identity
const _visibility = {} as Visibility<{ _id: string }, { userId: string }>
void _visibility

const testContext = createTestContext({ schema: {} as never })
void testContext
