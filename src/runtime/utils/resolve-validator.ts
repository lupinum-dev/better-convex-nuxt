/**
 * Polymorphic validator detection and normalization.
 *
 * The `validate` option on mutations/actions accepts either a Convex validator
 * or any Standard Schema v1 producer (Zod, Valibot, ArkType, etc.).
 * This module detects which one it is and normalizes to a common validate function.
 */

import type { GenericValidator } from 'convex/values'

import type { StandardSchemaV1 } from './standard-schema'
import type { ConvexErrorIssue } from './types'
import { toConvexSchema } from './convex-schema'

// ============================================================================
// Type for the validate option
// ============================================================================

/** Accepted by the `validate` option on `useConvexMutation` and `useConvexAction`. */
export type ValidateOption = GenericValidator | StandardSchemaV1

// ============================================================================
// Detection
// ============================================================================

export function isConvexValidator(value: unknown): value is GenericValidator {
  return !!value && typeof value === 'object' && (value as any).isConvexValidator === true
}

export function isStandardSchema(value: unknown): value is StandardSchemaV1 {
  return !!value && typeof value === 'object' && '~standard' in (value as any)
}

// ============================================================================
// Resolution
// ============================================================================

/**
 * Normalize a Convex validator or Standard Schema to a StandardSchemaV1.
 */
export function resolveSchema(input: ValidateOption): StandardSchemaV1 {
  if (isConvexValidator(input)) return toConvexSchema(input)
  if (isStandardSchema(input)) return input
  throw new Error('Expected a Convex validator or Standard Schema object')
}

// ============================================================================
// Validation runner
// ============================================================================

/** Convert a Standard Schema path array to a dot-notation string for ConvexErrorIssue. */
function pathToString(path: ReadonlyArray<PropertyKey | StandardSchemaV1.PathSegment>): string {
  return path
    .map(segment =>
      typeof segment === 'object' && segment !== null && 'key' in segment
        ? String(segment.key)
        : String(segment),
    )
    .join('.')
}

export type ValidationResult =
  | { valid: true; value: unknown }
  | { valid: false; issues: ConvexErrorIssue[] }

/**
 * Run validation and return a normalized result with ConvexErrorIssue paths.
 * Handles both sync and async Standard Schema validate functions.
 */
export async function runValidation(
  schema: StandardSchemaV1,
  args: unknown,
): Promise<ValidationResult> {
  let result: StandardSchemaV1.Result<unknown>
  try {
    result = await schema['~standard'].validate(args)
  } catch (e) {
    // Third-party schema (Zod, Valibot, etc.) threw instead of returning a failure result.
    const message = e instanceof Error ? e.message : 'Schema validation threw an unexpected error'
    return { valid: false, issues: [{ message, path: undefined }] }
  }

  if (result.issues && result.issues.length > 0) {
    return {
      valid: false,
      issues: result.issues.map(issue => ({
        path: issue.path && issue.path.length > 0 ? pathToString(issue.path) : undefined,
        message: issue.message,
      })),
    }
  }

  return { valid: true, value: (result as StandardSchemaV1.SuccessResult<unknown>).value }
}
