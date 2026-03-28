/**
 * Convex validator → Standard Schema v1 converter.
 *
 * The walker collects ALL validation issues in one pass (multi-error),
 * unlike convex-helpers which throws on the first failure. This is the
 * primary reason we own the walker: a form with four invalid fields
 * reports all four errors at once, not one at a time across four submits.
 */

import type { GenericValidator, Infer } from 'convex/values'

import type { StandardSchemaV1 } from './standard-schema'

// ============================================================================
// Validation issue type (internal to walker)
// ============================================================================

export interface ValidationIssue {
  message: string
  path: PropertyKey[]
}

// ============================================================================
// Multi-error walker
// ============================================================================

function typeOf(value: unknown): string {
  if (value === null) return 'null'
  if (Array.isArray(value)) return 'array'
  if (value instanceof ArrayBuffer) return 'ArrayBuffer'
  return typeof value
}

function kindLabel(kind: string): string {
  switch (kind) {
    case 'float64': return 'number'
    case 'int64': return 'bigint'
    default: return kind
  }
}

/**
 * Recursively validate a value against a Convex validator, collecting
 * all issues into the `issues` array. Does NOT return early on first error.
 *
 * @returns The issues array (same reference as the `issues` parameter)
 */
export function validateConvex(
  validator: GenericValidator,
  value: unknown,
  path: PropertyKey[] = [],
  issues: ValidationIssue[] = [],
): ValidationIssue[] {
  // Handle optional: undefined is valid for optional validators
  if (value === undefined) {
    if ((validator as any).isOptional === 'optional') return issues
    issues.push({ message: 'Required', path })
    return issues
  }

  const kind: string = (validator as any).kind

  switch (kind) {
    case 'string':
      if (typeof value !== 'string') {
        issues.push({ message: `Expected string, got ${typeOf(value)}`, path })
      }
      break

    case 'float64':
      if (typeof value !== 'number') {
        issues.push({ message: `Expected number, got ${typeOf(value)}`, path })
      }
      break

    case 'int64':
      if (typeof value !== 'bigint') {
        issues.push({ message: `Expected bigint, got ${typeOf(value)}`, path })
      }
      break

    case 'boolean':
      if (typeof value !== 'boolean') {
        issues.push({ message: `Expected boolean, got ${typeOf(value)}`, path })
      }
      break

    case 'null':
      if (value !== null) {
        issues.push({ message: `Expected null, got ${typeOf(value)}`, path })
      }
      break

    case 'bytes':
      if (!(value instanceof ArrayBuffer)) {
        issues.push({ message: `Expected ArrayBuffer, got ${typeOf(value)}`, path })
      }
      break

    case 'any':
      // Always passes
      break

    case 'literal': {
      const expected = (validator as any).value
      if (value !== expected) {
        issues.push({
          message: `Expected literal ${JSON.stringify(expected)}, got ${JSON.stringify(value)}`,
          path,
        })
      }
      break
    }

    case 'id':
      // Convex IDs are strings at runtime
      if (typeof value !== 'string') {
        issues.push({
          message: `Expected ID (string), got ${typeOf(value)}`,
          path,
        })
      }
      break

    case 'array': {
      if (!Array.isArray(value)) {
        issues.push({ message: `Expected array, got ${typeOf(value)}`, path })
        break
      }
      const element: GenericValidator = (validator as any).element
      for (let i = 0; i < value.length; i++) {
        validateConvex(element, value[i], [...path, i], issues)
      }
      break
    }

    case 'object': {
      if (value === null || typeof value !== 'object' || Array.isArray(value)) {
        issues.push({ message: `Expected object, got ${typeOf(value)}`, path })
        break
      }
      const fields: Record<string, GenericValidator> = (validator as any).fields
      const record = value as Record<string, unknown>

      // Check every declared field (collects all missing/invalid, not just first)
      for (const [fieldName, fieldValidator] of Object.entries(fields)) {
        validateConvex(fieldValidator, record[fieldName], [...path, fieldName], issues)
      }

      // Reject unknown keys
      for (const key of Object.keys(record)) {
        if (!(key in fields)) {
          issues.push({
            message: `Unexpected field "${key}"`,
            path: [...path, key],
          })
        }
      }
      break
    }

    case 'record': {
      if (value === null || typeof value !== 'object' || Array.isArray(value)) {
        issues.push({ message: `Expected object (record), got ${typeOf(value)}`, path })
        break
      }
      const keyValidator: GenericValidator = (validator as any).key
      const valueValidator: GenericValidator = (validator as any).value
      const record = value as Record<string, unknown>

      for (const [k, v] of Object.entries(record)) {
        validateConvex(keyValidator, k, [...path, k], issues)
        validateConvex(valueValidator, v, [...path, k], issues)
      }
      break
    }

    case 'union': {
      const members: GenericValidator[] = (validator as any).members
      // Try each member — pass if any matches (zero issues)
      let matched = false
      for (const member of members) {
        const memberIssues: ValidationIssue[] = []
        validateConvex(member, value, path, memberIssues)
        if (memberIssues.length === 0) {
          matched = true
          break
        }
      }
      if (!matched) {
        const expected = members
          .map((m: any) => kindLabel(m.kind))
          .join(', ')
        issues.push({
          message: `Expected one of: ${expected}`,
          path,
        })
      }
      break
    }

    default:
      issues.push({ message: `Unknown validator kind: ${kind}`, path })
  }

  return issues
}

// ============================================================================
// Standard Schema v1 converter
// ============================================================================

/**
 * Convert a Convex validator to a Standard Schema v1 object.
 *
 * The resulting schema collects ALL validation errors in one pass.
 * Works with any Standard Schema consumer: Nuxt UI, VeeValidate, FormKit, etc.
 *
 * @example
 * ```ts
 * import { v } from 'convex/values'
 * const schema = toConvexSchema(v.object({ name: v.string(), age: v.float64() }))
 * // schema is StandardSchemaV1 — pass to form libraries
 * ```
 */
export function toConvexSchema<V extends GenericValidator>(
  validator: V,
): StandardSchemaV1<Infer<V>> {
  return {
    '~standard': {
      version: 1,
      vendor: 'better-convex-nuxt',
      validate: (value: unknown) => {
        const issues = validateConvex(validator, value)
        if (issues.length > 0) {
          return {
            issues: issues.map(i => ({
              message: i.message,
              path: i.path,
            })),
          }
        }
        return { value: value as Infer<V> }
      },
    },
  }
}

/**
 * Composable wrapper for `toConvexSchema`.
 *
 * Identical behavior — exists for naming consistency with other `use*` composables.
 *
 * @example
 * ```vue
 * <script setup>
 * const schema = useConvexSchema(v.object(createPostArgs))
 * </script>
 * <template>
 *   <UForm :schema="schema" @submit="handleSubmit">...</UForm>
 * </template>
 * ```
 */
export function useConvexSchema<V extends GenericValidator>(
  validator: V,
): StandardSchemaV1<Infer<V>> {
  return toConvexSchema(validator)
}
