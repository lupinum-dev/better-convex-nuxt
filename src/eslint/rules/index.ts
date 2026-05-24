import { TENANT_RULE_NAME } from '../shared.js'
import { authRules } from './auth.js'
import { boundaryRules } from './boundaries.js'
import { isolationRules } from './isolation.js'
import { mcpRules } from './mcp.js'

export const rules = {
  ...mcpRules,
  ...boundaryRules,
  ...authRules,
  ...isolationRules,
} as const

export const recommendedRuleLevels: Record<string, 'error' | 'warn'> = {
  [`${TENANT_RULE_NAME}/mcp-scoped-requires-auth`]: 'error',
  [`${TENANT_RULE_NAME}/await-convex-query`]: 'error',
  [`${TENANT_RULE_NAME}/reactive-query-args`]: 'error',
  [`${TENANT_RULE_NAME}/appIdentity-access-after-enforce`]: 'error',
  [`${TENANT_RULE_NAME}/check-handles-null-appIdentity`]: 'error',
  [`${TENANT_RULE_NAME}/guard-no-db`]: 'error',
  [`${TENANT_RULE_NAME}/mcp-destructive-requires-preview`]: 'warn',
  [`${TENANT_RULE_NAME}/mcp-middleware-awaits-next`]: 'error',
  [`${TENANT_RULE_NAME}/feature-boundaries`]: 'error',
  [`${TENANT_RULE_NAME}/shared-features-runtime-neutral`]: 'error',
  [`${TENANT_RULE_NAME}/shared-no-nuxt-imports`]: 'warn',
  [`${TENANT_RULE_NAME}/convex-no-nuxt-imports`]: 'warn',
  [`${TENANT_RULE_NAME}/server-convex-auth-explicit`]: 'warn',
  [`${TENANT_RULE_NAME}/enforce-required-in-handler`]: 'error',
  [`${TENANT_RULE_NAME}/isolation-query-requires-index`]: 'error',
  [`${TENANT_RULE_NAME}/unsafe-get-requires-isolation-check`]: 'error',
  [`${TENANT_RULE_NAME}/escape-isolation-requires-reason`]: 'error',
  [`${TENANT_RULE_NAME}/unsafe-requires-permit`]: 'error',
  [`${TENANT_RULE_NAME}/unsafe-query-collection-requires-index`]: 'error',
}

export const strictOnlyRuleLevels: Record<string, 'error'> = {
  [`${TENANT_RULE_NAME}/prefer-app-query-over-unsafe`]: 'error',
  [`${TENANT_RULE_NAME}/no-dead-v-if-false`]: 'error',
}
