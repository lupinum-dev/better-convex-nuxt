import { api } from '#convex/api'
import { serverConvexMutation, serverConvexQuery } from '#convex/server'

export default defineEventHandler(async (event) => {
  const tasks = await serverConvexQuery(event, api.tasks.list, {})
  const createdTaskId = await serverConvexMutation(event, api.tasks.create, {
    text: 'created from server alias smoke',
  })

  return {
    createdTaskId,
    taskCount: tasks.length,
  }
})

/**
 * Negative-space call-arity contracts (F-5 / F-23) for the server helpers.
 * These must NOT compile; reverting the conditional rest-tuple makes the
 * `@ts-expect-error` lines fail `check:consumer-smoke`. Never invoked.
 */
async function _serverRequiredArgsContracts(event: Parameters<typeof serverConvexQuery>[0]) {
  // Positive: no-arg query accepts zero args.
  await serverConvexQuery(event, api.tasks.list)
  // Positive: correct required args compile.
  await serverConvexQuery(event, api.files.getUrl, { storageId: 'file_1' })
  // @ts-expect-error required args must not be omittable (F-5)
  await serverConvexQuery(event, api.files.getUrl)
  // @ts-expect-error wrong arg shape must not compile (F-5)
  await serverConvexQuery(event, api.files.getUrl, { wrong: 1 })
  // @ts-expect-error required mutation args must not be omittable (F-5)
  await serverConvexMutation(event, api.tasks.create)
}
