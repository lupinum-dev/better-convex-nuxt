import { defineFeature } from '@lupinum/trellis/workspace'

import { miniCmsPagesPermissions } from './permissions'

export const pagesFeature = defineFeature({
  name: 'pages',
  permissions: miniCmsPagesPermissions,
})
