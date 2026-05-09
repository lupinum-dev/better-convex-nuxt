import { defineFeature } from '../../../../../../src/runtime/feature/define-feature'
import { deleteProjectDescriptor } from './operations'

export const projectsFeature = defineFeature({
  name: 'projects',
  operations: [deleteProjectDescriptor] as const,
})
