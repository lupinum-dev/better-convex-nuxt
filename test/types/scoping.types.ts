import type {
  GenericDataModel,
  GenericDatabaseReader,
  GenericDatabaseWriter,
} from 'convex/server'
import type { GenericId } from 'convex/values'

import {
  createScopedReader as buildScopedReader,
  createScopedWriter as buildScopedWriter,
} from '../../src/runtime/scoping/scoped-db'

declare const queryDb: GenericDatabaseReader<GenericDataModel>
declare const mutationDb: GenericDatabaseWriter<GenericDataModel>

const createScopedReader = (db: GenericDatabaseReader<GenericDataModel>, tenantId: string, tenantField: string, scopedTables: readonly string[]) =>
  buildScopedReader(db, tenantId, tenantField, 'by_organization', scopedTables)
const createScopedWriter = (db: GenericDatabaseWriter<GenericDataModel>, tenantId: string, tenantField: string, scopedTables: readonly string[]) =>
  buildScopedWriter(db, tenantId, tenantField, 'by_organization', scopedTables)

const reader = createScopedReader(queryDb, 'tenant_1', 'organizationId', ['posts'])
const writer = createScopedWriter(mutationDb, 'tenant_1', 'organizationId', ['posts'])

async function readerTypes() {
  reader.query('posts')
  await reader.get('post_1' as GenericId<'posts'>)

  // @ts-expect-error ScopedReader must stay read-only.
  await reader.insert('posts', { title: 'test' })
}

async function writerTypes() {
  writer.query('posts')
  await writer.get('post_1' as GenericId<'posts'>)
  await writer.insert('posts', { title: 'test' })
  await writer.patch('post_1' as GenericId<'posts'>, {})
  await writer.replace('post_1' as GenericId<'posts'>, { title: 'next' })
  await writer.delete('post_1' as GenericId<'posts'>)
}

void readerTypes
void writerTypes
