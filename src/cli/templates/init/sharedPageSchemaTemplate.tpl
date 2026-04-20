import * as z from 'zod'

const slugSchema = z
  .string()
  .trim()
  .min(1, 'Slug is required')
  .max(120, 'Keep the slug under 120 characters')
  .regex(/^[a-z0-9-]+$/, 'Use lowercase letters, numbers, and dashes only')

const titleSchema = z
  .string()
  .trim()
  .min(1, 'Title is required')
  .max(160, 'Keep the title under 160 characters')

export const createPageInputSchema = z.object({
  slug: slugSchema,
  title: titleSchema,
  draftBody: z.string().optional().default(''),
})

export const saveDraftInputSchema = createPageInputSchema.extend({
  id: z.string().min(1, 'Page id is required'),
  draftBody: z.string(),
})
