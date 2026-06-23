#!/usr/bin/env bash
set -euo pipefail

node --input-type=module <<'NODE'
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const betterAuthEntry = require.resolve('better-auth', { paths: [process.cwd()] })
const packageRoot = path.dirname(path.dirname(betterAuthEntry))
const packageJson = require(path.join(packageRoot, 'package.json'))
const packageExports = Object.keys(packageJson.exports || {}).sort()
const plugins = await import('better-auth/plugins')
const pluginExports = Object.keys(plugins).sort()

const tryResolve = (specifier) => {
  try {
    return { ok: true, value: require.resolve(specifier, { paths: [process.cwd()] }) }
  } catch (error) {
    return { ok: false, value: error.code || error.message }
  }
}

const matchingPackageExports = packageExports.filter((key) =>
  /sso|scim|saml|enterprise|oidc|oauth|mcp|device|generic/i.test(key),
)
const matchingPluginExports = pluginExports.filter((key) =>
  /sso|scim|saml|enterprise|oidc|oauth|mcp|device|generic/i.test(key),
)

const expectedAvailable = [
  ['better-auth/plugins/oidc-provider', 'oidcProvider'],
  ['better-auth/plugins/device-authorization', 'deviceAuthorization'],
  ['better-auth/plugins/generic-oauth', 'genericOAuth'],
  ['@better-auth/scim', 'scim'],
  ['@better-auth/scim/client', 'scimClient'],
]

const expectedMissing = [
  'better-auth/plugins/sso',
  'better-auth/plugins/scim',
  'better-auth/plugins/saml',
  'better-auth/plugins/enterprise',
  '@better-auth/sso',
  '@better-auth/saml',
  '@better-auth/oauth-provider',
]

console.log(`better-auth version: ${packageJson.version}`)
console.log(
  `enterprise/platform package exports: ${matchingPackageExports.join(', ') || '(none)'}`,
)
console.log(
  `enterprise/platform aggregate plugin exports: ${matchingPluginExports.join(', ') || '(none)'}`,
)

for (const [specifier, namedExport] of expectedAvailable) {
  const resolved = tryResolve(specifier)
  console.log(`${specifier}: ${resolved.value}`)
  const moduleExports = specifier.startsWith('@better-auth/')
    ? await import(specifier)
    : plugins
  const exportLabel = specifier.startsWith('@better-auth/')
    ? `${specifier}.${namedExport}`
    : `better-auth/plugins.${namedExport}`
  console.log(`${exportLabel}: ${typeof moduleExports[namedExport]}`)
  if (!resolved.ok || typeof moduleExports[namedExport] !== 'function') {
    throw new Error(`${specifier} / ${namedExport} should be available in the local package surface`)
  }
}

console.log(`better-auth/plugins.mcp: ${typeof plugins.mcp}`)
console.log(`better-auth/plugins.oAuthProxy: ${typeof plugins.oAuthProxy}`)
if (typeof plugins.mcp !== 'function') {
  throw new Error('mcp should be available through the aggregate better-auth/plugins export')
}
if (typeof plugins.oAuthProxy !== 'function') {
  throw new Error('oAuthProxy should be available through the aggregate better-auth/plugins export')
}

for (const namedExport of ['sso', 'scim', 'saml']) {
  console.log(`better-auth/plugins.${namedExport}: ${typeof plugins[namedExport]}`)
  if (typeof plugins[namedExport] !== 'undefined') {
    throw new Error(`${namedExport} is now exported by better-auth/plugins. Replace the expected-limit docs with a compatibility spike.`)
  }
}

const mcpDirect = tryResolve('better-auth/plugins/mcp')
console.log(`better-auth/plugins/mcp direct subpath: ${mcpDirect.value}`)
if (mcpDirect.ok) {
  throw new Error('MCP direct server subpath is now exported. Re-check import guidance and update docs.')
}

for (const specifier of expectedMissing) {
  const resolved = tryResolve(specifier)
  console.log(`${specifier}: ${resolved.value}`)
  if (resolved.ok) {
    throw new Error(`${specifier} is now available. Replace the expected-limit docs with a compatibility spike.`)
  }
}

for (const dirname of ['sso', 'scim', 'saml', 'enterprise']) {
  const distPath = path.join(packageRoot, `dist/plugins/${dirname}`)
  console.log(`dist/plugins/${dirname} exists: ${fs.existsSync(distPath)}`)
  if (fs.existsSync(distPath)) {
    throw new Error(`${dirname} implementation exists locally but is not exported. Research before documenting it as unavailable.`)
  }
}
NODE

echo "better-auth enterprise/platform package surface confirmed"
