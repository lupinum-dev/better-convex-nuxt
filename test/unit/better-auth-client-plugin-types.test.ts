import type { apiKeyClient } from '@better-auth/api-key/client'
import type { adminClient, organizationClient } from 'better-auth/client/plugins'
import { describe, expect, it } from 'vitest'

import type { createBetterConvexAuthClient } from '../../src/runtime/composables/createBetterConvexAuthClient'

type Assert<T extends true> = T
type HasKey<T, K extends PropertyKey> = K extends keyof T ? true : false

type DefaultPluginOptions = Record<never, never>

type AdminClientPlugin = ReturnType<typeof adminClient<DefaultPluginOptions>>
type OrganizationClientPlugin = ReturnType<typeof organizationClient<DefaultPluginOptions>>
type ApiKeyClientPlugin = ReturnType<typeof apiKeyClient>

type PluginClient = ReturnType<
  typeof createBetterConvexAuthClient<
    [AdminClientPlugin, OrganizationClientPlugin, ApiKeyClientPlugin]
  >
>

type _KeepsAdminNamespace = Assert<HasKey<PluginClient, 'admin'>>
type _KeepsOrganizationNamespace = Assert<HasKey<PluginClient, 'organization'>>
type _KeepsApiKeyNamespace = Assert<HasKey<PluginClient, 'apiKey'>>

type _KeepsAdminMethods = Assert<HasKey<PluginClient['admin'], 'listUsers'>>
type _KeepsOrganizationMethods = Assert<HasKey<PluginClient['organization'], 'create'>>
type _KeepsApiKeyMethods = Assert<HasKey<PluginClient['apiKey'], 'create'>>

describe('Better Auth client plugin type contracts', () => {
  it('preserves plugin namespaces at compile time', () => {
    expect(true).toBe(true)
  })
})
