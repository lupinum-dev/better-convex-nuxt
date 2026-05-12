import { defineArgs } from '@lupinum/trellis/args'
import { defineOperationDescriptor, operationPreviewValidator } from '@lupinum/trellis/backend'
import { v } from 'convex/values'

export const runbookVisibilityValidator = v.union(
  v.literal('public'),
  v.literal('workspace'),
  v.literal('draft'),
)

export const createRunbook = defineArgs({
  description: 'Create a workspace runbook.',
  args: {
    title: v.string(),
    summary: v.string(),
    content: v.string(),
    visibility: v.optional(runbookVisibilityValidator),
    tags: v.optional(v.array(v.string())),
  },
  meta: {
    title: {
      label: 'Title',
      description: 'Runbook title shown in MCP results and the app UI.',
      examples: ['Incident handoff', 'Release checklist'],
    },
    summary: {
      label: 'Summary',
      description: 'Short one-line explanation of when to use the runbook.',
      examples: ['Steps for incident comms during the first 15 minutes.'],
    },
    content: {
      label: 'Content',
      description: 'Markdown body. Start with a heading for the cleanest MCP output.',
      examples: ['# Incident handoff\n\n1. Confirm severity\n2. Assign comms owner'],
    },
    visibility: {
      label: 'Visibility',
      description: 'Public runbooks are visible to unauthenticated MCP callers.',
      enum: ['public', 'workspace', 'draft'],
      defaultHint: 'draft',
    },
    tags: {
      label: 'Tags',
      description: 'Optional labels used for filtering and summarization.',
      examples: [['incident', 'ops']],
    },
  },
})

export const updateRunbook = defineArgs({
  description: 'Update an existing runbook.',
  args: {
    id: v.id('runbooks'),
    title: v.optional(v.string()),
    summary: v.optional(v.string()),
    content: v.optional(v.string()),
    visibility: v.optional(runbookVisibilityValidator),
    tags: v.optional(v.array(v.string())),
  },
})

export const deleteRunbook = defineArgs({
  description: 'Delete a runbook permanently.',
  args: {
    id: v.id('runbooks'),
  },
})

export const removeRunbookDescriptor = defineOperationDescriptor({
  id: 'runbooks.remove',
  name: 'removeRunbook',
  kind: 'destructive',
  args: deleteRunbook.args,
  permission: 'runbook.delete',
  safety: 'destructive-write',
  returns: v.null(),
  previewReturns: operationPreviewValidator({
    confirm: v.object({
      operation: v.literal('runbooks.remove'),
      targetId: v.id('runbooks'),
      affectedCounts: v.object({
        runbooks: v.number(),
      }),
    }),
  }),
})

export const bulkDeleteRunbooks = defineArgs({
  description: 'Delete multiple runbooks in one operation.',
  args: {
    ids: v.array(v.id('runbooks')),
  },
})

export const bulkRemoveRunbooksDescriptor = defineOperationDescriptor({
  id: 'runbooks.bulkRemove',
  name: 'bulkRemoveRunbooks',
  kind: 'destructive',
  args: bulkDeleteRunbooks.args,
  permission: 'runbook.bulkDelete',
  safety: 'destructive-write',
  returns: v.object({
    deleted: v.number(),
    skipped: v.array(
      v.object({
        id: v.string(),
        reason: v.string(),
      }),
    ),
    total: v.number(),
  }),
  previewReturns: operationPreviewValidator({
    confirm: v.object({
      operation: v.literal('runbooks.bulkRemove'),
      targetIds: v.array(v.id('runbooks')),
      affectedCounts: v.object({
        runbooks: v.number(),
      }),
    }),
  }),
})

export const searchRunbooks = defineArgs({
  description: 'Search runbooks by title, summary, content, or tags.',
  args: {
    term: v.string(),
  },
  meta: {
    term: {
      label: 'Search term',
      description: 'Keyword used to search runbook content.',
      examples: ['incident', 'release'],
    },
  },
})

export const getRunbook = defineArgs({
  description: 'Load one runbook by document id.',
  args: {
    id: v.id('runbooks'),
  },
})

export const listRunbooks = defineArgs({
  description: 'List runbooks in the current workspace or public catalog.',
  args: {},
})
