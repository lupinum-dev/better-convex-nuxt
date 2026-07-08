import type { apiKeyClient } from '@better-auth/api-key/client'
import type { adminClient, organizationClient } from 'better-auth/client/plugins'
import type { OptimisticLocalStore } from 'convex/browser'
import type { ComputedRef, Ref } from 'vue'

import { api } from '#convex/api'

type Permission = 'task.create' | 'task.delete'
type PermissionContext = { userId: string; role: 'admin' | 'member'; orgId?: string }
type PermissionResource = { ownerId?: string }

function assertType<T>(_value: T): void {}

export async function usePublicApiSurfaceContracts(file: File) {
  const auth = useConvexAuth()
  assertType<Ref<boolean>>(auth.isAuthenticated)

  const user = useConvexUser(api.auth.viewer)
  assertType<'none' | 'session' | 'better-auth' | 'projection'>(user.source.value)

  const direct = useConvexCall()
  assertType<string[]>(await direct.query(api.tasks.list))
  assertType<string>(await direct.mutation(api.tasks.create, { text: 'from smoke' }))
  assertType<{ ok: boolean }>(
    await direct.action(api.emails.send, { to: 'team@example.com', subject: 'Smoke' }),
  )

  const list = await useConvexQuery(api.tasks.list, {}, { initialData: [] })
  assertType<ComputedRef<boolean>>(list.isStale)
  assertType<string[]>(list.data.value ?? [])

  const skipped = await useConvexQuery(api.tasks.list, 'skip')
  assertType<'idle' | 'pending' | 'success' | 'error'>(skipped.status.value)

  const sharedList = defineSharedConvexQuery({
    key: 'consumer-smoke:tasks',
    query: api.tasks.list,
    args: {},
    options: { initialData: [] },
  })
  assertType<string[]>(sharedList().data.value ?? [])

  const paginated = await useConvexPaginatedQuery(
    api.tasks.listPaginated,
    {},
    { initialNumItems: 5 },
  )
  assertType<string[]>(paginated.results.value)
  assertType<boolean>(paginated.isStale.value)

  const createTask = useConvexMutation(api.tasks.create, {
    optimisticUpdate(store, args) {
      assertType<OptimisticLocalStore>(store)
      assertType<string>(args.text)
      updateQuery({
        query: api.tasks.list,
        args: {},
        store,
        updater: (current) => [...(current ?? []), args.text],
      })
      setQueryData({ query: api.tasks.list, args: {}, store, value: [args.text] })
      updateAllQueries({
        query: api.tasks.list,
        store,
        updater: (current) => current ?? [],
      })
      deleteFromQuery({
        query: api.tasks.list,
        args: {},
        store,
        shouldDelete: (item) => item === args.text,
      })
      insertAtTop({ query: api.tasks.listPaginated, store, item: args.text })
      insertAtPosition({
        query: api.tasks.listPaginated,
        store,
        item: args.text,
        sortOrder: 'asc',
        sortKeyFromItem: (item) => item,
      })
      insertAtBottomIfLoaded({ query: api.tasks.listPaginated, store, item: args.text })
      updateInPaginatedQuery({
        query: api.tasks.listPaginated,
        store,
        updateValue: (item) => (item === args.text ? item.toUpperCase() : item),
      })
      deleteFromPaginatedQuery({
        query: api.tasks.listPaginated,
        store,
        shouldDelete: (item) => item === args.text,
      })
    },
  })
  assertType<string>(await createTask({ text: 'callable' }))
  assertType<boolean>((await createTask.safe({ text: 'safe' })).ok)

  const sendEmail = useConvexAction(api.emails.send)
  assertType<{ ok: boolean }>(await sendEmail({ to: 'team@example.com', subject: 'Smoke' }))
  assertType<boolean>((await sendEmail.safe({ to: 'team@example.com', subject: 'Smoke' })).ok)

  const upload = useConvexFileUpload(api.files.generateUploadUrl)
  assertType<string>(await upload.upload(file))
  assertType<ComputedRef<string | null>>(useConvexStorageUrl(api.files.getUrl, upload.data))

  const queue = useConvexUploadQueue(api.files.generateUploadUrl)
  assertType<string[]>(await queue.enqueue(file))
  assertType<boolean>((await queue.enqueueSafe(file)).ok)

  const { usePermissions, usePermissionRedirect } = createPermissions<
    Permission,
    PermissionContext,
    PermissionResource
  >({
    query: api.auth.permissionContext,
    checkPermission: (ctx, permission, resource) =>
      ctx?.role === 'admin' || (permission === 'task.delete' && resource?.ownerId === ctx?.userId),
  })
  assertType<boolean>(usePermissions().can('task.create'))
  await usePermissionRedirect({ permission: 'task.delete', resource: { ownerId: 'user_1' } })

  createBetterConvexAuthClient<
    [
      ReturnType<typeof adminClient<Record<never, never>>>,
      ReturnType<typeof organizationClient<Record<never, never>>>,
      ReturnType<typeof apiKeyClient>,
    ]
  >()
}

