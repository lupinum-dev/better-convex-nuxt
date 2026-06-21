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

  const { usePermissions, usePermissionGuard } = createPermissions<
    Permission,
    PermissionContext,
    PermissionResource
  >({
    query: api.auth.permissionContext,
    checkPermission: (ctx, permission, resource) =>
      ctx?.role === 'admin' || (permission === 'task.delete' && resource?.ownerId === ctx?.userId),
  })
  assertType<boolean>(usePermissions().can('task.create').value)
  await usePermissionGuard({ permission: 'task.delete', resource: { ownerId: 'user_1' } })

  createBetterConvexAuthClient<
    [
      ReturnType<typeof adminClient<Record<never, never>>>,
      ReturnType<typeof organizationClient<Record<never, never>>>,
      ReturnType<typeof apiKeyClient>,
    ]
  >()
}
