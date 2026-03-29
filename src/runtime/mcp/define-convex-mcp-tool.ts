import type {
  McpToolExtra,
  McpToolCallbackResult,
  McpToolDefinition,
} from '@nuxtjs/mcp-toolkit/server'
import { convexToZodFields } from 'convex-helpers/server/zod4'
import type { ZodValidatorFromConvex } from 'convex-helpers/server/zod4'
import type { PropertyValidators } from 'convex/values'
import type { ZodRawShape, ZodTypeAny } from 'zod'

import { toConvexError } from '../utils/call-result'
import type { ConvexSchemaDefinition, ConvexSchemaFieldMeta } from '../utils/define-convex-schema'

import { cleanErrorMessage, inferCategoryFromMessage } from './error-helpers'

type AnyConvexSchema = ConvexSchemaDefinition<unknown, PropertyValidators>

type InferSchemaData<S extends AnyConvexSchema> =
  S extends ConvexSchemaDefinition<infer T, infer _V> ? T : never

type InferSchemaValidators<S extends AnyConvexSchema> =
  S extends ConvexSchemaDefinition<unknown, infer V> ? V : never

export type ConvexMcpInputSchema<V extends PropertyValidators> = {
  [K in keyof V]: ZodValidatorFromConvex<V[K]>
}

export type ConvexMcpToolExtra = McpToolExtra

export interface ConvexMcpToolDefinition<
  S extends AnyConvexSchema,
  OutputSchema extends ZodRawShape = ZodRawShape,
  Extra extends ConvexMcpToolExtra = ConvexMcpToolExtra,
> extends Omit<
  McpToolDefinition<ConvexMcpInputSchema<InferSchemaValidators<S>>, OutputSchema>,
  'handler' | 'inputSchema'
> {
  inputSchema: ConvexMcpInputSchema<InferSchemaValidators<S>>
  handler: (
    args: InferSchemaData<S>,
    extra: Extra,
  ) => McpToolCallbackResult | Promise<McpToolCallbackResult>
}

export interface ConvexMcpToolOptions<
  S extends AnyConvexSchema,
  OutputSchema extends ZodRawShape = ZodRawShape,
  Extra extends ConvexMcpToolExtra = ConvexMcpToolExtra,
> extends Omit<ConvexMcpToolDefinition<S, OutputSchema, Extra>, 'inputSchema' | 'description'> {
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
      describedShape[fieldName] = fieldSchema.describe(
        description,
      ) as ConvexMcpInputSchema<V>[keyof V]
    }
  }

  return describedShape
}

/**
 * Build an MCP tool definition directly from a shared Convex schema.
 *
 * @deprecated Use `defineConvexTool` from `better-convex-nuxt/mcp` instead.
 *
 * This keeps MCP tool input validation aligned with the same validators used by
 * Convex functions, forms, and H3 validation, while preserving typed handler args.
 */
export function defineConvexMcpTool<
  S extends AnyConvexSchema,
  OutputSchema extends ZodRawShape = ZodRawShape,
  Extra extends ConvexMcpToolExtra = ConvexMcpToolExtra,
>(
  options: ConvexMcpToolOptions<S, OutputSchema, Extra>,
): ConvexMcpToolDefinition<S, OutputSchema, Extra> {
  const { schema, description = schema.meta?.description, ...tool } = options
  const inputSchema = applyFieldDescriptions(
    convexToZodFields(schema.args),
    schema.meta?.fields,
  ) as ConvexMcpInputSchema<InferSchemaValidators<S>>

  const wrappedHandler: ConvexMcpToolDefinition<S, OutputSchema, Extra>['handler'] = async (
    args,
    extra,
  ) => {
    try {
      return await tool.handler(args, extra)
    }
    catch (err) {
      const convexError = toConvexError(err)
      const message = cleanErrorMessage(convexError.message)
      const category = convexError.category !== 'unknown'
        ? convexError.category
        : inferCategoryFromMessage(message)
      const prefix = category ? `[${category}] ` : ''
      return {
        content: [{ type: 'text' as const, text: `${prefix}${message}` }],
        isError: true,
      }
    }
  }

  return {
    ...tool,
    description,
    inputSchema,
    handler: wrappedHandler,
  }
}
