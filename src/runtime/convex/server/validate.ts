/**
 * Server-side validation helper for H3 routes.
 *
 * Compatible with H3's `readValidatedBody(event, validateConvexArgs(validator))`.
 */

import type { GenericValidator, Infer } from 'convex/values'
import { createError } from 'h3'

import type { StandardSchemaV1Result } from '../../utils/standard-schema.js'
import { toConvexSchema } from '../shared/convex-schema.js'

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
): (data: unknown) => Promise<Infer<V>> {
  const schema = toConvexSchema(validator)
  return async (data: unknown) => {
    const result: StandardSchemaV1Result<Infer<V>> = await schema['~standard'].validate(data)

    if ('issues' in result) {
      throw createError({
        statusCode: 422,
        statusMessage: 'Validation Error',
        data: { issues: result.issues },
      })
    }

    return result.value
  }
}
