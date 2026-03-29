import type { PropertyValidators } from 'convex/values'

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

  function buildTenantContext(
    user: TenantUser,
    ctx: any,
    db: any,
    resource?: unknown,
  ): TenantContext<TPermission, any> {
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
      resource: resource as any,
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
      handler: async (ctx: any, args: any) => {
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
      handler: async (ctx: any, args: any) => {
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
        let resource: any = undefined
        if (def.resource) {
          resource = await def.resource(
            scopedDb as ScopedReader<TScopedTables>,
            args,
          )
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
