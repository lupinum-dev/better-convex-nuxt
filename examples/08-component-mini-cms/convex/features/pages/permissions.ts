import { defineGuard, definePermission, open } from '@lupinum/trellis/auth'

import type { RootActor } from '../../auth/caller'

const isEditor = defineGuard<RootActor | null>('editor', (appIdentity) => appIdentity !== null)
const isAgent = defineGuard<RootActor | null>(
  'agent',
  (appIdentity) => appIdentity?.kind === 'agent',
)

export const listPublishedPagesPermission = definePermission({
  key: 'listPublishedPages',
  label: 'List published pages',
  check: open,
})

export const listDraftPagesPermission = definePermission({
  key: 'listDraftPages',
  label: 'List draft pages',
  check: isAgent,
})

export const createPagePermission = definePermission({
  key: 'createPage',
  label: 'Create page',
  check: isEditor,
})

export const saveDraftPermission = definePermission({
  key: 'saveDraft',
  label: 'Save draft',
  check: isEditor,
})

export const publishPagePermission = definePermission({
  key: 'publishPage',
  label: 'Publish page',
  project: false,
  check: isEditor,
})

export const miniCmsPagesPermissions = [
  listPublishedPagesPermission,
  listDraftPagesPermission,
  createPagePermission,
  saveDraftPermission,
  publishPagePermission,
] as const

export type MiniCmsPermissionKey = (typeof miniCmsPagesPermissions)[number]['key']
