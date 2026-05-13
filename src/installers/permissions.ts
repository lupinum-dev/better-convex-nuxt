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
  const moduleSegments = modulePath
    .split('/')
    .map((segment) => `'${segment}'`)
    .join(', ')

  const permissionsTemplate = addTemplate({
    filename: 'trellis/configured-permissions.ts',
    write: true,
    getContents: () => `
import { api } from '#trellis/api'
import { createConfiguredPermissionsComposables } from '${resolver.resolve('./runtime/composables/configured-permissions')}'

const configuredModule = [${moduleSegments}].reduce<any>(
  (current, segment) => current?.[segment],
  api as any,
)
const configuredQuery = configuredModule?.['${exportName}']

export const configuredPermissionsQuery = configuredQuery

export const { useAccess, useAuthGuard } = createConfiguredPermissionsComposables(
  configuredQuery,
  '${permissionQueryPath}',
)
`,
  })

  addImports([
    { name: 'useAccess', from: permissionsTemplate.dst },
    { name: 'useAuthGuard', from: permissionsTemplate.dst },
  ])
}
