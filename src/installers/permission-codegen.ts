import type { Nuxt } from '@nuxt/schema'
import { addTemplate, addTypeTemplate, updateTemplates } from '@nuxt/kit'

import {
  extractPermissionCodegenMetadata,
  renderPermissionCodegenMetadata,
  renderPermissionCodegenTypes,
  shouldRefreshPermissionCodegen,
} from '../module-internals/permissions-codegen.js'

interface InstallPermissionCodegenOptions {
  nuxt: Nuxt
  include: string[]
}

export function installPermissionCodegen(options: InstallPermissionCodegenOptions): void {
  const { nuxt, include } = options

  const readMetadata = () => extractPermissionCodegenMetadata(nuxt.options.rootDir, include)

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

  nuxt.hook('builder:watch', async (_event, path) => {
    if (!shouldRefreshPermissionCodegen(path, include)) return
    await updateTemplates()
  })
}
