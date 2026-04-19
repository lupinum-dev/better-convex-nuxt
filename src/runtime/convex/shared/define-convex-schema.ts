import { v } from 'convex/values'
import type { GenericValidator, Infer, ObjectType, PropertyValidators } from 'convex/values'
import { z } from 'zod'

import type {
  StandardSchemaV1,
  StandardSchemaV1Props,
  StandardSchemaV1Result,
  StandardSchemaV1SuccessResult,
} from '../../utils/standard-schema.js'
import { validateConvex } from './convex-schema.js'

type ValidatorNode = GenericValidator & {
  kind?: string
  isOptional?: string
  tableName?: string
  value?: unknown
  element?: GenericValidator
  inner?: GenericValidator
  members?: GenericValidator[]
}

export interface SchemaFieldMeta {
  label?: string
  description?: string
  examples?: unknown[]
  enum?: string[]
  defaultHint?: unknown
}

export type InputSchemaMeta<V extends PropertyValidators> = {
  [K in keyof V]?: SchemaFieldMeta
}

export type ResolvedSchemaMeta<V extends PropertyValidators> = {
  description?: string
  fields: {
    [K in keyof V]: Required<Pick<SchemaFieldMeta, 'label' | 'description'>> & SchemaFieldMeta
  }
}

export interface SchemaDefinition<
  T,
  V extends PropertyValidators = PropertyValidators,
> extends StandardSchemaV1<T> {
  readonly description: string | undefined
  readonly args: V
  readonly meta: ResolvedSchemaMeta<V>
  readonly zod: z.ZodObject<{ [K in keyof V]: z.ZodType<Infer<V[K]>> }>
  readonly parse: (input: unknown) => T
  readonly standard: StandardSchemaV1<T>
  readonly validate: (data: unknown) => T
}

function titleCase(input: string): string {
  return input
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase())
}

function describeValidator(validator: ValidatorNode): string {
  switch (validator.kind) {
    case 'string':
      return 'A string value'
    case 'float64':
      return 'A number value'
    case 'boolean':
      return 'A boolean value'
    case 'id':
      return `A reference to a ${validator.tableName} document`
    case 'literal':
      return `The literal value ${JSON.stringify(validator.value)}`
    case 'array':
      return 'A list of values'
    default:
      return 'A value'
  }
}

function toZod(validator: GenericValidator): z.ZodTypeAny {
  const node = validator as ValidatorNode

  let base: z.ZodTypeAny

  switch (node.kind) {
    case 'string':
      base = z.string()
      break
    case 'float64':
      base = z.number()
      break
    case 'int64':
      base = z.bigint()
      break
    case 'boolean':
      base = z.boolean()
      break
    case 'null':
      base = z.null()
      break
    case 'bytes':
      base = z.instanceof(ArrayBuffer)
      break
    case 'id':
      base = z.string()
      break
    case 'literal':
      base = z.literal(node.value)
      break
    case 'array':
      base = z.array(toZod(node.element!))
      break
    case 'object': {
      const fields = (node as { fields?: PropertyValidators }).fields ?? {}
      const shape = Object.fromEntries(
        Object.entries(fields).map(([key, value]) => [key, toZod(value)]),
      )
      base = z.object(shape)
      break
    }
    case 'union': {
      const members = node.members ?? []
      const literalMembers = members.filter(
        (member) => (member as ValidatorNode).kind === 'literal',
      )
      if (literalMembers.length === members.length && literalMembers.length > 0) {
        const values = literalMembers.map((member) => String((member as ValidatorNode).value))
        base = z.enum([values[0]!, ...values.slice(1)] as [string, ...string[]])
        break
      }

      if (members.length === 0) {
        base = z.never()
        break
      }

      if (members.length === 1) {
        base = toZod(members[0]!)
        break
      }

      base = z.union(
        members.map((member) => toZod(member)) as [z.ZodTypeAny, z.ZodTypeAny, ...z.ZodTypeAny[]],
      )
      break
    }
    default:
      base = z.any()
      break
  }

  return node.isOptional === 'optional' ? base.optional() : base
}

function createResolvedMeta<V extends PropertyValidators>(
  validators: V,
  description: string | undefined,
  meta: InputSchemaMeta<V> | undefined,
): ResolvedSchemaMeta<V> {
  const fields = Object.fromEntries(
    Object.entries(validators).map(([key, validator]) => {
      const provided = meta?.[key as keyof V]
      const node = validator as ValidatorNode

      return [
        key,
        {
          label: provided?.label ?? titleCase(key),
          description: provided?.description ?? describeValidator(node),
          ...(provided?.examples ? { examples: provided.examples } : {}),
          ...(provided?.enum ? { enum: provided.enum } : {}),
          ...(provided?.defaultHint !== undefined ? { defaultHint: provided.defaultHint } : {}),
        },
      ]
    }),
  ) as ResolvedSchemaMeta<V>['fields']

  return {
    description,
    fields,
  }
}

export function defineArgs<V extends PropertyValidators>(definition: {
  description?: string
  args: V
  meta?: InputSchemaMeta<V>
}): SchemaDefinition<ObjectType<V>, V> {
  type T = ObjectType<V>

  const objectValidator = v.object(definition.args)
  const standardProps: StandardSchemaV1Props<T> = {
    version: 1,
    vendor: '@lupinum/trellis',
    validate: (value: unknown) => {
      const issues = validateConvex(objectValidator, value)
      if (issues.length > 0) {
        return {
          issues: issues.map((issue) => ({
            message: issue.message,
            path: issue.path,
          })),
        }
      }

      return { value: value as T }
    },
  }

  const standard: StandardSchemaV1<T> = { '~standard': standardProps }
  const resolvedMeta = createResolvedMeta(definition.args, definition.description, definition.meta)

  const zodShape = Object.fromEntries(
    Object.entries(definition.args).map(([key, validator]) => [key, toZod(validator)]),
  ) as { [K in keyof V]: z.ZodType<Infer<V[K]>> }

  const zod = z.object(zodShape)

  const parse = (input: unknown): T => {
    return zod.parse(input) as unknown as T
  }

  const validate = (data: unknown): T => {
    const result = standardProps.validate(data) as StandardSchemaV1Result<T>
    if ('issues' in result && result.issues && result.issues.length > 0) {
      const err = new Error('Validation Error') as Error & {
        statusCode: number
        data: unknown
      }
      err.statusCode = 422
      err.data = { issues: result.issues }
      throw err
    }
    return (result as StandardSchemaV1SuccessResult<T>).value
  }

  return {
    description: definition.description,
    args: definition.args,
    meta: resolvedMeta,
    zod,
    parse,
    standard,
    '~standard': standardProps,
    validate,
  }
}
