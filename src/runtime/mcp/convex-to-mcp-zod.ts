import type { PropertyValidators } from 'convex/values'
import { z } from 'zod'
import type { ZodRawShape, ZodTypeAny } from 'zod'

type ConvexValidatorLike = {
  kind?: string
  isOptional?: string
  tableName?: string
  element?: unknown
  fields?: Record<string, unknown>
  members?: unknown[]
  key?: unknown
  value?: unknown
}

type SupportedLiteral = string | number | boolean | null

const SUPPORTED_KINDS = [
  'string',
  'float64',
  'boolean',
  'null',
  'literal',
  'id',
  'array',
  'object',
  'record',
  'union',
  'any',
] as const

function asValidator(value: unknown): ConvexValidatorLike {
  return value as ConvexValidatorLike
}

function formatPath(path: string): string {
  return path ? `"${path}"` : 'the root schema'
}

function unsupported(kind: string | undefined, path: string, detail?: string): never {
  throw new Error(
    `defineTool: validator kind "${kind ?? 'unknown'}" at ${formatPath(path)} ` +
      `is not supported for MCP input schemas. Supported kinds: ${SUPPORTED_KINDS.join(', ')}.` +
      (detail ? ` ${detail}` : ''),
  )
}

function containsConvexId(value: unknown): boolean {
  const validator = asValidator(value)
  if (!validator || typeof validator !== 'object' || !validator.kind) return false

  if (validator.kind === 'id') return true
  if (validator.kind === 'array') return containsConvexId(validator.element)
  if (validator.kind === 'record') return containsConvexId(validator.value)
  if (validator.kind === 'object') {
    return Object.values(validator.fields ?? {}).some((field) => containsConvexId(field))
  }
  if (validator.kind === 'union') {
    return (validator.members ?? []).some((member) => containsConvexId(member))
  }

  return false
}

function toSupportedLiteral(value: unknown, path: string): SupportedLiteral {
  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  ) {
    return value
  }

  throw new Error(
    `defineTool: literal value at ${formatPath(path)} must be a string, number, boolean, or null ` +
      `to be projected into an MCP input schema.`,
  )
}

function withOptional(validator: ZodTypeAny, cv: ConvexValidatorLike): ZodTypeAny {
  if (cv.isOptional !== 'optional') return validator

  const optional = validator.optional()
  return validator.description ? optional.describe(validator.description) : optional
}

function createJsonValueSchema(depth: number): ZodTypeAny {
  const primitive = z.union([z.string(), z.number(), z.boolean(), z.null()])
  if (depth <= 0) return primitive

  const child = createJsonValueSchema(depth - 1)
  return z.union([primitive, z.array(child), z.record(z.string(), child)])
}

function convexToMcpZodValidator(value: unknown, path: string): ZodTypeAny {
  const cv = asValidator(value)
  if (!cv || typeof cv !== 'object' || !cv.kind) {
    unsupported(undefined, path)
  }

  switch (cv.kind) {
    case 'any':
      return withOptional(createJsonValueSchema(3), cv)
    case 'string':
      return withOptional(z.string(), cv)
    case 'float64':
      return withOptional(z.number(), cv)
    case 'boolean':
      return withOptional(z.boolean(), cv)
    case 'null':
      return withOptional(z.null(), cv)
    case 'literal':
      return withOptional(z.literal(toSupportedLiteral(cv.value, path)), cv)
    case 'id':
      if (!cv.tableName) {
        throw new Error(
          `defineTool: v.id() at ${formatPath(path)} is missing a table name and cannot be projected.`,
        )
      }
      return withOptional(z.string().describe(`Convex ID for "${cv.tableName}" table`), cv)
    case 'array':
      if (!cv.element) {
        throw new Error(
          `defineTool: v.array() at ${formatPath(path)} is missing its element validator.`,
        )
      }
      return withOptional(z.array(convexToMcpZodValidator(cv.element, `${path}[]`)), cv)
    case 'object':
      if (!cv.fields || typeof cv.fields !== 'object') {
        throw new Error(
          `defineTool: v.object() at ${formatPath(path)} is missing its field validators.`,
        )
      }
      return withOptional(
        z.object(
          Object.fromEntries(
            Object.entries(cv.fields).map(([key, child]) => [
              key,
              convexToMcpZodValidator(child, path ? `${path}.${key}` : key),
            ]),
          ),
        ),
        cv,
      )
    case 'record': {
      const key = asValidator(cv.key)
      if (!key || typeof key !== 'object' || key.kind !== 'string') {
        throw new Error(
          `defineTool: v.record() at ${formatPath(path)} must use v.string() keys to be projected into an MCP input schema.`,
        )
      }
      if (!cv.value) {
        throw new Error(
          `defineTool: v.record() at ${formatPath(path)} is missing its value validator.`,
        )
      }
      return withOptional(
        z.record(z.string(), convexToMcpZodValidator(cv.value, path ? `${path}{}` : '{}')),
        cv,
      )
    }
    case 'union': {
      const members = cv.members ?? []
      if (members.length === 0) {
        throw new Error(
          `defineTool: v.union() at ${formatPath(path)} must contain at least one member.`,
        )
      }
      if (containsConvexId(cv)) {
        throw new Error(
          `defineTool: v.union() containing v.id() at ${formatPath(path)} cannot be projected to an MCP input schema. ` +
            `Use a plain v.string() instead, or provide the field description via schema metadata.`,
        )
      }

      const projected = members.map((member, index) =>
        convexToMcpZodValidator(member, `${path}<member:${index}>`),
      )

      if (projected.length === 1) {
        return withOptional(projected[0]!, cv)
      }

      return withOptional(z.union([projected[0]!, projected[1]!, ...projected.slice(2)]), cv)
    }
    default:
      unsupported(
        cv.kind,
        path,
        'Use a simpler validator for the MCP boundary or keep this field out of the tool surface.',
      )
  }
}

export function convexToMcpZodFields<V extends PropertyValidators>(validators: V): ZodRawShape {
  return Object.fromEntries(
    Object.entries(validators).map(([key, validator]) => [
      key,
      convexToMcpZodValidator(validator, key),
    ]),
  )
}
