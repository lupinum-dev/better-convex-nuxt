/**
 * Why this file exists:
 * Upload URLs are a legitimate reason to use the unsafe Trellis handler builder.
 * This handler only needs "are you signed in?" because the actual file becomes tenant-scoped
 * later when another record attaches the returned storage id.
 */
import { requireAuth } from '@lupinum/trellis/auth'
import { unsafe as unsafePermit, type AppIdentityAccessor } from '@lupinum/trellis/backend'
import type { GenericMutationCtx } from 'convex/server'

import { generateUploadUrl as generateUploadUrlContract } from '../../../shared/features/files/contract'
import type { DataModel } from '../../_generated/dataModel'
import type { AppIdentity } from '../../auth/app-identity'
import { mutation } from '../../functions'

type Ctx = GenericMutationCtx<DataModel> & { appIdentity: AppIdentityAccessor<AppIdentity> }

export const generateUploadUrlMutation = mutation.unsafe({
  permit: unsafePermit.permit({
    kind: 'preTenantUpload',
    reason: 'Generate upload URLs before a concrete tenant-scoped record exists.',
    scope: ['files'],
  }),
  args: generateUploadUrlContract.args,
  handler: async (ctx: Ctx) => {
    const appIdentity = await ctx.appIdentity()
    requireAuth(appIdentity)
    return await (
      ctx as unknown as { storage: { generateUploadUrl(): Promise<string> } }
    ).storage.generateUploadUrl()
  },
})
