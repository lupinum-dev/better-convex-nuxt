#!/usr/bin/env bash
set -euo pipefail

tmpdir="$(mktemp -d)"

cleanup() {
  rm -rf "$tmpdir"
}

trap cleanup EXIT

node --input-type=module - "$tmpdir" <<'NODE'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

const [tmpdir] = process.argv.slice(2)
const cwd = process.cwd()
const expectedVersion = '1.6.20'
const packageName = '@better-auth/oauth-provider'
const packageSpec = `${packageName}@${expectedVersion}`

function run(command, args, options = {}) {
  return execFileSync(command, args, {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'inherit'],
    ...options,
  }).trim()
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message)
  }
}

const metadata = JSON.parse(run('npm', ['view', packageName, 'version', 'dist-tags', '--json']))
console.log(`${packageName} latest: ${metadata.version}`)
console.log(`${packageName} beta: ${metadata['dist-tags']?.beta}`)
assert(
  metadata.version === expectedVersion,
  `${packageName} latest changed from ${expectedVersion} to ${metadata.version}; re-audit docs and verifier`,
)

const packOutput = run('npm', ['pack', packageSpec], { cwd: tmpdir })
const tarball = packOutput.split('\n').filter(Boolean).at(-1)
assert(tarball, 'npm pack did not return a tarball name')
run('tar', ['-xzf', tarball], { cwd: tmpdir })

const packageRoot = path.join(tmpdir, 'package')
const packageJson = JSON.parse(fs.readFileSync(path.join(packageRoot, 'package.json'), 'utf8'))
const exportsMap = Object.keys(packageJson.exports ?? {}).sort()
console.log(`${packageName} exports: ${exportsMap.join(', ')}`)
for (const exportPath of ['.', './client', './resource-client']) {
  assert(exportsMap.includes(exportPath), `missing ${packageName} export ${exportPath}`)
}

const indexTypes = fs.readFileSync(path.join(packageRoot, 'dist/index.d.mts'), 'utf8')
const oauthTypes = fs.readFileSync(
  path.join(packageRoot, 'dist/oauth-D74mBkw6.d.mts'),
  'utf8',
)
const oauthRuntime = fs.readFileSync(path.join(packageRoot, 'dist/index.mjs'), 'utf8')

for (const exportedName of [
  'oauthProvider',
  'mcpHandler',
  'oauthProviderAuthServerMetadata',
  'oauthProviderOpenIdConfigMetadata',
]) {
  assert(indexTypes.includes(exportedName), `missing ${exportedName} type export`)
}

for (const endpoint of [
  'oauth2Authorize',
  'oauth2Token',
  'oauth2Introspect',
  'oauth2Revoke',
  'oauth2UserInfo',
  'registerOAuthClient',
]) {
  assert(oauthRuntime.includes(endpoint), `missing OAuth Provider endpoint ${endpoint}`)
}

for (const schemaName of ['oauthClient', 'oauthRefreshToken', 'oauthAccessToken']) {
  assert(oauthTypes.includes(`${schemaName}:`), `missing OAuth Provider schema ${schemaName}`)
}
assert(
  oauthTypes.includes('token:') && oauthTypes.includes('refreshId:'),
  'OAuth Provider oauthAccessToken shape no longer has token/refreshId fields; re-audit schema guidance',
)

const teamSchema = fs.readFileSync(
  path.join(cwd, 'convex/betterAuth/generatedSchema.ts'),
  'utf8',
)
assert(
  teamSchema.includes('oauthApplication: defineTable'),
  'team schema no longer has the older oauthApplication table; re-check platform-auth guidance',
)
assert(
  !teamSchema.includes('oauthClient: defineTable') &&
    !teamSchema.includes('oauthRefreshToken: defineTable'),
  'team schema now contains current OAuth Provider tables; replace the expected-conflict finding with runtime lifecycle proof',
)
assert(
  teamSchema.includes('accessToken: v.optional') &&
    teamSchema.includes('refreshToken: v.optional'),
  'team oauthAccessToken table shape changed; re-audit old MCP/OIDC findings',
)

console.log('package tarball and local schema conflict verified')
NODE

mkdir -p "$tmpdir/runtime"
(cd "$tmpdir/runtime" && npm init -y >/dev/null)
(cd "$tmpdir/runtime" && npm install \
  @better-auth/oauth-provider@1.6.20 \
  better-auth@1.6.20 \
  @better-auth/core@1.6.20 \
  @better-auth/utils@0.4.2 \
  @better-fetch/fetch@1.3.1 \
  better-call@1.3.6 >/dev/null)

node --input-type=module - "$tmpdir/runtime/node_modules" <<'NODE'
import { createRequire } from 'node:module'

const [nodeModules] = process.argv.slice(2)
const require = createRequire(import.meta.url)
const packageRoot = require.resolve('@better-auth/oauth-provider', {
  paths: [nodeModules],
})
const { oauthProvider, mcpHandler } = await import(packageRoot)
const client = await import(
  require.resolve('@better-auth/oauth-provider/client', { paths: [nodeModules] })
)
const resourceClient = await import(
  require.resolve('@better-auth/oauth-provider/resource-client', { paths: [nodeModules] })
)

const plugin = oauthProvider({
  loginPage: '/login',
  consentPage: '/oauth-consent',
  scopes: ['openid', 'profile', 'email', 'offline_access', 'project:create'],
  validAudiences: ['http://localhost:3000/mcp'],
  allowDynamicClientRegistration: true,
  allowUnauthenticatedClientRegistration: false,
  grantTypes: ['authorization_code', 'refresh_token', 'client_credentials'],
  storeClientSecret: 'hashed',
  storeTokens: 'hashed',
})
const endpointNames = Object.keys(plugin.endpoints).sort()
console.log(`oauth-provider endpoint count: ${endpointNames.length}`)
console.log(`oauth-provider endpoints: ${endpointNames.join(', ')}`)

for (const endpoint of [
  'oauth2Authorize',
  'oauth2Token',
  'oauth2Introspect',
  'oauth2Revoke',
  'oauth2UserInfo',
  'registerOAuthClient',
]) {
  if (!endpointNames.includes(endpoint)) {
    throw new Error(`oauthProvider runtime plugin is missing ${endpoint}`)
  }
}
if (typeof mcpHandler !== 'function') {
  throw new Error('mcpHandler export should be callable')
}
if (typeof client.oauthProviderClient !== 'function') {
  throw new Error('oauthProviderClient export should be callable')
}
if (typeof resourceClient.oauthProviderResourceClient !== 'function') {
  throw new Error('oauthProviderResourceClient export should be callable')
}
NODE

echo "better-auth oauth-provider package surface confirmed"
