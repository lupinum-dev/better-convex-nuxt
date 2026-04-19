import { defineServices } from '@lupinum/trellis/auth'

import type { McpReferencePrincipal } from './principal'

export const services = defineServices<'runbooks', McpReferencePrincipal>({
  'runbook-webhook': {
    access: {
      tables: ['runbooks'],
      tenant: 'global',
    },
  },
})
