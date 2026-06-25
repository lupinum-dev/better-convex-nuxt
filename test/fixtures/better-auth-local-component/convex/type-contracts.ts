import type { DataModelFromSchemaDefinition } from 'convex/server'

import { authComponent, createAuth } from './auth'
import type schema from './betterAuth/schema'

type Assert<T extends true> = T
type HasTable<T, K extends PropertyKey> = K extends keyof T ? true : false

type BetterAuthDataModel = DataModelFromSchemaDefinition<typeof schema>

type _HasAdminUserFields = Assert<
  'role' extends keyof BetterAuthDataModel['user']['document'] ? true : false
>
type _HasOrganizationTable = Assert<HasTable<BetterAuthDataModel, 'organization'>>
type _HasMemberTable = Assert<HasTable<BetterAuthDataModel, 'member'>>
type _HasInvitationTable = Assert<HasTable<BetterAuthDataModel, 'invitation'>>
type _HasApiKeyTable = Assert<HasTable<BetterAuthDataModel, 'apikey'>>

export async function assertLocalComponentHelpersCompile(
  ctx: Parameters<typeof createAuth>[0],
) {
  const { auth, headers } = await authComponent.getAuth(createAuth, ctx)
  const user = await authComponent.safeGetAuthUser(ctx)

  return {
    auth,
    headers,
    user,
  }
}
