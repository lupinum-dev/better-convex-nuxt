export interface BetterAuthUserDocLike {
  _id: string
  name?: string | null
  email?: string | null
  image?: string | null
  [key: string]: unknown
}

type UserSyncDb<TExistingUser extends { _id: unknown }> = {
  insert: (table: string, value: Record<string, unknown>) => Promise<unknown>
  query: (table: string) => ConvexQueryChain<TExistingUser>
  patch: (id: TExistingUser['_id'], value: Record<string, unknown>) => Promise<unknown>
  delete: (id: TExistingUser['_id']) => Promise<unknown>
}

type UserSyncCtx<TExistingUser extends { _id: unknown }> = {
  db: UserSyncDb<TExistingUser>
}

export interface CreateUserSyncTriggersOptions<
  TAuthUser extends BetterAuthUserDocLike = BetterAuthUserDocLike,
  TExistingUser extends { _id: unknown } = { _id: unknown },
  TCtx extends UserSyncCtx<TExistingUser> = UserSyncCtx<TExistingUser>,
> {
  /**
   * Convex table to project Better Auth users into (for example: "userProfiles").
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
  }) =>
    | Record<string, unknown>
    | null
    | undefined
    | Promise<Record<string, unknown> | null | undefined>
  /**
   * Build a patch for rebuild jobs when the projection row already exists.
   *
   * Existing rows are skipped during rebuild when this is omitted, which avoids
   * overwriting fields such as createdAt with insert-only values from createDoc.
   */
  rebuildDoc?: (args: {
    ctx: TCtx
    user: TAuthUser
    existing: TExistingUser
    now: number
  }) =>
    | Record<string, unknown>
    | null
    | undefined
    | Promise<Record<string, unknown> | null | undefined>
}

type ConvexQueryChain<TExistingUser> = {
  withIndex: (
    indexName: string,
    cb: (q: { eq: (field: string, value: unknown) => unknown }) => unknown,
  ) => { first: () => Promise<TExistingUser | null> }
}

export interface UserSyncRebuildResult {
  inserted: number
  patched: number
  skipped: number
}

async function findExistingByAuthId<
  TExistingUser extends { _id: unknown },
  TCtx extends UserSyncCtx<TExistingUser>,
>(
  ctx: { db: Pick<UserSyncDb<TExistingUser>, 'query'> },
  options: Pick<
    CreateUserSyncTriggersOptions<BetterAuthUserDocLike, TExistingUser, TCtx>,
    'table' | 'index' | 'authIdField'
  >,
  authUserId: string,
): Promise<TExistingUser | null> {
  const authIdField = options.authIdField ?? 'authId'
  return await ctx.db
    .query(options.table)
    .withIndex(options.index, (q) => q.eq(authIdField, authUserId))
    .first()
}

/**
 * Creates Better Auth trigger handlers that project auth users into a Convex app table.
 *
 * This intentionally scopes to user projection boilerplate only. Better Auth
 * remains the canonical source of auth truth; app tables created with this
 * helper must be treated as derived and rebuildable.
 */
export function createUserSyncTriggers<
  TAuthUser extends BetterAuthUserDocLike = BetterAuthUserDocLike,
  TExistingUser extends { _id: unknown } = { _id: unknown },
  TCtx extends UserSyncCtx<TExistingUser> = UserSyncCtx<TExistingUser>,
>(options: CreateUserSyncTriggersOptions<TAuthUser, TExistingUser, TCtx>) {
  return {
    user: {
      onCreate: async (ctx: TCtx, user: TAuthUser) => {
        const now = Date.now()
        const existing = await findExistingByAuthId(
          ctx,
          { table: options.table, index: options.index, authIdField: options.authIdField },
          user._id,
        )
        if (existing) return

        const doc = await options.createDoc({ ctx, user, now })
        await ctx.db.insert(options.table, doc)
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

        await ctx.db.patch(existing._id, patch)
      },
      onDelete: async (ctx: TCtx, user: TAuthUser) => {
        const existing = await findExistingByAuthId(
          ctx,
          { table: options.table, index: options.index, authIdField: options.authIdField },
          user._id,
        )
        if (!existing) return

        await ctx.db.delete(existing._id)
      },
      rebuild: async (ctx: TCtx, users: readonly TAuthUser[]): Promise<UserSyncRebuildResult> => {
        const result: UserSyncRebuildResult = { inserted: 0, patched: 0, skipped: 0 }

        for (const user of users) {
          const now = Date.now()
          const existing = await findExistingByAuthId(
            ctx,
            { table: options.table, index: options.index, authIdField: options.authIdField },
            user._id,
          )

          if (!existing) {
            const doc = await options.createDoc({ ctx, user, now })
            await ctx.db.insert(options.table, doc)
            result.inserted += 1
            continue
          }

          if (!options.rebuildDoc) {
            result.skipped += 1
            continue
          }

          const patch = await options.rebuildDoc({
            ctx,
            user,
            existing: existing as TExistingUser,
            now,
          })
          if (!patch || Object.keys(patch).length === 0) {
            result.skipped += 1
            continue
          }

          await ctx.db.patch(existing._id, patch)
          result.patched += 1
        }

        return result
      },
    },
  }
}
