#!/usr/bin/env bash
set -euo pipefail

echo "== verify Better Auth client plugin package exports"
node --input-type=module <<'NODE'
const clientPlugins = await import('better-auth/client/plugins')
const apiKey = await import('@better-auth/api-key/client')
const passkey = await import('@better-auth/passkey/client')
const scim = await import('@better-auth/scim/client')

const requiredExports = [
  [clientPlugins, 'adminClient', 'better-auth/client/plugins'],
  [clientPlugins, 'organizationClient', 'better-auth/client/plugins'],
  [clientPlugins, 'inferAdditionalFields', 'better-auth/client/plugins'],
  [clientPlugins, 'twoFactorClient', 'better-auth/client/plugins'],
  [clientPlugins, 'emailOTPClient', 'better-auth/client/plugins'],
  [clientPlugins, 'magicLinkClient', 'better-auth/client/plugins'],
  [apiKey, 'apiKeyClient', '@better-auth/api-key/client'],
  [passkey, 'passkeyClient', '@better-auth/passkey/client'],
  [scim, 'scimClient', '@better-auth/scim/client'],
]

for (const [module, name, source] of requiredExports) {
  if (typeof module[name] !== 'function') {
    throw new Error(`${source} does not export ${name}()`)
  }
}

const plugins = [
  clientPlugins.inferAdditionalFields(),
  clientPlugins.organizationClient({
    teams: { enabled: true },
    dynamicAccessControl: { enabled: true },
  }),
  clientPlugins.adminClient(),
  apiKey.apiKeyClient(),
  scim.scimClient(),
  passkey.passkeyClient(),
  clientPlugins.twoFactorClient(),
  clientPlugins.emailOTPClient(),
  clientPlugins.magicLinkClient(),
]

const pluginIds = plugins.map((plugin) => plugin.id)
for (const id of [
  'additional-fields-client',
  'organization',
  'admin-client',
  'api-key',
  'scim-client',
  'passkey',
  'two-factor',
  'email-otp',
  'magic-link',
]) {
  if (!pluginIds.includes(id)) {
    throw new Error(`missing client plugin id ${id}; got ${pluginIds.join(', ')}`)
  }
}

console.log(JSON.stringify({ pluginIds }))
NODE

echo "== verify typed Nuxt client plugin contract"
pnpm typecheck

echo "better-auth typed Nuxt client surface feedback loop passed"
