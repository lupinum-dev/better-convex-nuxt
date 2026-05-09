import { defineAppInventory } from '../../../../src/runtime/feature'
import { projectsFeature } from './features/projects/feature'

export const appInventory = defineAppInventory({
  features: [projectsFeature] as const,
})
