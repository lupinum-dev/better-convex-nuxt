export interface PermissionContext<TRole extends string = string> {
  role: TRole
  userId: string
  tenantId?: string
}

export interface Resource {
  ownerId?: string
}

export type CheckPermissionFn<
  TPermission extends string = string,
  TRole extends string = string,
> = (
  ctx: Pick<PermissionContext<TRole>, 'role' | 'userId'> | null,
  permission: TPermission,
  resource?: Record<string, unknown>,
) => boolean

export type PermissionRule<TRole extends string> =
  | { roles: readonly TRole[] }
  | { own: readonly TRole[], any: readonly TRole[] }

export type PermissionGroup<TRole extends string> = Readonly<Record<string, PermissionRule<TRole>>>

export type PermissionGroups<TRole extends string> = Readonly<Record<string, PermissionGroup<TRole>>>

type GlobalPermissionKeys<TPermissions> =
  TPermissions extends { global: infer TGlobal extends Record<string, unknown> }
    ? Extract<keyof TGlobal, string>
    : never

type ResourcePermissionKeys<TPermissions> = {
  [K in Exclude<Extract<keyof TPermissions, string>, 'global'>]:
    `${K}.${Extract<keyof TPermissions[K], string>}`
}[Exclude<Extract<keyof TPermissions, string>, 'global'>]

type PermissionKeys<TPermissions> =
  | GlobalPermissionKeys<TPermissions>
  | ResourcePermissionKeys<TPermissions>

export type InferRole<TConfig> =
  TConfig extends { roles: readonly (infer TRole)[] }
    ? Extract<TRole, string>
    : never

export type InferPermission<TConfig> =
  TConfig extends { permissions: infer TPermissions extends PermissionGroups<string> }
    ? PermissionKeys<TPermissions>
    : never

export type DefinedPermissionsConfig<
  TRoles extends readonly string[],
  TPermissions extends PermissionGroups<TRoles[number]>,
> = {
  roles: TRoles
  permissions: TPermissions
  checkPermission: CheckPermissionFn<PermissionKeys<TPermissions>, TRoles[number]>
}

type PermissionInputConfig<
  TRoles extends readonly string[],
  TPermissions extends PermissionGroups<TRoles[number]>,
> = {
  roles: TRoles
  permissions: TPermissions
  checkPermission?: CheckPermissionFn<PermissionKeys<TPermissions>, TRoles[number]>
}

function createGeneratedCheckPermission<
  TRole extends string,
  TPermissions extends PermissionGroups<TRole>,
>(
  permissions: TPermissions,
): CheckPermissionFn<PermissionKeys<TPermissions>, TRole> {
  return (ctx, permission, resource) => {
    if (!ctx) return false

    if (
      'global' in permissions
      && typeof permission === 'string'
      && permission in (permissions.global as Record<string, unknown>)
    ) {
      const rule = permissions.global[permission as GlobalPermissionKeys<TPermissions>]
      if (!rule) return false
      return 'roles' in rule
        ? (rule.roles as readonly string[]).includes(ctx.role)
        : false
    }

    const separatorIndex = permission.lastIndexOf('.')
    if (separatorIndex <= 0 || separatorIndex === permission.length - 1) return false

    const group = permission.slice(0, separatorIndex)
    const action = permission.slice(separatorIndex + 1)
    const groupRules = permissions[group as keyof TPermissions]
    if (!groupRules || group === 'global') return false

    const rule = (groupRules as Record<string, PermissionRule<TRole>>)[action]
    if (!rule) return false

    if ('roles' in rule) {
      return (rule.roles as readonly string[]).includes(ctx.role)
    }

    if ('any' in rule && (rule.any as readonly string[]).includes(ctx.role)) {
      return true
    }

    if ('own' in rule && (rule.own as readonly string[]).includes(ctx.role)) {
      return resource?.ownerId === ctx.userId
    }

    return false
  }
}

export function definePermissions<
  const TRoles extends readonly string[],
  const TPermissions extends PermissionGroups<TRoles[number]>,
>(
  config: PermissionInputConfig<TRoles, TPermissions>,
): DefinedPermissionsConfig<TRoles, TPermissions> {
  return {
    roles: config.roles,
    permissions: config.permissions,
    checkPermission:
      config.checkPermission
      ?? createGeneratedCheckPermission(config.permissions),
  }
}
