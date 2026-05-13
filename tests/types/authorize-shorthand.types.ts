import { defineGuard } from '../../src/runtime/auth'
import { buildStructuredFunctions } from '../../src/runtime/functions/define-handler'

type Caller = { kind: 'anonymous' } | { kind: 'user'; userId: string }
type AppIdentity = { userId: string; role: string } | null

type TestCtx = {
  caller: () => Promise<Caller>
  appIdentity: () => Promise<AppIdentity>
}

function createBuilder() {
  return (definition: {
    args: Record<string, unknown>
    handler: (ctx: TestCtx, args: Record<string, unknown>) => unknown
  }) => definition
}

const handlers = buildStructuredFunctions<TestCtx, TestCtx, Caller, AppIdentity>(
  createBuilder(),
  createBuilder(),
)

const guard = defineGuard<AppIdentity>('todo.read', (appIdentity) => !!appIdentity)

handlers.mutation({
  args: {},
  guard,
  load: async () => ({ todo: { ownerId: 'alice', title: 'Hello' } }),
  authorize: {
    label: 'todo.update',
    check: (_actor, loaded: { todo: { ownerId: string; title: string } }) =>
      defineGuard<NonNullable<AppIdentity>>(
        'todo.update',
        (appIdentity) => appIdentity.userId === loaded.todo.ownerId,
      ),
  },
  handler: async () => null,
})

handlers.mutation({
  args: {},
  guard,
  load: async () => ({ todo: { ownerId: 'alice', title: 'Hello' } }),
  authorize: (
    appIdentity: NonNullable<AppIdentity>,
    loaded: { todo: { ownerId: string; title: string } },
  ) => appIdentity.userId === loaded.todo.ownerId,
  handler: async () => null,
})

handlers.mutation({
  args: {},
  guard,
  load: async () => ({ todo: { ownerId: 'alice', title: 'Hello' } }),
  authorize: {
    label: 'todo.update',
    check: (appIdentity, { todo }) => appIdentity.userId === todo.ownerId,
  },
  handler: async () => null,
})
