import { defineGuard } from '../../src/runtime/auth'
import { buildStructuredFunctions } from '../../src/runtime/functions/define-handler'

type Principal = { kind: 'anonymous' } | { kind: 'user'; userId: string }
type Actor = { userId: string; role: string } | null

type TestCtx = {
  principal: () => Promise<Principal>
  actor: () => Promise<Actor>
}

function createBuilder() {
  return (definition: {
    args: Record<string, unknown>
    handler: (ctx: TestCtx, args: Record<string, unknown>) => unknown
  }) => definition
}

const handlers = buildStructuredFunctions<TestCtx, TestCtx, Principal, Actor>(
  createBuilder(),
  createBuilder(),
)

const guard = defineGuard<Actor>('todo.read', (actor) => !!actor)

handlers.mutation({
  args: {},
  guard,
  load: async () => ({ todo: { ownerId: 'alice', title: 'Hello' } }),
  authorize: (loaded: { todo: { ownerId: string; title: string } }) =>
    defineGuard<NonNullable<Actor>>('todo.update', (actor) => actor.userId === loaded.todo.ownerId),
  handler: async () => null,
})

handlers.mutation({
  args: {},
  guard,
  load: async () => ({ todo: { ownerId: 'alice', title: 'Hello' } }),
  authorize: (actor: NonNullable<Actor>, loaded: { todo: { ownerId: string; title: string } }) =>
    actor.userId === loaded.todo.ownerId,
  handler: async () => null,
})

handlers.mutation({
  args: {},
  guard,
  load: async () => ({ todo: { ownerId: 'alice', title: 'Hello' } }),
  authorize: {
    label: 'todo.update',
    check: (actor, { todo }) => actor.userId === todo.ownerId,
  },
  handler: async () => null,
})
