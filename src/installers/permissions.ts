import type { createResolver } from '@nuxt/kit'
import { addImports, addTemplate } from '@nuxt/kit'

interface InstallPermissionsOptions {
  resolver: ReturnType<typeof createResolver>
  permissionQueryPath: string
}

export function installPermissionTrellis(options: InstallPermissionsOptions): void {
  const { resolver, permissionQueryPath } = options
  const lastDot = permissionQueryPath.lastIndexOf('.')
  const modulePath = permissionQueryPath.slice(0, lastDot)
  const exportName = permissionQueryPath.slice(lastDot + 1)

  const permissionsTemplate = addTemplate({
    filename: 'trellis/permissions.ts',
    write: true,
    getContents: () => `
import { api } from '#trellis/api'
import { createConfiguredPermissionsComposables } from '${resolver.resolve('./runtime/composables/configured-permissions')}'

const configuredQuery = (api as Record<string, any>)['${modulePath}']['${exportName}']

export const configuredPermissionsQuery = configuredQuery

export const { usePermissions, useAuthGuard } = createConfiguredPermissionsComposables(
  configuredQuery,
  '${permissionQueryPath}',
)
`,
  })

  addImports([
    { name: 'usePermissions', from: permissionsTemplate.dst },
    { name: 'useAuthGuard', from: permissionsTemplate.dst },
  ])
}
