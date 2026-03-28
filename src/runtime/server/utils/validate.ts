/**
 * Server-side validation helper for H3 routes.
 *
 * Compatible with H3's `readValidatedBody(event, validateConvexArgs(validator))`.
 */

import { createError } from 'h3'
import type { GenericValidator, Infer } from 'convex/values'

import { toConvexSchema } from '../../utils/convex-schema'
import type { StandardSchemaV1 } from '../../utils/standard-schema'

/**
 * Create an H3-compatible validation function from a Convex validator.
 *
 * Returns the validated data on success, throws an H3 error (422) on failure
 * with all validation issues in the error data.
 *
 * @example
 * ```ts
 * export default defineEventHandler(async (event) => {
 *   const body = await readValidatedBody(event, validateConvexArgs(v.object(createPostArgs)))
 *   return await serverConvexMutation(event, api.posts.create, body)
 * })
 * ```
 */
export function validateConvexArgs<V extends GenericValidator>(
  validator: V,
): (data: unknown) => Infer<V> {
  const schema = toConvexSchema(validator)
  return (data: unknown) => {
    const result = schema['~standard'].validate(data) as
      | StandardSchemaV1.SuccessResult<Infer<V>>
      | StandardSchemaV1.FailureResult

    if (result.issues && result.issues.length > 0) {
      throw createError({
        statusCode: 422,
        statusMessage: 'Validation Error',
        data: { issues: result.issues },
      })
    }

    return (result as StandardSchemaV1.SuccessResult<Infer<V>>).value
  }
}
