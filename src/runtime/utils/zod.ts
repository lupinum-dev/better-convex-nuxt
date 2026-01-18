/**
 * Zod validation utilities for Convex functions.
 *
 * Re-exports from convex-helpers for seamless Zod integration with Convex.
 * Use these to define Convex functions with Zod schemas as the source of truth.
 *
 * @example Server-side (Convex mutation with Zod)
 * ```ts
 * // convex/tasks.ts
 * import { zCustomMutation, NoOp } from 'better-convex-nuxt/zod'
 * import { mutation } from './_generated/server'
 * import { z } from 'zod'
 *
 * const zMutation = zCustomMutation(mutation, NoOp)
 *
 * export const create = zMutation({
 *   args: {
 *     title: z.string().min(3),
 *     priority: z.enum(['low', 'medium', 'high']),
 *   },
 *   handler: async (ctx, args) => {
 *     // args is fully typed from Zod schema
 *     // Dashboard shows proper argument types
 *     return ctx.db.insert('tasks', args)
 *   },
 * })
 * ```
 *
 * @example Shared schema pattern
 * ```ts
 * // shared/schemas/task.ts
 * import { z } from 'zod'
 *
 * export const createTaskSchema = z.object({
 *   title: z.string().min(3),
 *   priority: z.enum(['low', 'medium', 'high']),
 * })
 *
 * export type CreateTaskInput = z.infer<typeof createTaskSchema>
 * ```
 *
 * @example Converting Zod to Convex validators
 * ```ts
 * import { zodToConvex } from 'better-convex-nuxt/zod'
 * import { z } from 'zod'
 *
 * const zodSchema = z.object({
 *   name: z.string(),
 *   age: z.number().min(0),
 * })
 *
 * // Convert to Convex validator for use in defineTable, etc.
 * const convexValidator = zodToConvex(zodSchema)
 * ```
 *
 * @packageDocumentation
 */

// Re-export Zod custom function builders
export {
  zCustomQuery,
  zCustomMutation,
  zCustomAction,
} from 'convex-helpers/server/zod4'

// Re-export Zod → Convex conversion utilities
export {
  zodToConvex,
  zodToConvexFields,
  zodOutputToConvex,
  zodOutputToConvexFields,
} from 'convex-helpers/server/zod4'

// Re-export Convex → Zod conversion utilities
export {
  convexToZod,
  convexToZodFields,
} from 'convex-helpers/server/zod4'

// Re-export ID and helper utilities
export {
  zid,
  withSystemFields,
} from 'convex-helpers/server/zod4'

// Re-export NoOp for simple usage without customization
export { NoOp } from 'convex-helpers/server/customFunctions'

// Re-export Standard Schema utility (converts Convex validators to Standard Schema)
export { toStandardSchema } from 'convex-helpers/standardSchema'

// Re-export useful types
export type {
  CustomBuilder,
  ZCustomCtx,
  ConvexValidatorFromZod,
  ConvexValidatorFromZodOutput,
  ZodValidatorFromConvex,
  Zid,
} from 'convex-helpers/server/zod4'
