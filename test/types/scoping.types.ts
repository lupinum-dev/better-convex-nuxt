import type {
  GenericDataModel,
  GenericDatabaseReader,
  GenericDatabaseWriter,
  GenericMutationCtx,
  GenericQueryCtx,
} from 'convex/server'
import type { GenericId } from 'convex/values'
import { v } from 'convex/values'

import { createScoped } from '../../src/runtime/scoping'

const scoped = createScoped({
  requireActor: async () => ({
    userId: 'user_1',
    role: 'member',
    orgId: 'org_1',
  }),
  tryResolveActor: async () => ({
    userId: 'user_1',
    role: 'member',
    orgId: 'org_1',
  }),
  scopedTables: ['posts'],
})

async function queryTypes(ctx: GenericQueryCtx<GenericDataModel>) {
  const result = await scoped(ctx, {})
  const queryCtx: GenericQueryCtx<GenericDataModel> = result.raw.ctx
  const queryDb: GenericDatabaseReader<GenericDataModel> = result.raw.db

  void queryCtx
  void queryDb

  result.db.query('posts')
  await result.db.get('post_1' as GenericId<'posts'>)

  // @ts-expect-error Query scoped db must stay read-only.
  await result.db.insert('posts', { title: 'test' })
}

async function mutationTypes(ctx: GenericMutationCtx<GenericDataModel>) {
  const result = await scoped(ctx, {})
  const mutationCtx: GenericMutationCtx<GenericDataModel> = result.raw.ctx
  const mutationDb: GenericDatabaseWriter<GenericDataModel> = result.raw.db

  void mutationCtx
  void mutationDb

  await result.db.insert('posts', { title: 'test' })
  await result.db.patch('post_1' as GenericId<'posts'>, {})
  await result.db.replace('post_1' as GenericId<'posts'>, { title: 'next' })
  await result.db.delete('post_1' as GenericId<'posts'>)
}

void queryTypes
void mutationTypes
void v
