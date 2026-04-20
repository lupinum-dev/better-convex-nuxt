import { defineFeature } from '@lupinum/trellis/feature'

import { pagesTables } from './schema'

export const pagesFeature = defineFeature({
  name: 'pages',
  schema: pagesTables,
})
