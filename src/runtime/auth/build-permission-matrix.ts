import { resolvePermissionLabel, type ErasedPermissionDefinition } from './define-permission.js'

export type PermissionMatrixRow<TKey extends string = string> = {
  key: TKey
  label: string
  roles: readonly string[]
  description?: string
}

export function buildPermissionMatrix<
  TPermissions extends readonly ErasedPermissionDefinition<string>[],
>(permissions: TPermissions): PermissionMatrixRow<Extract<TPermissions[number]['key'], string>>[] {
  return permissions
    .filter((permission) => permission.project !== false)
    .map((permission) => ({
      key: permission.key,
      label: resolvePermissionLabel(permission),
      roles: permission.roles ?? [],
      ...(permission.description ? { description: permission.description } : {}),
    })) as PermissionMatrixRow<Extract<TPermissions[number]['key'], string>>[]
}
