/**
 * Why this file exists:
 * Upload URLs and storage lookups are a legitimate reason to use the raw Convex escape hatch.
 * The board app still stays on the builder surface; it just opts into raw storage APIs here.
 */
import { v } from 'convex/values'

import {
  authedMutation,
  publicQuery,
} from './functions'

export const generateUploadUrl = authedMutation({
  args: {},
  handler: async ({ raw }) => {
    return await raw.ctx.storage.generateUploadUrl()
  },
})

export const getUrl = publicQuery({
  args: { storageId: v.id('_storage') },
  handler: async ({ raw }, args) => {
    return await raw.ctx.storage.getUrl(args.storageId)
  },
})
