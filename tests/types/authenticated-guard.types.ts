import { authRequired, defineGuard, open } from '../../src/runtime/auth'
import { buildStructuredFunctions } from '../../src/runtime/functions/define-handler'

type Assert<T extends true> = T
type IsEqual<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false

type Caller = { kind: 'anonymous' } | { kind: 'user'; userId: string }
type AppIdentity = { userId: string; role: 'admin' | 'member' } | null

type Ctx = {
  caller: () => Promise<Caller>
  appIdentity: () => Promise<AppIdentity>
}

function createBuilder() {
  return (definition: {
    args: Record<string, unknown>
    handler: (ctx: Ctx, args: Record<string, unknown>, loaded?: unknown) => unknown
  }) => definition
}

const handlers = buildStructuredFunctions<Ctx, Ctx, Caller, AppIdentity>(
  createBuilder(),
  createBuilder(),
)

handlers.query({
  args: {},
  guard: open,
  handler: async (_ctx) => {
    type CallerCheck = Assert<IsEqual<Awaited<ReturnType<typeof _ctx.caller>>, Caller>>
    type AppIdentityCheck = Assert<
      IsEqual<Awaited<ReturnType<typeof _ctx.appIdentity>>, AppIdentity>
    >
    void ({} as CallerCheck)
    void ({} as AppIdentityCheck)
    return null
  },
})

handlers.query({
  args: {},
  guard: authRequired,
  handler: async (_ctx) => {
    type CallerCheck = Assert<
      IsEqual<Awaited<ReturnType<typeof _ctx.caller>>, { kind: 'user'; userId: string }>
    >
    type AppIdentityCheck = Assert<
      IsEqual<Awaited<ReturnType<typeof _ctx.appIdentity>>, NonNullable<AppIdentity>>
    >
    void ({} as CallerCheck)
    void ({} as AppIdentityCheck)
    return null
  },
})

const canRead = defineGuard<AppIdentity>('read', (appIdentity) => !!appIdentity)

handlers.query({
  args: {},
  guard: canRead,
  handler: async (_ctx) => {
    type CallerCheck = Assert<
      IsEqual<Awaited<ReturnType<typeof _ctx.caller>>, { kind: 'user'; userId: string }>
    >
    type AppIdentityCheck = Assert<
      IsEqual<Awaited<ReturnType<typeof _ctx.appIdentity>>, NonNullable<AppIdentity>>
    >
    void ({} as CallerCheck)
    void ({} as AppIdentityCheck)
    return null
  },
})
