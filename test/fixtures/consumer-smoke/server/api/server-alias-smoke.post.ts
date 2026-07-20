import { api } from '#convex/api'
import { serverConvex } from '#convex/server'

export default defineEventHandler(async (event) => {
  const caller = serverConvex(event)
  const tasks = await caller.query(api.tasks.list, {})
  const createdTaskId = await caller.mutation(api.tasks.create, {
    text: 'created from server alias smoke',
  })

  return {
    createdTaskId,
    taskCount: tasks.length,
  }
})

/**
 * Negative-space call-arity contracts for the server caller.
 * These must NOT compile; reverting the exact-empty args tightening makes the
 * `@ts-expect-error` lines fail `check:consumer-smoke`. Never invoked.
 */
async function _serverRequiredArgsContracts(event: Parameters<typeof serverConvex>[0]) {
  const caller = serverConvex(event)
  // Positive: no-arg query requires an explicit `{}`.
  await caller.query(api.tasks.list, {})
  // Positive: correct required args compile.
  await caller.query(api.files.getUrl, { storageId: 'file_1' })
  // @ts-expect-error the args object is required, even for a no-arg query
  await caller.query(api.tasks.list)
  // @ts-expect-error `{}` must not satisfy a query with required args
  await caller.query(api.files.getUrl, {})
  // @ts-expect-error wrong arg shape must not compile
  await caller.query(api.files.getUrl, { wrong: 1 })
  // @ts-expect-error required mutation args are not omittable
  await caller.mutation(api.tasks.create)
}

/**
 * Public option shapes typecheck ("Final types"). Mutual exclusivity
 * and explicit-principal/auth-mode combinations are runtime validation, not
 * compile errors, so only the accepted shapes are asserted here.
 */
function _serverOptionContracts(event: Parameters<typeof serverConvex>[0]) {
  serverConvex(event, { auth: 'none' })
  serverConvex(event, { authToken: 'jwt' })
  serverConvex(event, { authToken: 'jwt', auth: 'required' })
  serverConvex(event, { credential: { type: 'cookie', value: 'better-auth.session_token=k' } })
  // @ts-expect-error Better Auth session tokens are not public bearer credentials
  serverConvex(event, { credential: { type: 'bearer', value: 'k' } })
}
