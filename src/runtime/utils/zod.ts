import type { z } from 'zod'

/**
 * Validation error structure returned by validateZodInput
 */
export interface ZodValidationError {
  /** Error code for programmatic handling */
  code: 'VALIDATION_ERROR'
  /** Human-readable error message */
  message: string
  /** Individual validation issues from Zod */
  issues: Array<{
    path: PropertyKey[]
    message: string
    code: string
  }>
}

/**
 * Options for validateZodInput
 */
export interface ValidateZodOptions {
  /**
   * Custom error message prefix.
   * @default 'Validation failed'
   */
  errorPrefix?: string
}

/**
 * Validate input against a Zod schema in Convex functions.
 *
 * Use this in your Convex mutations, queries, and actions to validate
 * input that was passed as `v.any()`. Throws a structured error if
 * validation fails.
 *
 * @example
 * ```typescript
 * // convex/tasks.ts
 * import { validateZodInput } from 'better-convex-nuxt/zod'
 * import { addTaskInputSchema } from '../shared/schemas/task.schema'
 *
 * export const add = mutation({
 *   args: { input: v.any() },
 *   handler: async (ctx, args) => {
 *     // Validates and returns typed data
 *     const validated = validateZodInput(args.input, addTaskInputSchema)
 *
 *     // validated.title is fully typed!
 *     return ctx.db.insert('tasks', {
 *       title: validated.title,
 *       completed: false,
 *     })
 *   }
 * })
 * ```
 *
 * @param input - The raw input to validate (typically from args.input)
 * @param schema - The Zod schema to validate against
 * @param options - Optional configuration
 * @returns The validated and typed data
 * @throws Error with structured validation details if validation fails
 */
export function validateZodInput<TSchema extends z.ZodTypeAny>(
  input: unknown,
  schema: TSchema,
  options: ValidateZodOptions = {},
): z.output<TSchema> {
  const { errorPrefix = 'Validation failed' } = options

  const result = schema.safeParse(input)

  if (!result.success) {
    const issues = result.error.issues.map((issue) => ({
      path: issue.path,
      message: issue.message,
      code: issue.code,
    }))

    const message = issues.map((e) => {
      const path = e.path.length > 0 ? `${e.path.join('.')}: ` : ''
      return `${path}${e.message}`
    }).join('; ')

    // Throw a plain Error with structured message
    // Users can catch this and convert to ConvexError if needed
    const error = new Error(`${errorPrefix}: ${message}`)

    // Attach validation details for programmatic access
    ;(error as Error & { validationError: ZodValidationError }).validationError = {
      code: 'VALIDATION_ERROR',
      message,
      issues,
    }

    throw error
  }

  return result.data
}

/**
 * Type guard to check if an error is a Zod validation error from validateZodInput.
 *
 * @example
 * ```typescript
 * try {
 *   const validated = validateZodInput(input, schema)
 * } catch (error) {
 *   if (isZodValidationError(error)) {
 *     // Access structured validation details
 *     console.log(error.validationError.issues)
 *   }
 * }
 * ```
 */
export function isZodValidationError(error: unknown): error is Error & { validationError: ZodValidationError } {
  return (
    error instanceof Error
    && 'validationError' in error
    && (error as Error & { validationError?: unknown }).validationError !== undefined
    && typeof (error as Error & { validationError: { code?: unknown } }).validationError.code === 'string'
  )
}
