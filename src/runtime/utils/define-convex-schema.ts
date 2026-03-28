/**
 * defineConvexSchema — define once, use everywhere.
 *
 * Wraps a flat Convex validators record into a unified schema object that
 * works across the entire stack: Convex mutations, form libraries, server
 * routes, client-side pre-validation, and MCP tool definitions.
 */

import { v } from 'convex/values'
import type { GenericValidator, Infer, PropertyValidators, ObjectType } from 'convex/values'

import type { StandardSchemaV1 } from './standard-schema'
import { validateConvex } from './convex-schema'

// ============================================================================
// Types
// ============================================================================

export interface ConvexSchemaFieldMeta {
  /** Human-readable label (for forms) */
  label?: string
  /** Description (for MCP tool .describe(), docs) */
  description?: string
}

export interface ConvexSchemaMeta {
  /** Schema-level description (for MCP tool description) */
  description?: string
  /** Per-field metadata */
  fields?: Record<string, ConvexSchemaFieldMeta>
}

/**
 * Unified schema object returned by `defineConvexSchema`.
 *
 * Implements `StandardSchemaV1` directly, so it can be passed to:
 * - `useConvexMutation(api.x, { validate: schema })`
 * - `<UForm :schema="schema">`
 * - Any Standard Schema consumer
 */
export interface ConvexSchemaDefinition<T> extends StandardSchemaV1<T> {
  /** Raw Convex validators — spread into `mutation({ args: schema.args })` */
  readonly args: Record<string, GenericValidator>
  /** Standard Schema v1 object for form libraries */
  readonly standard: StandardSchemaV1<T>
  /** H3-compatible validation: returns typed data or throws (statusCode 422) */
  readonly validate: (data: unknown) => T
  /** Optional metadata (labels, descriptions) */
  readonly meta: ConvexSchemaMeta | undefined
  /** Generate a Zod schema shape with .describe() from metadata. */
  readonly toMcpInput: (zodNamespace: ZodNamespaceLike) => Record<string, unknown>
}

interface ZodNamespaceLike {
  string: () => unknown
  number: () => unknown
  bigint: () => unknown
  boolean: () => unknown
  null: () => unknown
  instanceof: (value: unknown) => unknown
  any: () => unknown
  literal: (value: unknown) => unknown
  array: (schema: unknown) => unknown
  object: (shape: Record<string, unknown>) => unknown
  record: (key: unknown, value: unknown) => unknown
  union: (members: unknown[]) => unknown
}

// ============================================================================
// Core
// ============================================================================

/**
 * Define a reusable Convex schema with optional metadata.
 *
 * @example
 * ```ts
 * export const createPostSchema = defineConvexSchema({
 *   title: v.string(),
 *   body: v.string(),
 * }, {
 *   fields: {
 *     title: { label: 'Title', description: 'The post title' },
 *     body: { label: 'Body', description: 'Markdown content' },
 *   },
 * })
 *
 * // Convex mutation: mutation({ args: createPostSchema.args, ... })
 * // Form:            <UForm :schema="createPostSchema" />
 * // Mutation:        useConvexMutation(api.x, { validate: createPostSchema })
 * // Server route:    readValidatedBody(event, createPostSchema.validate)
 * // MCP tool:        defineMcpTool({ inputSchema: createPostSchema.toMcpInput(z) })
 * ```
 */
export function defineConvexSchema<V extends PropertyValidators>(
  validators: V,
  options?: ConvexSchemaMeta,
): ConvexSchemaDefinition<ObjectType<V>> {
  type T = ObjectType<V>

  const objectValidator = v.object(validators)

  // Multi-error Standard Schema using our walker
  const standardProps: StandardSchemaV1.Props<T> = {
    version: 1,
    vendor: 'better-convex-nuxt',
    validate: (value: unknown) => {
      const issues = validateConvex(objectValidator, value)
      if (issues.length > 0) {
        return { issues: issues.map(i => ({ message: i.message, path: i.path })) }
      }
      return { value: value as T }
    },
  }

  const standard: StandardSchemaV1<T> = { '~standard': standardProps }

  // H3-compatible validate: returns typed data or throws with statusCode 422
  const validate = (data: unknown): T => {
    const result = standardProps.validate(data) as StandardSchemaV1.Result<T>
    if ('issues' in result && result.issues && result.issues.length > 0) {
      const err = new Error('Validation Error') as Error & { statusCode: number; data: unknown }
      err.statusCode = 422
      err.data = { issues: result.issues }
      throw err
    }
    return (result as StandardSchemaV1.SuccessResult<T>).value
  }

  return {
    args: validators as Record<string, GenericValidator>,
    standard,
    '~standard': standardProps,
    validate,
    meta: options,
    toMcpInput: (zodNamespace) => convexToZod(validators, options, zodNamespace),
  }
}

// ============================================================================
// Convex → Zod converter
// ============================================================================

function convexToZod(
  validators: Record<string, GenericValidator>,
  meta: ConvexSchemaMeta | undefined,
  z: ZodNamespaceLike,
): Record<string, unknown> {
  function walk(validator: GenericValidator): unknown {
    const val = validator as any
    const kind: string = val.kind
    const inner = walkKind(val, kind)

    if (val.isOptional === 'optional') {
      return (inner as any).optional()
    }
    return inner
  }

  function walkKind(val: any, kind: string): unknown {
    switch (kind) {
      case 'string': return z.string()
      case 'float64': return z.number()
      case 'int64': return z.bigint()
      case 'boolean': return z.boolean()
      case 'null': return z.null()
      case 'bytes': return z.instanceof(ArrayBuffer)
      case 'any': return z.any()
      case 'literal': return z.literal(val.value)
      case 'id': return z.string()
      case 'array': return z.array(walk(val.element) as any)
      case 'object': {
        const shape: Record<string, unknown> = {}
        for (const [k, fieldV] of Object.entries(val.fields as Record<string, GenericValidator>)) {
          shape[k] = walk(fieldV)
        }
        return z.object(shape as any)
      }
      case 'record': return z.record(walkKind(val.key, val.key.kind) as any, walk(val.value) as any)
      case 'union': {
        const members = (val.members as GenericValidator[]).map(m => walk(m))
        if (members.length >= 2) return z.union(members as any)
        return members[0] ?? z.any()
      }
      default: return z.any()
    }
  }

  // Build top-level shape with metadata descriptions
  const shape: Record<string, unknown> = {}
  for (const [fieldName, fieldValidator] of Object.entries(validators)) {
    let zodField = walk(fieldValidator)
    const fieldMeta = meta?.fields?.[fieldName]
    if (fieldMeta?.description && typeof (zodField as any).describe === 'function') {
      zodField = (zodField as any).describe(fieldMeta.description)
    }
    shape[fieldName] = zodField
  }

  return shape
}
