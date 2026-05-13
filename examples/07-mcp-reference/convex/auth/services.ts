import { defineServices } from '@lupinum/trellis/auth'

import type { McpReferencePrincipal } from './caller'

export const services = defineServices<'runbooks', McpReferencePrincipal>({
  'runbook-webhook': {
    access: {
      tables: ['runbooks'],
      tenant: 'global',
    },
  },
})
