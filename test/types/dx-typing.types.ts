import type { FunctionReference } from 'convex/server'

import type { Check, Denial, Identity, Visibility } from '../../src/runtime/auth'
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

type Actor = { role: 'owner' | 'member'; userId: string; tenantId: string } | null
type _checkType = Assert<IsEqual<Check<Actor>, (principal: Actor) => boolean | Denial>>

const isOwner: Check<Actor> = (actor) => !!actor && actor.role === 'owner'
const isMember: Check<Actor> = (actor) => !!actor && actor.role === 'member'

const composed = and(isOwner, isMember)
const allowed = can({ role: 'owner', userId: 'u1', tenantId: 't1' }, composed)
void allowed

guard(null, 'Admin page', deny('Blocked'))
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
type _roleFromComposable = Assert<IsEqual<UsePermissionsApi['role']['value'], 'owner' | 'member' | null>>
type _planFromComposable = Assert<IsEqual<UsePermissionsApi['plan']['value'], 'free' | 'pro' | null>>
type _guardCanKey = Assert<IsEqual<GuardOptions['can'], string>>

const _identity = {} as Identity | null
void _identity
const _visibility = {} as Visibility<{ _id: string }, { userId: string }>
void _visibility

const testContext = createTestContext({ schema: {} as never })
void testContext
