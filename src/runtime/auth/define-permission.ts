import { isGuard, type AnyCheck } from './define-guard.js'

export interface ErasedPermissionDefinition<TKey extends string = string> {
  readonly _type: 'permission'
  readonly key: TKey
  readonly check: unknown
  readonly label?: string
  readonly description?: string
  readonly roles?: readonly string[]
  readonly project?: boolean
}

export interface PermissionKeyDefinition<TKey extends string = string> {
  readonly _type: 'permission-key'
  readonly key: TKey
  readonly label?: string
  readonly description?: string
}

export interface PermissionDefinition<TKey extends string = string, TActor = unknown> extends Omit<
  ErasedPermissionDefinition<TKey>,
  'check'
> {
  readonly check: AnyCheck<TActor>
}

// eslint-disable-next-line @typescript-eslint/no-empty-object-type -- Declaration-merged registry seam.
export interface PermissionKeysByKey {}

// eslint-disable-next-line @typescript-eslint/no-empty-object-type -- Declaration-merged registry seam.
export interface ProjectedPermissionKeysByKey {}

export interface RegisteredPermissions {
  keys: RegisteredPermissionKey
  projected: RegisteredProjectedPermissionKey
}

export type GuardPermissionDefinition<
  TKey extends string = string,
  TActor = unknown,
> = PermissionDefinition<TKey, TActor>

export type RegisteredPermissionKey = Extract<keyof PermissionKeysByKey, string>
export type RegisteredProjectedPermissionKey = Extract<keyof ProjectedPermissionKeysByKey, string>

export type PermissionHandle<TKey extends string = string> = Pick<
  PermissionDefinition<TKey>,
  '_type' | 'key'
>

export type PermissionKeyHandle<TKey extends string = string> =
  | PermissionHandle<TKey>
  | PermissionKeyDefinition<TKey>
  | TKey

export function definePermissionKey<TKey extends string>(
  input:
    | TKey
    | {
        key: TKey
        label?: string
        description?: string
      },
): PermissionKeyDefinition<TKey> {
  const key = typeof input === 'string' ? input : input.key
  if (key.trim().length === 0) {
    throw new Error('definePermissionKey(...) requires a non-empty permission key.')
  }

  return {
    _type: 'permission-key',
    key,
    ...(typeof input === 'string' || !input.label ? {} : { label: input.label }),
    ...(typeof input === 'string' || !input.description ? {} : { description: input.description }),
  }
}

export function definePermission<TKey extends string, TActor = unknown>(options: {
  key: TKey
  check: AnyCheck<TActor>
  label?: string
  description?: string
  roles?: readonly string[]
  project?: boolean
}): PermissionDefinition<TKey, TActor> {
  return {
    _type: 'permission',
    key: options.key,
    check: options.check,
    ...(options.label ? { label: options.label } : {}),
    ...(options.description ? { description: options.description } : {}),
    ...(options.roles ? { roles: options.roles } : {}),
    ...(options.project !== undefined ? { project: options.project } : {}),
  }
}

export function isPermissionDefinition(value: unknown): value is PermissionDefinition {
  return (
    typeof value === 'object' &&
    value !== null &&
    '_type' in value &&
    (value as { _type?: unknown })._type === 'permission' &&
    'key' in value &&
    typeof (value as { key?: unknown }).key === 'string'
  )
}

export function isGuardPermissionDefinition(value: unknown): value is GuardPermissionDefinition {
  return isPermissionDefinition(value)
}

export function resolvePermissionCheck<TActor>(
  permission: PermissionDefinition<string, TActor>,
): AnyCheck<TActor> {
  return permission.check
}

export function resolvePermissionLabel(permission: ErasedPermissionDefinition): string {
  if (permission.label) return permission.label
  if (permission.description) return permission.description
  if (isGuard(permission.check)) {
    return permission.check.label
  }
  return permission.key
}

export function resolvePermissionKey<TKey extends string>(
  permission: PermissionKeyHandle<TKey>,
): TKey {
  if (typeof permission === 'string') return permission
  return permission.key as TKey
}
