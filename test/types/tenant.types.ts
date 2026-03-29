import type {
  GenericDatabaseReader,
  GenericDatabaseWriter,
  GenericMutationCtx,
  GenericQueryCtx,
} from 'convex/server'
import { v } from 'convex/values'

import { createTenantHelpers, defineTenant } from '../../src/runtime/tenant'

const tenantConfig = defineTenant({
  scopedTables: ['posts'] as const,
  resolveUser: async () => ({
    _id: 'user_1' as any,
    userId: 'user_1',
    orgId: 'org_1' as any,
    role: 'member',
  }),
})

const passthroughBuilder = ((def: unknown) => def) as (...args: any[]) => any

const { scopedQuery, scopedMutation } = createTenantHelpers(tenantConfig, {
  query: passthroughBuilder,
  mutation: passthroughBuilder,
})

scopedMutation({
  args: { id: v.id('posts') },
  handler: async (_db, args, tenant) => {
    const mutationCtx: GenericMutationCtx<any> = tenant.raw.ctx
    const mutationDb: GenericDatabaseWriter<any> = tenant.raw.db

    void mutationCtx
    void mutationDb

    await tenant.raw.db.patch(args.id, {})
    await tenant.raw.db.replace(args.id, { organizationId: 'org_1' as any })
    await tenant.raw.db.delete(args.id)
    await tenant.raw.db.insert('posts' as any, { title: 'test' })
  },
})

scopedQuery({
  args: { id: v.id('posts') },
  handler: async (_db, args, tenant) => {
    const queryCtx: GenericQueryCtx<any> = tenant.raw.ctx
    const queryDb: GenericDatabaseReader<any> = tenant.raw.db

    void queryCtx
    void queryDb

    tenant.raw.db.query('posts' as any)
    await tenant.raw.db.get(args.id)

    // @ts-expect-error Query raw db must stay read-only.
    await tenant.raw.db.patch(args.id, {})

    // @ts-expect-error Query raw db must stay read-only.
    await tenant.raw.db.replace(args.id, { organizationId: 'org_1' as any })

    // @ts-expect-error Query raw db must stay read-only.
    await tenant.raw.db.delete(args.id)

    // @ts-expect-error Query raw db must stay read-only.
    await tenant.raw.db.insert('posts' as any, { title: 'test' })

    return null
  },
})
