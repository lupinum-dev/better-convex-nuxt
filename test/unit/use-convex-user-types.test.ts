import { describe, expect, it } from 'vitest'

import type { ConvexUser } from '../../src/module'
import type { ConvexUserState } from '../../src/runtime/composables/useConvexUser'

type IsEqual<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false
type Assert<T extends true> = T

type Profile = { authId: string; handle: string }
type UserState = ConvexUserState<Profile>

type _NoneStateHasNullData = Assert<IsEqual<Extract<UserState, { source: 'none' }>['data'], null>>
type _SessionStateHasSessionUser = Assert<
  IsEqual<Extract<UserState, { source: 'session' }>['data']['id'], string>
>
type _ProjectionStateHasProfile = Assert<
  IsEqual<Extract<UserState, { source: 'projection' }>['data'], Profile>
>
type _BetterAuthStateHasProfile = Assert<
  IsEqual<Extract<UserState, { source: 'better-auth' }>['data'], Profile>
>
type _ModuleEntrypointExportsConvexUser = Assert<IsEqual<ConvexUser['id'], string>>

describe('useConvexUser type contracts', () => {
  it('keeps source and data correlated through state', () => {
    expect(true).toBe(true)
  })
})
