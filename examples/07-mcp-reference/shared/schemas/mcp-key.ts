import * as z from 'zod'

export const createMcpKeyInputSchema = z.object({
  name: z.string().trim().min(1, 'Key name is required').max(120, 'Keep the key name under 120 characters'),
  boundAuthId: z.string().min(1, 'Bound auth id is required'),
  prefix: z.string().min(1, 'Prefix is required'),
  hash: z.string().min(1, 'Hash is required'),
})

export const revokeMcpKeyInputSchema = z.object({
  id: z.string().min(1, 'Key id is required'),
})
