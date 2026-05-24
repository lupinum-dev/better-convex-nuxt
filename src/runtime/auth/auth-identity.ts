import type {
  GenericActionCtx,
  GenericDataModel,
  GenericMutationCtx,
  GenericQueryCtx,
} from 'convex/server'
import { ConvexError } from 'convex/values'

type AnyCtx<DataModel extends GenericDataModel = GenericDataModel> =
  | GenericQueryCtx<DataModel>
  | GenericMutationCtx<DataModel>
  | GenericActionCtx<DataModel>

export type AuthIdentity = {
  authKey: string
  providerSubject: string
  email?: string
  displayName?: string
  avatarUrl?: string
}

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value : undefined
}

/**
 * Read the authenticated identity from Convex.
 *
 * `authKey` is intentionally Convex's stable `tokenIdentifier`; it is the only
 * key Trellis stores on the app `users` table. Provider/component ids remain
 * auth-provider data and must not become app foreign keys.
 */
export async function getAuth<DataModel extends GenericDataModel>(
  ctx: AnyCtx<DataModel>,
): Promise<AuthIdentity | null> {
  const identity = await ctx.auth.getUserIdentity()
  if (!identity) return null

  const authKey = optionalString((identity as { tokenIdentifier?: unknown }).tokenIdentifier)
  if (!authKey) {
    throw new ConvexError({
      code: 'FORBIDDEN' as const,
      category: 'auth',
      message:
        'Authenticated Convex identity is missing tokenIdentifier. Trellis uses tokenIdentifier as users.authKey.',
    })
  }

  const providerSubject = optionalString((identity as { subject?: unknown }).subject)
  if (!providerSubject) {
    throw new ConvexError({
      code: 'FORBIDDEN' as const,
      category: 'auth',
      message: 'Authenticated Convex identity is missing subject.',
    })
  }

  const email = optionalString((identity as { email?: unknown }).email)
  const displayName = optionalString((identity as { name?: unknown }).name)
  const avatarUrl =
    optionalString((identity as { picture?: unknown; image?: unknown }).picture) ??
    optionalString((identity as { picture?: unknown; image?: unknown }).image)

  return {
    authKey,
    providerSubject,
    ...(email ? { email } : {}),
    ...(displayName ? { displayName } : {}),
    ...(avatarUrl ? { avatarUrl } : {}),
  }
}
