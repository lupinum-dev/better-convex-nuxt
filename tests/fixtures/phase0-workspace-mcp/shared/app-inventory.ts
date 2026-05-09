import { defineAppInventory } from '../../../../src/runtime/feature/compose-features'
import { projectsFeature } from './features/projects/feature'

export const appInventory = defineAppInventory({
  features: [projectsFeature] as const,
})
