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

interface ConvexValidatorNode {
  kind?: string
  isOptional?: string
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

function isConvexValidatorNode(value: unknown): value is GenericValidator & ConvexValidatorNode {
  return Boolean(
    value
      && typeof value === 'object'
      && typeof (value as ConvexValidatorNode).kind === 'string',
  )
}

function isValidatorFieldMap(value: unknown): value is Record<string, GenericValidator> {
  return Boolean(
    value
      && typeof value === 'object'
      && !Array.isArray(value)
      && Object.values(value).every(isConvexValidatorNode),
  )
}

function getValidatorKind(validator: GenericValidator): string {
  return isConvexValidatorNode(validator) ? validator.kind : 'unknown'
}

function isOptionalValidator(validator: GenericValidator): boolean {
  return Boolean(
    validator
      && typeof validator === 'object'
      && (validator as ConvexValidatorNode).isOptional === 'optional',
  )
}

function getLiteralValue(validator: GenericValidator): unknown {
  return (validator as { value?: unknown }).value
}

function getArrayElementValidator(validator: GenericValidator): GenericValidator | null {
  const element = (validator as { element?: unknown }).element
  return isConvexValidatorNode(element) ? element : null
}

function getObjectFields(validator: GenericValidator): Record<string, GenericValidator> | null {
  const fields = (validator as { fields?: unknown }).fields
  return isValidatorFieldMap(fields) ? fields : null
}

function getRecordKeyValidator(validator: GenericValidator): GenericValidator | null {
  const key = (validator as { key?: unknown }).key
  return isConvexValidatorNode(key) ? key : null
}

function getRecordValueValidator(validator: GenericValidator): GenericValidator | null {
  const valueValidator = (validator as { value?: unknown }).value
  return isConvexValidatorNode(valueValidator) ? valueValidator : null
}

function getUnionMembers(validator: GenericValidator): GenericValidator[] | null {
  const members = (validator as { members?: unknown }).members
  return Array.isArray(members) && members.every(isConvexValidatorNode) ? members : null
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
    if (isOptionalValidator(validator)) return issues
    issues.push({ message: 'Required', path })
    return issues
  }

  const kind = getValidatorKind(validator)

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
      const expected = getLiteralValue(validator)
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
      const element = getArrayElementValidator(validator)
      if (!element) {
        issues.push({ message: 'Array validator is missing an element validator', path })
        break
      }
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
      const fields = getObjectFields(validator)
      if (!fields) {
        issues.push({ message: 'Object validator is missing field definitions', path })
        break
      }
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
      const keyValidator = getRecordKeyValidator(validator)
      const valueValidator = getRecordValueValidator(validator)
      if (!keyValidator || !valueValidator) {
        issues.push({ message: 'Record validator is missing key/value validators', path })
        break
      }
      const record = value as Record<string, unknown>

      for (const [k, v] of Object.entries(record)) {
        validateConvex(keyValidator, k, [...path, k], issues)
        validateConvex(valueValidator, v, [...path, k], issues)
      }
      break
    }

    case 'union': {
      const members = getUnionMembers(validator)
      if (!members || members.length === 0) {
        issues.push({ message: 'Union validator is missing member validators', path })
        break
      }
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
          .map(member => kindLabel(getValidatorKind(member)))
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
