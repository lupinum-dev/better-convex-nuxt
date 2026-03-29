import type { GenericDataModel, GenericMutationCtx, GenericQueryCtx } from 'convex/server'

import type { TenantConfig, TenantUser } from './types'

// ============================================================================
// defineTenant — Configuration builder
// ============================================================================

export interface DefineTenantInput<
  TScopedTables extends string = string,
  TOrgField extends string = 'organizationId',
> {
  orgField?: TOrgField
  scopedTables: readonly TScopedTables[]
  resolveUser: (
    ctx: GenericQueryCtx<GenericDataModel> | GenericMutationCtx<GenericDataModel>,
  ) => Promise<TenantUser | null>
}

export function defineTenant<
  TScopedTables extends string,
  TOrgField extends string = 'organizationId',
>(
  input: DefineTenantInput<TScopedTables, TOrgField>,
): TenantConfig<TScopedTables, TOrgField> {
  const orgField = (input.orgField ?? 'organizationId') as TOrgField

  return Object.freeze({
    orgField,
    scopedTables: Object.freeze([...input.scopedTables]) as readonly TScopedTables[],
    resolveUser: input.resolveUser,
  })
}
