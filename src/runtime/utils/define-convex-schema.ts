/**
 * defineConvexSchema — define once, use everywhere.
 *
 * Wraps a flat Convex validators record into a unified schema object that
 * works across the entire stack: Convex mutations, form libraries, server
 * routes, and client-side pre-validation.
 */

import { v } from 'convex/values'
import type { PropertyValidators, ObjectType } from 'convex/values'

import { validateConvex } from './convex-schema'
import type { StandardSchemaV1 } from './standard-schema'

// ============================================================================
// Types
// ============================================================================

export interface ConvexSchemaFieldMeta {
  /** Human-readable label (for forms) */
  label?: string
  /** Description (for MCP tool .describe(), docs) */
  description?: string
  /** Example values shown to MCP agents */
  examples?: unknown[]
  /** Valid string values (when not using v.literal) */
  enum?: string[]
  /** Default value hint shown in description, not enforced at runtime */
  defaultHint?: unknown
}

export interface ConvexSchemaMetaBase {
  /** Schema-level description (for MCP tool description) */
  description?: string
}

/** Back-compat alias for earlier experimental type name. */
export type ConvexSchemaMeta = ConvexSchemaMetaBase

export type ConvexSchemaMetaFor<V extends PropertyValidators> = ConvexSchemaMetaBase & {
  /** Per-field metadata; if provided, it must cover every validator key. */
  fields?: { [K in keyof V]: ConvexSchemaFieldMeta }
}

/**
 * Unified schema object returned by `defineConvexSchema`.
 *
 * Implements `StandardSchemaV1` directly, so it can be passed to:
 * - `useConvexMutation(api.x, { validate: schema })`
 * - `<UForm :schema="schema">`
 * - Any Standard Schema consumer
 */
export interface ConvexSchemaDefinition<
  T,
  V extends PropertyValidators = PropertyValidators,
> extends StandardSchemaV1<T> {
  /** Raw Convex validators — spread into `mutation({ args: schema.args })` */
  readonly args: V
  /** Standard Schema v1 object for form libraries */
  readonly standard: StandardSchemaV1<T>
  /** H3-compatible validation: returns typed data or throws (statusCode 422) */
  readonly validate: (data: unknown) => T
  /** Optional metadata (labels, descriptions) */
  readonly meta: ConvexSchemaMetaFor<V> | undefined
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
 * ```
 */
export function defineConvexSchema<V extends PropertyValidators>(
  validators: V,
  options?: ConvexSchemaMetaFor<V>,
): ConvexSchemaDefinition<ObjectType<V>, V> {
  type T = ObjectType<V>

  const objectValidator = v.object(validators)

  // Multi-error Standard Schema using our walker
  const standardProps: StandardSchemaV1.Props<T> = {
    version: 1,
    vendor: 'better-convex-nuxt',
    validate: (value: unknown) => {
      const issues = validateConvex(objectValidator, value)
      if (issues.length > 0) {
        return { issues: issues.map((i) => ({ message: i.message, path: i.path })) }
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
    args: validators,
    standard,
    '~standard': standardProps,
    validate,
    meta: options,
  }
}
