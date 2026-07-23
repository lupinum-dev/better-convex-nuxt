import {
  componentsGeneric,
  createFunctionHandle,
  makeFunctionReference,
  mutationGeneric,
  queryGeneric,
} from 'convex/server'
import { v } from 'convex/values'

import type { ComponentApi } from '../../../../src/runtime/convex-auth/component/_generated/component'

const components = componentsGeneric() as unknown as {
  relationshipPolicies: ComponentApi<'relationshipPolicies'>
}

const onDelete = makeFunctionReference<'mutation'>('relationshipTriggers:onDelete')
const onUpdate = makeFunctionReference<'mutation'>('relationshipTriggers:onUpdate')

export const deleteWithTriggers = mutationGeneric({
  args: { id: v.string(), model: v.string() },
  handler: async (ctx, args) =>
    ctx.runMutation(components.relationshipPolicies.adapter.deleteOne, {
      model: args.model,
      where: [{ field: 'id', value: args.id }],
      onDeleteHandle: String(await createFunctionHandle(onDelete)),
      onUpdateHandle: String(await createFunctionHandle(onUpdate)),
    }),
})

export const listEvents = queryGeneric({
  args: {},
  handler: (ctx) => ctx.db.query('relationshipEvents').collect(),
})
