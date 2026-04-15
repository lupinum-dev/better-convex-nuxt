import { authenticated, defineGuard, open } from '../../src/runtime/auth'
import { buildStructuredFunctions } from '../../src/runtime/functions/define-handler'

type Assert<T extends true> = T
type IsEqual<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false

type Principal = { kind: 'anonymous' } | { kind: 'user'; userId: string }
type Actor = { userId: string; role: 'admin' | 'member' } | null

type Ctx = {
  principal: () => Promise<Principal>
  actor: () => Promise<Actor>
}

function createBuilder() {
  return (definition: {
    args: Record<string, unknown>
    handler: (ctx: Ctx, args: Record<string, unknown>, loaded?: unknown) => unknown
  }) => definition
}

const handlers = buildStructuredFunctions<Ctx, Ctx, Principal, Actor>(
  createBuilder(),
  createBuilder(),
)

handlers.query({
  args: {},
  guard: open,
  handler: async (ctx) => {
    const principal = await ctx.principal()
    const actor = await ctx.actor()
    type _principal = Assert<IsEqual<typeof principal, Principal>>
    type _actor = Assert<IsEqual<typeof actor, Actor>>
    void ({} as _principal)
    void ({} as _actor)
    return null
  },
})

handlers.query({
  args: {},
  guard: authenticated,
  handler: async (ctx) => {
    const principal = await ctx.principal()
    const actor = await ctx.actor()
    type _principal = Assert<IsEqual<typeof principal, { kind: 'user'; userId: string }>>
    type _actor = Assert<IsEqual<typeof actor, Actor>>
    void ({} as _principal)
    void ({} as _actor)
    return null
  },
})

const canRead = defineGuard<Actor>('read', (actor) => !!actor)

handlers.query({
  args: {},
  guard: canRead,
  handler: async (ctx) => {
    const principal = await ctx.principal()
    const actor = await ctx.actor()
    type _principal = Assert<IsEqual<typeof principal, { kind: 'user'; userId: string }>>
    type _actor = Assert<IsEqual<typeof actor, NonNullable<Actor>>>
    void ({} as _principal)
    void ({} as _actor)
    return null
  },
})
