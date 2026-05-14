/**
 * Why this file exists:
 * Upload URLs are a legitimate reason to use the unsafe Trellis handler builder.
 * This handler only needs "are you signed in?" because the actual file becomes workspace-scoped
 * later when comments attach the returned storage id.
 */
import { requireAuth } from '@lupinum/trellis/auth'
import { unsafe as unsafePermit } from '@lupinum/trellis/backend'

import { generateUploadUrl } from '../../../shared/features/files/contract'
import { getAppIdentity } from '../../auth/appIdentity'
import { mutation } from '../../functions'

export const generateUploadUrlMutation = mutation.unsafe({
  permit: unsafePermit.permit({
    kind: 'preTenantUpload',
    reason: 'Generate upload URLs before a concrete tenant-scoped record exists.',
    scope: ['files'],
  }),
  args: generateUploadUrl.args,
  handler: async (ctx) => {
    const appIdentity = await getAppIdentity(ctx)
    requireAuth(appIdentity)
    return await (
      ctx as unknown as { storage: { generateUploadUrl(): Promise<string> } }
    ).storage.generateUploadUrl()
  },
})
