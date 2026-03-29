import { v } from 'convex/values'
import type { PropertyValidators } from 'convex/values'

import type { ConvexSchemaMetaFor } from '../../src/runtime/utils/define-convex-schema'

const createPostArgs = {
  title: v.string(),
  content: v.string(),
}
void createPostArgs

const validMeta = {
  description: 'Create a post',
  fields: {
    title: { description: 'Post title' },
    content: { description: 'Post content' },
  },
} satisfies ConvexSchemaMetaFor<typeof createPostArgs>

void validMeta

function acceptMeta<V extends PropertyValidators>(meta: ConvexSchemaMetaFor<V>) {
  return meta
}

acceptMeta<typeof createPostArgs>({
  // @ts-expect-error Missing content metadata when fields are provided.
  fields: {
    title: { description: 'Post title' },
  },
})

acceptMeta<typeof createPostArgs>({
  fields: {
    title: { description: 'Post title' },
    content: { description: 'Post content' },
    // @ts-expect-error Extra metadata keys must match validator keys exactly.
    summary: { description: 'Post summary' },
  },
})
