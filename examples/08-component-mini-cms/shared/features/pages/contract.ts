import { defineArgs } from '@lupinum/trellis/args'
import { defineOperationDescriptor, operationPreviewValidator } from '@lupinum/trellis/backend'
import { v } from 'convex/values'

export const pageStatusValidator = v.union(v.literal('draft'), v.literal('published'))

export const publishedPageValidator = v.object({
  _id: v.string(),
  slug: v.string(),
  title: v.string(),
  body: v.string(),
  status: pageStatusValidator,
  updatedAt: v.number(),
  publishedAt: v.union(v.number(), v.null()),
  authorId: v.string(),
})

export const studioPageValidator = v.object({
  _id: v.string(),
  slug: v.string(),
  title: v.string(),
  draftBody: v.string(),
  publishedBody: v.string(),
  status: pageStatusValidator,
  updatedAt: v.number(),
  publishedAt: v.union(v.number(), v.null()),
  authorId: v.string(),
})

export const publishPreviewValidator = v.object({
  summary: v.string(),
  warn: v.optional(v.string()),
  blocked: v.optional(v.boolean()),
  affects: v.optional(
    v.object({
      pages: v.number(),
    }),
  ),
})

export const listPublishedPages = defineArgs({
  description: 'List all published pages',
  args: {},
})

export const getPublishedPage = defineArgs({
  description: 'Get one published page by slug',
  args: {
    slug: v.string(),
  },
})

export const listStudioPages = defineArgs({
  description: 'List all pages visible in the studio',
  args: {},
})

export const listDraftPages = defineArgs({
  description: 'List draft pages for MCP tooling',
  args: {},
})

export const createPage = defineArgs({
  description: 'Create a new page draft',
  args: {
    slug: v.string(),
    title: v.string(),
    draftBody: v.optional(v.string()),
  },
})

export const saveDraft = defineArgs({
  description: 'Save changes to an existing page draft',
  args: {
    id: v.string(),
    slug: v.string(),
    title: v.string(),
    draftBody: v.string(),
  },
})

export const publishPage = defineArgs({
  description: 'Publish a page draft',
  args: {
    id: v.string(),
  },
})

export const publishPageDescriptor = defineOperationDescriptor({
  id: 'pages.publish',
  name: 'publishPage',
  kind: 'destructive',
  args: publishPage.args,
  permission: 'publishPage',
  safety: 'external-side-effect',
  returns: v.object({
    pageId: v.string(),
    published: v.boolean(),
  }),
  previewReturns: operationPreviewValidator({
    details: publishPreviewValidator,
    confirm: v.object({
      operation: v.literal('pages.publish'),
      targetId: v.string(),
      affectedCounts: v.object({
        pages: v.number(),
      }),
    }),
  }),
})
