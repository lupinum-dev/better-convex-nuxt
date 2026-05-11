import { defineFeature } from '@lupinum/trellis/workspace'

import { publishPageDescriptor } from '../../../../../shared/features/pages/contract'
import { pagesTables } from './schema'

export const pagesFeature = defineFeature({
  name: 'pages',
  schema: pagesTables,
  operations: [publishPageDescriptor],
})
