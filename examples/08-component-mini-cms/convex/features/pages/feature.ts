import { defineFeature } from '@lupinum/trellis/feature'

import { miniCmsPagesPermissions } from './permissions'

export const pagesFeature = defineFeature({
  name: 'pages',
  permissions: miniCmsPagesPermissions,
})
