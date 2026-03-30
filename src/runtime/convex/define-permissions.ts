export interface PermissionContext<TRole extends string = string> {
  role: TRole
  userId: string
  orgId?: string
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

export function definePermissions<
  const TRoles extends readonly string[],
  const TPermissions extends PermissionGroups<TRoles[number]>,
>(
  config: DefinedPermissionsConfig<TRoles, TPermissions>,
): DefinedPermissionsConfig<TRoles, TPermissions> {
  return config
}
