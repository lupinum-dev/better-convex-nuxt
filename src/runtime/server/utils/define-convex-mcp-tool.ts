import { convexToZodFields } from 'convex-helpers/server/zod4'
import type { ZodValidatorFromConvex } from 'convex-helpers/server/zod4'
import type { PropertyValidators } from 'convex/values'
import type { ZodTypeAny } from 'zod'

import type {
  ConvexSchemaDefinition,
  ConvexSchemaFieldMeta,
} from '../../utils/define-convex-schema'

type AnyConvexSchema = ConvexSchemaDefinition<any, PropertyValidators>

type InferSchemaData<S extends AnyConvexSchema> =
  S extends ConvexSchemaDefinition<infer T, infer _V> ? T : never

type InferSchemaValidators<S extends AnyConvexSchema> =
  S extends ConvexSchemaDefinition<any, infer V> ? V : never

export type ConvexMcpInputSchema<V extends PropertyValidators> = {
  [K in keyof V]: ZodValidatorFromConvex<V[K]>
}

export interface ConvexMcpToolDefinition<
  S extends AnyConvexSchema,
  OutputSchema extends Record<string, ZodTypeAny> = Record<string, ZodTypeAny>,
> {
  name?: string
  title?: string
  description?: string
  group?: string
  tags?: string[]
  inputSchema: ConvexMcpInputSchema<InferSchemaValidators<S>>
  outputSchema?: OutputSchema
  annotations?: Record<string, unknown>
  inputExamples?: Partial<InferSchemaData<S>>[]
  _meta?: Record<string, unknown>
  cache?: unknown
  enabled?: (event: unknown) => boolean | Promise<boolean>
  handler: (args: InferSchemaData<S>, extra: unknown) => unknown | Promise<unknown>
}

export interface ConvexMcpToolOptions<
  S extends AnyConvexSchema,
  OutputSchema extends Record<string, ZodTypeAny> = Record<string, ZodTypeAny>,
> extends Omit<ConvexMcpToolDefinition<S, OutputSchema>, 'inputSchema' | 'description'> {
  schema: S
  description?: string
}

function applyFieldDescriptions<V extends PropertyValidators>(
  shape: ConvexMcpInputSchema<V>,
  fields: { [K in keyof V]: ConvexSchemaFieldMeta } | undefined,
): ConvexMcpInputSchema<V> {
  if (!fields) return shape

  const describedShape = { ...shape } as ConvexMcpInputSchema<V>

  for (const [fieldName, fieldSchema] of Object.entries(shape) as [keyof V, ZodTypeAny][]) {
    const description = fields[fieldName]?.description
    if (description) {
      describedShape[fieldName] = fieldSchema.describe(description) as ConvexMcpInputSchema<V>[keyof V]
    }
  }

  return describedShape
}

/**
 * Build an MCP tool definition directly from a shared Convex schema.
 *
 * This keeps MCP tool input validation aligned with the same validators used by
 * Convex functions, forms, and H3 validation, while preserving typed handler args.
 */
export function defineConvexMcpTool<
  S extends AnyConvexSchema,
  OutputSchema extends Record<string, ZodTypeAny> = Record<string, ZodTypeAny>,
>(
  options: ConvexMcpToolOptions<S, OutputSchema>,
): ConvexMcpToolDefinition<S, OutputSchema> {
  const { schema, description = schema.meta?.description, ...tool } = options
  const inputSchema = applyFieldDescriptions(
    convexToZodFields(schema.args),
    schema.meta?.fields,
  ) as ConvexMcpInputSchema<InferSchemaValidators<S>>

  return {
    ...tool,
    description,
    inputSchema,
  }
}
