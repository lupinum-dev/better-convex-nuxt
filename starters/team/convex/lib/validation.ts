import { ConvexError } from 'convex/values'
import type { z } from 'zod'

export function parseWithConvexError<TSchema extends z.ZodTypeAny>(
  schema: TSchema,
  input: unknown,
): z.infer<TSchema> {
  const result = schema.safeParse(input)
  if (!result.success) {
    throw new ConvexError(result.error.issues[0]?.message ?? 'Invalid input')
  }

  return result.data
}
