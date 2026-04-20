import * as z from 'zod'

export const runbookVisibilitySchema = z.enum(['public', 'workspace', 'draft'])

export const createRunbookInputSchema = z.object({
  title: z.string().trim().min(1, 'Title is required').max(160, 'Keep the title under 160 characters'),
  summary: z.string().trim().min(1, 'Summary is required').max(300, 'Keep the summary under 300 characters'),
  content: z.string().trim().min(1, 'Content is required'),
  visibility: runbookVisibilitySchema.optional(),
  tags: z.array(z.string().trim().min(1)).max(6, 'Use at most 6 tags').optional(),
})

export const updateRunbookInputSchema = createRunbookInputSchema.partial().extend({
  id: z.string().min(1, 'Runbook id is required'),
})
