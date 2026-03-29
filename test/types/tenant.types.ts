import type {
  GenericDataModel,
  GenericDatabaseReader,
  GenericDatabaseWriter,
  GenericMutationCtx,
  GenericQueryCtx,
} from 'convex/server'
import type { PropertyValidators, ObjectType, GenericId } from 'convex/values'
import { v } from 'convex/values'

import { createTenantHelpers, defineTenant } from '../../src/runtime/tenant'

const tenantConfig = defineTenant({
  scopedTables: ['posts'] as const,
  resolveUser: async () => ({
    _id: 'user_1' as GenericId<'users'>,
    userId: 'user_1',
    orgId: 'org_1' as GenericId<'organizations'>,
    role: 'member',
  }),
})

const passthroughQueryBuilder = <TArgs extends PropertyValidators>(def: {
  args: TArgs
  handler: (
    ctx: GenericQueryCtx<GenericDataModel>,
    args: ObjectType<TArgs>,
  ) => Promise<unknown> | unknown
}) => def

const passthroughMutationBuilder = <TArgs extends PropertyValidators>(def: {
  args: TArgs
  handler: (
    ctx: GenericMutationCtx<GenericDataModel>,
    args: ObjectType<TArgs>,
  ) => Promise<unknown> | unknown
}) => def

const { scopedQuery, scopedMutation } = createTenantHelpers(tenantConfig, {
  query: passthroughQueryBuilder,
  mutation: passthroughMutationBuilder,
})

scopedMutation({
  args: { id: v.id('posts') },
  handler: async (_db, args, tenant) => {
    const mutationCtx: GenericMutationCtx<GenericDataModel> = tenant.raw.ctx
    const mutationDb: GenericDatabaseWriter<GenericDataModel> = tenant.raw.db

    void mutationCtx
    void mutationDb

    await tenant.raw.db.patch(args.id, {})
    await tenant.raw.db.replace(args.id, {
      organizationId: 'org_1' as GenericId<'organizations'>,
    })
    await tenant.raw.db.delete(args.id)
    await tenant.raw.db.insert('posts', { title: 'test' })
  },
})

scopedQuery({
  args: { id: v.id('posts') },
  handler: async (_db, args, tenant) => {
    const queryCtx: GenericQueryCtx<GenericDataModel> = tenant.raw.ctx
    const queryDb: GenericDatabaseReader<GenericDataModel> = tenant.raw.db

    void queryCtx
    void queryDb

    tenant.raw.db.query('posts')
    await tenant.raw.db.get(args.id)

    // @ts-expect-error Query raw db must stay read-only.
    await tenant.raw.db.patch(args.id, {})

    // @ts-expect-error Query raw db must stay read-only.
    await tenant.raw.db.replace(args.id, {
      organizationId: 'org_1' as GenericId<'organizations'>,
    })

    // @ts-expect-error Query raw db must stay read-only.
    await tenant.raw.db.delete(args.id)

    // @ts-expect-error Query raw db must stay read-only.
    await tenant.raw.db.insert('posts', { title: 'test' })

    return null
  },
})
