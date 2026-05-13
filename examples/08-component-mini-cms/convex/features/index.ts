import { composeFeatures } from '@lupinum/trellis/workspace'

import { pagesFeature } from './pages/feature'

const manifest = composeFeatures([pagesFeature])

export const schema = manifest.schema
export const permissions = manifest.permissions
export const tenantTables = manifest.tenantTables
export const sharedTables = manifest.sharedTables
