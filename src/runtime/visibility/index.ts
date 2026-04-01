import type {
  GenericDataModel,
  GenericDatabaseReader,
  GenericTableInfo,
  Query,
} from 'convex/server'

type QueryLike<T = unknown> = Pick<Query<GenericTableInfo>, 'collect'> & T
type VisibilityResolver<T, P> = (
  principal: P,
  db: GenericDatabaseReader<GenericDataModel>,
) => Promise<T[] | QueryLike>

export type Visibility<T, P = unknown> = {
  _type: 'visibility'
  resolve: VisibilityResolver<T, P>
}

export function defineVisibility<T, P = unknown>(
  resolve: VisibilityResolver<T, P>,
): Visibility<T, P> {
  return {
    _type: 'visibility',
    resolve,
  }
}

export async function applyVisibility<T, P = unknown>(
  visibility: Visibility<T, P>,
  principal: P,
  db: GenericDatabaseReader<GenericDataModel>,
): Promise<T[]> {
  if (!principal) return []
  const result = await visibility.resolve(principal, db)
  if (Array.isArray(result)) return result
  if (result && typeof result.collect === 'function') {
    return await result.collect() as T[]
  }
  return []
}

export async function getVisibilityQuery<T, P = unknown>(
  visibility: Visibility<T, P>,
  principal: P,
  db: GenericDatabaseReader<GenericDataModel>,
): Promise<QueryLike | T[] | null> {
  if (!principal) return null
  return await visibility.resolve(principal, db)
}
