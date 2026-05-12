import { addTemplate, addTypeTemplate, updateTemplates } from '@nuxt/kit'
import type { Nuxt } from '@nuxt/schema'

import {
  extractPermissionCodegenMetadata,
  renderPermissionCodegenMetadata,
  renderPermissionCodegenTypes,
  renderPermissionRuntimeExports,
  shouldRefreshPermissionCodegen,
} from '../module-internals/permissions-codegen.js'
import {
  extractPublicSurfaceCodegenMetadata,
  renderPublicSurfaceCodegenMetadata,
  renderPublicSurfaceCodegenTypes,
  shouldRefreshPublicSurfaceCodegen,
} from '../module-internals/public-surface-codegen.js'

interface InstallPermissionCodegenOptions {
  nuxt: Nuxt
  include: string[]
}

export function installPermissionCodegen(options: InstallPermissionCodegenOptions): void {
  const { nuxt, include } = options

  const readMetadata = () => extractPermissionCodegenMetadata(nuxt.options.rootDir, include)
  const readPublicSurfaceMetadata = () => extractPublicSurfaceCodegenMetadata(nuxt.options.rootDir)

  addTypeTemplate({
    filename: 'types/trellis-permissions.d.ts',
    write: true,
    getContents: () => renderPermissionCodegenTypes(readMetadata()),
  })

  addTemplate({
    filename: 'trellis/permissions.json',
    write: true,
    getContents: () => renderPermissionCodegenMetadata(readMetadata()),
  })

  const permissionRuntimeTemplate = addTemplate({
    filename: 'trellis/permissions.ts',
    write: true,
    getContents: () => renderPermissionRuntimeExports(readMetadata()),
  })
  nuxt.options.alias['#trellis/permissions'] = permissionRuntimeTemplate.dst

  addTypeTemplate({
    filename: 'types/trellis-public-surface.d.ts',
    write: true,
    getContents: () => renderPublicSurfaceCodegenTypes(readPublicSurfaceMetadata()),
  })

  addTemplate({
    filename: 'trellis/public-surface.json',
    write: true,
    getContents: () => renderPublicSurfaceCodegenMetadata(readPublicSurfaceMetadata()),
  })

  nuxt.hook('builder:watch', async (_event, path) => {
    if (!shouldRefreshPermissionCodegen(path, include) && !shouldRefreshPublicSurfaceCodegen(path))
      return
    await updateTemplates()
  })
}
