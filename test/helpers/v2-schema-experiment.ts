import type { GenericValidator, Infer, PropertyValidators } from 'convex/values'
import { z } from 'zod'

type ValidatorNode = GenericValidator & {
  kind?: string
  isOptional?: string
  tableName?: string
  value?: unknown
  element?: GenericValidator
  members?: GenericValidator[]
}

export interface SchemaFieldMeta {
  label?: string
  description?: string
  examples?: unknown[]
}

export interface SchemaMeta<V extends PropertyValidators> {
  description?: string
  fields: {
    [K in keyof V]: Required<Pick<SchemaFieldMeta, 'label' | 'description'>> & SchemaFieldMeta
  }
}

export interface SchemaDefinition<V extends PropertyValidators> {
  description?: string
  validators: V
  meta: SchemaMeta<V>
  zod: z.ZodObject<{ [K in keyof V]: z.ZodType<Infer<V[K]>> }>
  parse: (input: unknown) => { [K in keyof V]: Infer<V[K]> }
}

type SchemaInputMeta<V extends PropertyValidators> = {
  [K in keyof V]?: SchemaFieldMeta
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
    case 'boolean':
      base = z.boolean()
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
    case 'union': {
      const members = node.members ?? []
      const literalMembers = members.filter(
        (member) => (member as ValidatorNode).kind === 'literal',
      )
      if (literalMembers.length === members.length && literalMembers.length > 0) {
        const values = literalMembers.map((member) => String((member as ValidatorNode).value))
        const head = values[0]
        if (!head) {
          base = z.never()
        } else {
          base = z.enum([head, ...values.slice(1)] as [string, ...string[]])
        }
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

export function defineArgs<V extends PropertyValidators>(definition: {
  description?: string
  args: V
  meta?: SchemaInputMeta<V>
}): SchemaDefinition<V> {
  const fields = Object.fromEntries(
    Object.entries(definition.args).map(([key, validator]) => {
      const provided = definition.meta?.[key as keyof V]
      const node = validator as ValidatorNode

      return [
        key,
        {
          label: provided?.label ?? titleCase(key),
          description: provided?.description ?? describeValidator(node),
          ...(provided?.examples ? { examples: provided.examples } : {}),
        },
      ]
    }),
  ) as SchemaMeta<V>['fields']

  const zodShape = Object.fromEntries(
    Object.entries(definition.args).map(([key, validator]) => [key, toZod(validator)]),
  ) as { [K in keyof V]: z.ZodType<Infer<V[K]>> }

  const zod = z.object(zodShape)

  return {
    description: definition.description,
    validators: definition.args,
    meta: {
      description: definition.description,
      fields,
    },
    zod,
    parse(input: unknown) {
      return zod.parse(input) as { [K in keyof V]: Infer<V[K]> }
    },
  }
}
