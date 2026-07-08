import type { FunctionArgs, FunctionReference, FunctionReturnType } from 'convex/server'
import type { ComputedRef, MaybeRefOrGetter } from 'vue'
import { computed } from 'vue'

import { toValue } from '#imports'

import type { ConvexQueryRest } from '../utils/args-tuple'
import type { ConvexCallStatus } from '../utils/types'
import { useConvexAuth, type ConvexUser } from './useConvexAuth'
import { createConvexQueryState, type ConvexQueryArgs } from './useConvexQuery'

export type ConvexUserSource = 'none' | 'session' | 'better-auth' | 'projection'
export type ConvexUserState<User> =
  | { source: 'none'; data: null }
  | { source: 'session'; data: ConvexUser }
  | { source: 'better-auth'; data: User }
  | { source: 'projection'; data: User }

export interface UseConvexUserOptions<RawUser, User = RawUser> {
  /**
   * Identifies the canonical source queried by this helper.
   * Use "better-auth" for component-owned Better Auth user helpers and
   * "projection" for explicitly derived, rebuildable app profile tables.
   *
   * @default "better-auth"
   */
  source?: Exclude<ConvexUserSource, 'none' | 'session'>
  /** Transform canonical/profile query output before exposing it. */
  transform?: (input: RawUser) => User
  /**
   * Seed UI with the session user while the canonical/profile query is loading.
   * The returned source remains "session" until the query resolves.
   *
   * @default true
   */
  seedFromSession?: boolean
  /**
   * Subscribe to canonical/profile updates with Convex WebSocket.
   *
   * @default true
   */
  subscribe?: boolean
}

export interface UseConvexUserReturn<User> {
  /** Canonical discriminated user state. `data` and `source` below are derived views. */
  state: ComputedRef<ConvexUserState<User>>
  data: ComputedRef<ConvexUser | User | null>
  pending: ComputedRef<boolean>
  status: ComputedRef<ConvexCallStatus>
  isStale: ComputedRef<boolean>
  error: ComputedRef<Error | null>
  source: ComputedRef<ConvexUserSource>
  refresh: () => Promise<void>
  clear: () => void
}

/**
 * Reads the current user from the auth session first, then upgrades to a
 * canonical Better Auth user helper or an explicit derived projection query.
 */
export function useConvexUser<
  Query extends FunctionReference<'query'>,
  Args extends FunctionArgs<Query> = FunctionArgs<Query>,
  User = FunctionReturnType<Query>,
>(
  query: Query,
  ...rest: ConvexQueryRest<
    FunctionArgs<Query>,
    MaybeRefOrGetter<Args>,
    UseConvexUserOptions<FunctionReturnType<Query>, User>
  >
): UseConvexUserReturn<User> {
  const [args, options = {}] = rest
  const auth = useConvexAuth()
  const seedFromSession = options.seedFromSession ?? true
  const canonicalSource = options.source ?? 'better-auth'

  const queryArgs = computed<ConvexQueryArgs<Args>>(() => {
    if (!auth.isAuthenticated.value) return 'skip'
    return args === undefined ? ({} as Args) : toValue(args)
  })

  const queryState = createConvexQueryState<Query, ConvexQueryArgs<Args>, User>(
    query,
    queryArgs,
    {
      server: false,
      subscribe: options.subscribe ?? true,
      keepPreviousData: false,
      transform: options.transform,
    },
    true,
  ).resultData

  const hasCanonicalUser = computed(
    () => auth.isAuthenticated.value && queryState.data.value != null,
  )

  const state = computed<ConvexUserState<User>>(() => {
    if (!auth.isAuthenticated.value) return { source: 'none', data: null }
    if (hasCanonicalUser.value) {
      return { source: canonicalSource, data: queryState.data.value as User }
    }
    if (seedFromSession && auth.user.value) {
      return { source: 'session', data: auth.user.value }
    }
    return { source: 'none', data: null }
  })
  const data = computed<ConvexUser | User | null>(() => state.value.data)
  const source = computed<ConvexUserSource>(() => state.value.source)

  const pending = computed(
    () => auth.isPending.value || (auth.isAuthenticated.value && queryState.pending.value),
  )
  const status = computed<ConvexCallStatus>(() => {
    if (!auth.isAuthenticated.value) return 'idle'
    if (queryState.status.value === 'error') return 'error'
    if (pending.value) return 'pending'
    return data.value ? 'success' : 'idle'
  })

  return {
    state,
    data,
    pending,
    status,
    isStale: queryState.isStale,
    error: queryState.error,
    source,
    refresh: queryState.refresh,
    clear: queryState.clear,
  }
}