/**
 * Negative-space call-arity contracts (F-5 / F-23). These calls must NOT
 * compile; reverting the conditional rest-tuple makes the `@ts-expect-error`
 * lines fail `check:consumer-smoke`. The function is never invoked at runtime.
 */
async function _requiredArgsContracts() {
  // --- useConvexQuery: required args must be required, wrong shape rejected ---
  // Positive: no-arg queries accept zero args.
  void useConvexQuery(api.tasks.list)
  // Positive: correct required args compile.
  void useConvexQuery(api.files.getUrl, { storageId: 'file_1' })
  // @ts-expect-error required args must not be omittable (F-5)
  void useConvexQuery(api.files.getUrl)
  // @ts-expect-error wrong arg shape must not compile (F-5)
  void useConvexQuery(api.files.getUrl, { wrong: 1 })

  // --- useConvexPaginatedQuery ---
  // Positive: paginated query with no extra args accepts zero args.
  void useConvexPaginatedQuery(api.tasks.listPaginated)
  // @ts-expect-error options object must not be accepted in the args slot (F-5 follow-up)
  void useConvexPaginatedQuery(api.tasks.listPaginated, { initialNumItems: 5 })
  // Positive: correct required extra args compile.
  void useConvexPaginatedQuery(api.tasks.listPaginatedByOwner, { owner: 'user_1' })
  // @ts-expect-error required paginated args must not be omittable (F-5)
  void useConvexPaginatedQuery(api.tasks.listPaginatedByOwner)
  // @ts-expect-error wrong paginated arg shape must not compile (F-5)
  void useConvexPaginatedQuery(api.tasks.listPaginatedByOwner, { wrong: 1 })

  // --- useConvexUser ---
  // Positive: no-arg canonical user query accepts zero args.
  void useConvexUser(api.auth.viewer)
  // @ts-expect-error required args must not be omittable (F-5)
  void useConvexUser(api.files.getUrl)
  // @ts-expect-error wrong arg shape must not compile (F-5)
  void useConvexUser(api.files.getUrl, { wrong: 1 })

  // --- defineSharedConvexQuery: args field conditionally required ---
  // Positive: no-arg query may omit the args field.
  defineSharedConvexQuery({ key: 'contract:list', query: api.tasks.list })
  // @ts-expect-error required args field must not be omittable (F-5)
  defineSharedConvexQuery({ key: 'contract:getUrl', query: api.files.getUrl })
  // @ts-expect-error wrong args field shape must not compile (F-5)
  defineSharedConvexQuery({ key: 'contract:getUrl', query: api.files.getUrl, args: { wrong: 1 } })

  // --- useConvexStorageUrl: query must accept { storageId } and return string | null (F-15) ---
  // Positive: correctly-typed getUrl query, with optional auth passthrough.
  void useConvexStorageUrl(api.files.getUrl, 'file_1')
  void useConvexStorageUrl(api.files.getUrl, 'file_1', { auth: 'auto' })
  // @ts-expect-error mistyped getUrl query (wrong args/return) must not compile (F-15)
  void useConvexStorageUrl(api.tasks.list, 'file_1')
}
