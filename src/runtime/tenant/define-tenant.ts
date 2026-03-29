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
  resolveUser: (ctx: any) => Promise<TenantUser | null>
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
