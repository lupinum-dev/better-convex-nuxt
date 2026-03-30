/// <reference types="vite/client" />

import { vi } from 'vitest'

export const modules = import.meta.glob('./**/*.ts', {
  eager: false,
})

vi.mock('./_generated/server', async () => {
  const server = await import('convex/server')
  return {
    query: server.queryGeneric,
    mutation: server.mutationGeneric,
    action: server.actionGeneric,
    internalQuery: server.internalQueryGeneric,
    internalMutation: server.internalMutationGeneric,
    internalAction: server.internalActionGeneric,
    httpAction: server.httpActionGeneric,
  }
})
