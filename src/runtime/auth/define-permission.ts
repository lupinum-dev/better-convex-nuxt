import { isGuard, type AnyCheck } from './define-guard.js'

export interface PermissionDefinition<TKey extends string = string, TActor = unknown> {
  readonly _type: 'permission'
  readonly key: TKey
  readonly check: AnyCheck<TActor>
  readonly label?: string
  readonly description?: string
  readonly roles?: readonly string[]
  readonly project?: boolean
}

export type GuardPermissionDefinition<TKey extends string = string, TActor = unknown> =
  PermissionDefinition<TKey, TActor>

export type PermissionHandle<TKey extends string = string> = Pick<
  PermissionDefinition<TKey>,
  '_type' | 'key'
>

export type PermissionLike<TKey extends string = string> = TKey | PermissionHandle<TKey>

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

export function resolvePermissionLabel(permission: PermissionDefinition): string {
  if (permission.label) return permission.label
  if (permission.description) return permission.description
  if (isGuardPermissionDefinition(permission) && isGuard(permission.check)) {
    return permission.check.label
  }
  return permission.key
}

export function resolvePermissionKey<TKey extends string>(permission: PermissionLike<TKey>): TKey {
  return (typeof permission === 'string' ? permission : permission.key) as TKey
}
