import type { PropertyValidators } from 'convex/values'
import type {
  GenericDatabaseReader,
  GenericDatabaseWriter,
  GenericMutationCtx,
  GenericQueryCtx,
} from 'convex/server'

import type { CheckPermissionFn, Resource } from '../composables/usePermissions'

import { TenantError } from './errors'
import { createScopedReader, createScopedWriter } from './scoped-db'
import type {
  CreateTenantHelpersOptions,
  ScopedMutationDef,
  ScopedQueryDef,
  ScopedReader,
  ScopedWriter,
  TenantConfig,
  TenantContext,
  TenantUser,
} from './types'

// ============================================================================
// createTenantHelpers — Factory
// ============================================================================

export function createTenantHelpers<
  TPermission extends string = string,
  TScopedTables extends string = string,
>(
  config: TenantConfig<TScopedTables>,
  options: CreateTenantHelpersOptions<TPermission>,
) {
  const { checkPermission, query: queryBuilder, mutation: mutationBuilder } = options
  const { orgField, scopedTables, resolveUser } = config

  // ────────────────────────────────────────────────────────────
  // Build tenant context shared by both scopedQuery and scopedMutation
  // ────────────────────────────────────────────────────────────

  function buildTenantContext<
    TResource = undefined,
    TRawCtx extends GenericQueryCtx<any> | GenericMutationCtx<any> =
      GenericQueryCtx<any> | GenericMutationCtx<any>,
    TRawDb extends GenericDatabaseReader<any> | GenericDatabaseWriter<any> =
      GenericDatabaseReader<any> | GenericDatabaseWriter<any>,
  >(
    user: TenantUser,
    ctx: TRawCtx,
    db: TRawDb,
    resource?: TResource,
  ): TenantContext<TPermission, TResource, TRawCtx, TRawDb> {
    return {
      user,
      orgId: user.orgId,
      can(permission: TPermission, res?: Resource) {
        if (!checkPermission) return true
        return checkPermission(
          { role: user.role, userId: user.userId },
          permission,
          res,
        )
      },
      owns(doc: Record<string, unknown> | null) {
        if (!doc) return false
        return doc.ownerId === user.userId
      },
      resource: resource as TResource,
      raw: { ctx, db },
    }
  }

  // ────────────────────────────────────────────────────────────
  // scopedQuery
  // ────────────────────────────────────────────────────────────

  function scopedQuery<TArgs extends PropertyValidators>(
    def: ScopedQueryDef<TArgs, TScopedTables, TPermission>,
  ) {
    return queryBuilder({
      args: def.args,
      handler: async (ctx: GenericQueryCtx<any>, args: any) => {
        const user = await resolveUser(ctx)
        if (!user) return []

        const scopedDb = createScopedReader(
          ctx.db,
          user.orgId as string,
          orgField,
          scopedTables as unknown as string[],
        )

        const tenant = buildTenantContext(user, ctx, ctx.db)
        return await def.handler(scopedDb as ScopedReader<TScopedTables>, args, tenant)
      },
    })
  }

  // ────────────────────────────────────────────────────────────
  // scopedMutation
  // ────────────────────────────────────────────────────────────

  function scopedMutation<TArgs extends PropertyValidators, TResource = undefined>(
    def: ScopedMutationDef<TArgs, TScopedTables, TPermission, TResource>,
  ) {
    return mutationBuilder({
      args: def.args,
      handler: async (ctx: GenericMutationCtx<any>, args: any) => {
        // 1. Resolve user — mutations require auth
        const user = await resolveUser(ctx)
        if (!user) {
          throw new TenantError('Authentication required.', 'UNAUTHENTICATED')
        }

        // 2. Create scoped db
        const scopedDb = createScopedWriter(
          ctx.db,
          user.orgId as string,
          orgField,
          scopedTables as unknown as string[],
        )

        // 3. Fetch resource if provided (uses scoped db for org safety)
        let resource: TResource | undefined = undefined
        if (def.resource) {
          resource = await def.resource(
            scopedDb as ScopedReader<TScopedTables>,
            args,
          ) as TResource
          if (resource === null) {
            throw new TenantError('Document not found.', 'RESOURCE_NOT_FOUND')
          }
        }

        // 4. Check permission if specified
        if (def.permission && checkPermission) {
          const allowed = checkPermission(
            { role: user.role, userId: user.userId },
            def.permission,
            resource as Resource | undefined,
          )
          if (!allowed) {
            throw new TenantError(
              `Permission denied: ${def.permission}`,
              'PERMISSION_DENIED',
            )
          }
        }

        // 5. Call handler
        const tenant = buildTenantContext(user, ctx, ctx.db, resource)
        return await def.handler(
          scopedDb as ScopedWriter<TScopedTables>,
          args,
          tenant,
        )
      },
    })
  }

  return { scopedQuery, scopedMutation }
}
