export interface BetterAuthUserDocLike {
  _id: string
  name?: string | null
  email?: string | null
  image?: string | null
  [key: string]: unknown
}

export interface CreateUserSyncTriggersOptions<
  TCtx = {
    db: {
      insert: (table: string, value: Record<string, unknown>) => Promise<unknown>
      query: (table: string) => unknown
      patch: (id: unknown, value: Record<string, unknown>) => Promise<unknown>
      delete: (id: unknown) => Promise<unknown>
    }
  },
  TAuthUser extends BetterAuthUserDocLike = BetterAuthUserDocLike,
  TExistingUser extends { _id: unknown } = { _id: unknown },
> {
  /**
   * Convex table to sync Better Auth users into (for example: "users").
   */
  table: string
  /**
   * Index used to find the app user by Better Auth id (for example: "by_auth_id").
   */
  index: string
  /**
   * Field in your app user table storing the Better Auth user id (default: "authId").
   */
  authIdField?: string
  /**
   * Build the document inserted into your app user table on user creation.
   */
  createDoc: (args: {
    ctx: TCtx
    user: TAuthUser
    now: number
  }) => Record<string, unknown> | Promise<Record<string, unknown>>
  /**
   * Build a patch for app user updates. Return null/undefined to skip patching.
   */
  patchDoc?: (args: {
    ctx: TCtx
    user: TAuthUser
    previousUser: TAuthUser
    existing: TExistingUser
    now: number
  }) => Record<string, unknown> | null | undefined | Promise<Record<string, unknown> | null | undefined>
}

type ConvexQueryChain<TExistingUser> = {
  withIndex: (
    indexName: string,
    cb: (q: { eq: (field: string, value: unknown) => unknown }) => unknown,
  ) => { first: () => Promise<TExistingUser | null> }
}

async function findExistingByAuthId<TCtx, TExistingUser extends { _id: unknown }>(
  ctx: TCtx,
  options: Pick<CreateUserSyncTriggersOptions<TCtx, BetterAuthUserDocLike, TExistingUser>, 'table' | 'index' | 'authIdField'>,
  authUserId: string,
): Promise<TExistingUser | null> {
  const authIdField = options.authIdField ?? 'authId'
  const db = (ctx as { db: { query: (table: string) => ConvexQueryChain<TExistingUser> } }).db
  return await db
    .query(options.table)
    .withIndex(options.index, (q) => q.eq(authIdField, authUserId))
    .first()
}

/**
 * Creates Better Auth trigger handlers that sync auth users into a Convex app table.
 *
 * This intentionally scopes to CRUD sync boilerplate only. You still own your
 * Better Auth configuration, plugins, and Convex `createClient()` wiring.
 */
export function createUserSyncTriggers<
  TCtx = {
    db: {
      insert: (table: string, value: Record<string, unknown>) => Promise<unknown>
      query: (table: string) => unknown
      patch: (id: unknown, value: Record<string, unknown>) => Promise<unknown>
      delete: (id: unknown) => Promise<unknown>
    }
  },
  TAuthUser extends BetterAuthUserDocLike = BetterAuthUserDocLike,
  TExistingUser extends { _id: unknown } = { _id: unknown },
>(options: CreateUserSyncTriggersOptions<TCtx, TAuthUser, TExistingUser>) {
  return {
    user: {
      onCreate: async (ctx: TCtx, user: TAuthUser) => {
        const now = Date.now()
        const doc = await options.createDoc({ ctx, user, now })
        const db = (ctx as { db: { insert: (table: string, value: Record<string, unknown>) => Promise<unknown> } }).db
        await db.insert(options.table, doc)
      },
      onUpdate: async (ctx: TCtx, user: TAuthUser, previousUser: TAuthUser) => {
        if (!options.patchDoc) return

        const existing = await findExistingByAuthId(
          ctx,
          { table: options.table, index: options.index, authIdField: options.authIdField },
          user._id,
        )
        if (!existing) return

        const patch = await options.patchDoc({
          ctx,
          user,
          previousUser,
          existing: existing as TExistingUser,
          now: Date.now(),
        })
        if (!patch || Object.keys(patch).length === 0) return

        const db = (ctx as { db: { patch: (id: unknown, value: Record<string, unknown>) => Promise<unknown> } }).db
        await db.patch(existing._id, patch)
      },
      onDelete: async (ctx: TCtx, user: TAuthUser) => {
        const existing = await findExistingByAuthId(
          ctx,
          { table: options.table, index: options.index, authIdField: options.authIdField },
          user._id,
        )
        if (!existing) return

        const db = (ctx as { db: { delete: (id: unknown) => Promise<unknown> } }).db
        await db.delete(existing._id)
      },
    },
  }
}

