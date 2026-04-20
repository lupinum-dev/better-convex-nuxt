import * as z from 'zod'

export const createProjectInputSchema = z.object({
  name: z.string().trim().min(1, 'Project name is required').max(120, 'Keep the name short'),
  summary: z.string().trim().max(500, 'Keep the summary under 500 characters').optional(),
})
