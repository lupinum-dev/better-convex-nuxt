export interface PermissionContext<TRole extends string = string> {
  role: TRole
  userId: string
  tenantId?: string
}

export interface Resource {
  ownerId?: string
}

export interface PermissionEvaluation<
  TPermission extends string = string,
  TRole extends string = string,
> {
  allowed: boolean
  permission: TPermission
  rule?: PermissionRule<TRole>
  mode?: 'roles' | 'own' | 'any'
  reason: string
  hint?: string
}

export type CheckPermissionFn<
  TPermission extends string = string,
  TRole extends string = string,
> = (
  ctx: Pick<PermissionContext<TRole>, 'role' | 'userId'> | null,
  permission: TPermission,
  resource?: Record<string, unknown>,
) => boolean

export type EvaluatePermissionFn<
  TPermission extends string = string,
  TRole extends string = string,
> = (
  ctx: Pick<PermissionContext<TRole>, 'role' | 'userId'> | null,
  permission: TPermission,
  resource?: Record<string, unknown>,
) => PermissionEvaluation<TPermission, TRole>

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
  TConfig extends { rules: infer TRules extends PermissionGroups<string> }
    ? PermissionKeys<TRules>
    : never

export type DefinedPermissionsConfig<
  TRoles extends readonly string[],
  TPermissions extends PermissionGroups<TRoles[number]>,
> = {
  roles: TRoles
  rules: TPermissions
  checkPermission: CheckPermissionFn<PermissionKeys<TPermissions>, TRoles[number]>
  evaluatePermission?: EvaluatePermissionFn<PermissionKeys<TPermissions>, TRoles[number]>
}

type PermissionInputConfig<
  TRoles extends readonly string[],
  TPermissions extends PermissionGroups<TRoles[number]>,
> = {
  roles: TRoles
  rules: TPermissions
  checkPermission?: CheckPermissionFn<PermissionKeys<TPermissions>, TRoles[number]>
  evaluatePermission?: EvaluatePermissionFn<PermissionKeys<TPermissions>, TRoles[number]>
}

function createGeneratedEvaluatePermission<
  TRole extends string,
  TPermissions extends PermissionGroups<TRole>,
>(
  rules: TPermissions,
): EvaluatePermissionFn<PermissionKeys<TPermissions>, TRole> {
  return (ctx, permission, resource) => {
    if (!ctx) {
      return {
        allowed: false,
        permission,
        reason: 'No authenticated actor was provided.',
        hint: 'This permission requires an authenticated actor.',
      }
    }

    if (
      'global' in rules
      && typeof permission === 'string'
      && permission in (rules.global as Record<string, unknown>)
    ) {
      const rule = rules.global[permission as GlobalPermissionKeys<TPermissions>]
      if (!rule) {
        return {
          allowed: false,
          permission,
          reason: `No rule exists for permission "${permission}".`,
        }
      }
      if (!('roles' in rule)) {
        return {
          allowed: false,
          permission,
          rule,
          reason: `Global permission "${permission}" must use a roles rule.`,
        }
      }
      const allowed = (rule.roles as readonly string[]).includes(ctx.role)
      return allowed
        ? {
            allowed: true,
            permission,
            rule,
            mode: 'roles',
            reason: `Role "${ctx.role}" is allowed by the roles rule.`,
          }
        : {
            allowed: false,
            permission,
            rule,
            mode: 'roles',
            reason: `Role "${ctx.role}" is not allowed.`,
            hint: `Allowed roles: ${(rule.roles as readonly string[]).join(', ')}.`,
          }
    }

    const separatorIndex = permission.lastIndexOf('.')
    if (separatorIndex <= 0 || separatorIndex === permission.length - 1) {
      return {
        allowed: false,
        permission,
        reason: `Permission "${permission}" does not match the expected "<group>.<action>" format.`,
      }
    }

    const group = permission.slice(0, separatorIndex)
    const action = permission.slice(separatorIndex + 1)
    const groupRules = rules[group as keyof TPermissions]
    if (!groupRules || group === 'global') {
      return {
        allowed: false,
        permission,
        reason: `No permission group exists for "${group}".`,
      }
    }

    const rule = (groupRules as Record<string, PermissionRule<TRole>>)[action]
    if (!rule) {
      return {
        allowed: false,
        permission,
        reason: `No rule exists for permission "${permission}".`,
      }
    }

    if ('roles' in rule) {
      const allowed = (rule.roles as readonly string[]).includes(ctx.role)
      return allowed
        ? {
            allowed: true,
            permission,
            rule,
            mode: 'roles',
            reason: `Role "${ctx.role}" is allowed by the roles rule.`,
          }
        : {
            allowed: false,
            permission,
            rule,
            mode: 'roles',
            reason: `Role "${ctx.role}" is not allowed.`,
            hint: `Allowed roles: ${(rule.roles as readonly string[]).join(', ')}.`,
          }
    }

    if ('any' in rule && (rule.any as readonly string[]).includes(ctx.role)) {
      return {
        allowed: true,
        permission,
        rule,
        mode: 'any',
        reason: `Role "${ctx.role}" is allowed to access any matching resource.`,
      }
    }

    if ('own' in rule && (rule.own as readonly string[]).includes(ctx.role)) {
      if (!resource) {
        return {
          allowed: false,
          permission,
          rule,
          mode: 'own',
          reason: `Role "${ctx.role}" only has own-resource access, but no resource was provided.`,
          hint: `Pass a resource with ownerId when checking "${permission}".`,
        }
      }

      if (resource.ownerId === ctx.userId) {
        return {
          allowed: true,
          permission,
          rule,
          mode: 'own',
          reason: `Role "${ctx.role}" is allowed because the actor owns the resource.`,
        }
      }

      return {
        allowed: false,
        permission,
        rule,
        mode: 'own',
        reason:
          `Role "${ctx.role}" has own-only access. `
          + `resource.ownerId (${JSON.stringify(resource.ownerId)}) `
          + `!== actor.userId (${JSON.stringify(ctx.userId)}).`,
        hint: `Roles in "${ctx.role}" can only access their own resources.`,
      }
    }

    return {
      allowed: false,
      permission,
      rule,
      reason: `Role "${ctx.role}" is not allowed.`,
      hint:
        'This permission grants access through either the "any" roles or the "own" roles.',
    }
  }
}

export function definePermissions<
  const TRoles extends readonly string[],
  const TPermissions extends PermissionGroups<TRoles[number]>,
>(
  config: PermissionInputConfig<TRoles, TPermissions>,
): DefinedPermissionsConfig<TRoles, TPermissions> {
  const generatedEvaluatePermission = createGeneratedEvaluatePermission(config.rules)
  const evaluatePermission = config.evaluatePermission
    ?? (config.checkPermission ? undefined : generatedEvaluatePermission)

  return {
    roles: config.roles,
    rules: config.rules,
    checkPermission:
      config.checkPermission
      ?? ((ctx, permission, resource) =>
        generatedEvaluatePermission(ctx, permission, resource).allowed),
    ...(evaluatePermission ? { evaluatePermission } : {}),
  }
}
