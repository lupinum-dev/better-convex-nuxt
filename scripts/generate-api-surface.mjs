#!/usr/bin/env node
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import vm from 'node:vm'

import ts from 'typescript'

const rootDir = process.cwd()
const apiSurfacePath = resolve(rootDir, 'src/module-api-surface.ts')
const componentsDir = resolve(rootDir, 'src/runtime/components')
const outputPath = resolve(rootDir, 'docs/content/docs/6.advanced/8.api-surface.md')
const packageJsonPath = resolve(rootDir, 'package.json')
const checkOnly = process.argv.includes('--check')

const apiSurfaceSource = readFileSync(apiSurfacePath, 'utf8')
const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8'))

function loadApiSurfaceRegistry() {
  const transpiled = ts.transpileModule(apiSurfaceSource, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: apiSurfacePath,
  }).outputText

  const module = { exports: {} }
  vm.runInNewContext(transpiled, {
    exports: module.exports,
    module,
  })
  return module.exports
}

const apiSurfaceRegistry = loadApiSurfaceRegistry()

function normalizeRepoUrl(input) {
  if (typeof input !== 'string') return null
  const cleaned = input
    .replace(/^git\+/, '')
    .replace(/\.git$/, '')
    .replace(/^git@github\.com:/, 'https://github.com/')
  return cleaned.startsWith('https://') ? cleaned : null
}

const repoBase =
  normalizeRepoUrl(packageJson?.repository?.url) ??
  'https://github.com/lupinum-dev/better-convex-nuxt'

function extractNamesFromRegistry(registryName) {
  const registry = apiSurfaceRegistry[registryName]
  if (!Array.isArray(registry)) {
    throw new TypeError(`Could not find ${registryName} array in ${apiSurfacePath}`)
  }

  return [
    ...new Set(
      registry.map((entry) => {
        if (!entry || typeof entry.name !== 'string') {
          throw new TypeError(`${registryName} contains an entry without a string name`)
        }
        return entry.name
      }),
    ),
  ].sort((a, b) => a.localeCompare(b))
}

const composableImports = [
  ...extractNamesFromRegistry('composableAutoImports'),
  ...extractNamesFromRegistry('authAutoImports'),
].sort((a, b) => a.localeCompare(b))
const serverImports = extractNamesFromRegistry('serverAutoImports')
const componentNames = readdirSync(componentsDir)
  .filter((name) => name.endsWith('.vue'))
  .map((name) => name.replace(/\.vue$/, ''))
  .sort((a, b) => a.localeCompare(b))

const composableMeta = {
  deleteFromPaginatedQuery: {
    kind: 'Helper',
    purpose: 'Optimistically removes an item from a paginated query cache.',
    guide: '/docs/mutations/optimistic-updates',
  },
  deleteFromQuery: {
    kind: 'Helper',
    purpose: 'Optimistically removes an item from a regular query cache.',
    guide: '/docs/mutations/optimistic-updates',
  },
  insertAtBottomIfLoaded: {
    kind: 'Helper',
    purpose: 'Optimistically inserts an item at the end of paginated data when loaded.',
    guide: '/docs/mutations/optimistic-updates',
  },
  insertAtPosition: {
    kind: 'Helper',
    purpose: 'Optimistically inserts an item at a custom position in paginated data.',
    guide: '/docs/mutations/optimistic-updates',
  },
  insertAtTop: {
    kind: 'Helper',
    purpose: 'Optimistically inserts an item at the top of paginated data.',
    guide: '/docs/mutations/optimistic-updates',
  },
  updateInPaginatedQuery: {
    kind: 'Helper',
    purpose: 'Optimistically updates matching items across paginated query pages.',
    guide: '/docs/mutations/optimistic-updates',
  },
  defineSharedConvexQuery: {
    kind: 'Helper',
    purpose: 'Defines a reusable shared query contract for multiple consumers.',
    guide: '/docs/data-fetching/caching-reuse',
  },
  createBetterConvexAuthClient: {
    kind: 'Factory',
    purpose: 'Creates a plugin-typed Better Auth client with Convex token sync.',
    guide: '/docs/auth-security/authentication',
  },
  setQueryData: {
    kind: 'Helper',
    purpose: 'Replaces cached query data with a new value.',
    guide: '/docs/data-fetching/caching-reuse',
  },
  updateAllQueries: {
    kind: 'Helper',
    purpose: 'Applies an updater across multiple cached query results.',
    guide: '/docs/data-fetching/caching-reuse',
  },
  updateQuery: {
    kind: 'Helper',
    purpose: 'Applies an updater to one cached query result.',
    guide: '/docs/data-fetching/caching-reuse',
  },
  useConvex: {
    kind: 'Composable',
    purpose: 'Gives direct access to the underlying Convex client.',
    guide: '/docs/guide/basics',
  },
  useConvexAction: {
    kind: 'Composable',
    purpose: 'Runs Convex actions with reactive status and error handling.',
    guide: '/docs/mutations/actions',
  },
  useConvexAuth: {
    kind: 'Composable',
    purpose: 'Tracks auth state and user/session information in Nuxt.',
    guide: '/docs/auth-security/authentication',
  },
  useConvexConnectionState: {
    kind: 'Composable',
    purpose: 'Observes live WebSocket connection state to Convex.',
    guide: '/docs/advanced/connection-state',
  },
  useConvexFileUpload: {
    kind: 'Composable',
    purpose: 'Uploads files to Convex storage with progress tracking.',
    guide: '/docs/advanced/file-storage',
  },
  useConvexMutation: {
    kind: 'Composable',
    purpose: 'Runs Convex mutations with status, errors, and optimistic hooks.',
    guide: '/docs/mutations/mutations',
  },
  useConvexPaginatedQuery: {
    kind: 'Composable',
    purpose: 'Fetches and paginates query results with real-time updates.',
    guide: '/docs/data-fetching/pagination',
  },
  useConvexQuery: {
    kind: 'Composable',
    purpose: 'Fetches reactive query data with SSR and subscription support.',
    guide: '/docs/data-fetching/queries',
  },
  useConvexUser: {
    kind: 'Composable',
    purpose: 'Seeds from session user, then upgrades to canonical user/profile data.',
    guide: '/docs/auth-security/authentication',
  },
  useConvexStorageUrl: {
    kind: 'Composable',
    purpose: 'Resolves Convex file storage IDs to usable URLs.',
    guide: '/docs/advanced/file-storage',
  },
  useConvexUploadQueue: {
    kind: 'Composable',
    purpose: 'Queues and coordinates concurrent file uploads.',
    guide: '/docs/advanced/file-storage',
  },
}

const serverMeta = {
  serverConvexAction: {
    kind: 'Server helper',
    purpose: 'Runs a Convex action from server routes/handlers.',
    guide: '/docs/server-side/server-routes',
  },
  serverConvexClearAuthCache: {
    kind: 'Server helper',
    purpose: 'Clears cached auth token state used by server calls.',
    guide: '/docs/server-side/ssr-hydration',
  },
  serverConvexMutation: {
    kind: 'Server helper',
    purpose: 'Runs a Convex mutation from server routes/handlers.',
    guide: '/docs/server-side/server-routes',
  },
  serverConvexQuery: {
    kind: 'Server helper',
    purpose: 'Runs a Convex query from server routes/handlers.',
    guide: '/docs/server-side/server-routes',
  },
}

const componentMeta = {
  ConvexAuthenticated: {
    kind: 'Component',
    purpose: 'Renders slot content only for authenticated users.',
    guide: '/docs/auth-security/authentication',
  },
  ConvexAuthError: {
    kind: 'Component',
    purpose: 'Renders slot content when auth resolves with an error.',
    guide: '/docs/auth-security/authentication',
  },
  ConvexAuthLoading: {
    kind: 'Component',
    purpose: 'Renders slot content while auth state is still loading.',
    guide: '/docs/auth-security/authentication',
  },
  ConvexUnauthenticated: {
    kind: 'Component',
    purpose: 'Renders slot content only for signed-out users.',
    guide: '/docs/auth-security/authentication',
  },
}

function fallbackMeta(name, defaultKind = 'Helper') {
  return {
    kind: name.startsWith('use') ? 'Composable' : defaultKind,
    purpose: 'Auto-imported runtime API provided by this module.',
    guide: '/docs/guide/get-started',
  }
}

function toRows(names, meta, options = {}) {
  const { component = false, defaultKind = 'Helper' } = options
  return names
    .map((name) => {
      const details = meta[name] ?? fallbackMeta(name, defaultKind)
      const displayName = component ? `<${name}>` : name
      return `| \`${displayName}\` | ${details.kind} | ${details.purpose} | [Guide](${details.guide}) |`
    })
    .join('\n')
}

const file = `---
title: API Surface
description: Generated reference of auto-imported composables, server helpers, and global auth components.
navigation:
  icon: i-lucide-list
---

This page is generated from module entrypoints and runtime component files.

Source of truth:
- [src/module-api-surface.ts](${repoBase}/blob/main/src/module-api-surface.ts)
- [src/runtime/composables/index.ts](${repoBase}/blob/main/src/runtime/composables/index.ts)
- [src/runtime/server/utils](${repoBase}/tree/main/src/runtime/server/utils)
- [src/runtime/components](${repoBase}/tree/main/src/runtime/components)

This reference answers:
- Which APIs are auto-imported?
- Which Nuxt aliases are registered?
- What is each API for?
- Where is the best guide for examples and deeper usage?

Regenerate this page with:

\`\`\`bash
node scripts/generate-api-surface.mjs
\`\`\`

## Nuxt Aliases

| Alias | Points To | Supported Contexts |
| ----- | --------- | ------------------ |
| \`#convex/api\` | Your app's \`convex/_generated/api\` | Vue components, composables, route middleware, Nitro server routes, tests |
| \`#convex/server\` | \`better-convex-nuxt\` server exports | Nitro server routes and Convex-adjacent server utilities |

Use \`#convex/api\` for generated Convex functions:

\`\`\`ts
import { api } from '#convex/api'
\`\`\`

Before Convex codegen creates \`convex/_generated/api\`, this alias points to a typed placeholder that keeps imports working and fails with a codegen message if accessed.

Use \`#convex/server\` when an explicit server import is clearer than relying on Nuxt auto-imports, or for exports that are intentionally not auto-imported:

\`\`\`ts
import { serverConvexQuery } from '#convex/server'
\`\`\`

\`createUserSyncTriggers\` runs inside your \`convex/\` functions, where Nuxt aliases do not exist. Import it from its dedicated subpath instead:

\`\`\`ts
import { createUserSyncTriggers } from 'better-convex-nuxt/server/createUserSyncTriggers'
\`\`\`

## Composable Auto-Imports

\`useConvexAuth\`, \`useConvexUser\`, \`createBetterConvexAuthClient\`, and the global auth components are available when module auth is enabled.

| Name | Kind | Purpose | Learn More |
| ---- | ---- | ------- | ---------- |
${toRows(composableImports, composableMeta)}

## Server Auto-Imports

| Name | Kind | Purpose | Learn More |
| ---- | ---- | ------- | ---------- |
${toRows(serverImports, serverMeta, { defaultKind: 'Server helper' })}

## Global Auth Components

| Name | Kind | Purpose | Learn More |
| ---- | ---- | ------- | ---------- |
${toRows(componentNames, componentMeta, { component: true, defaultKind: 'Component' })}
`

if (checkOnly) {
  const current = readFileSync(outputPath, 'utf8')
  if (current !== file) {
    console.error(`${outputPath} is stale. Run: pnpm run docs:api-surface`)
    process.exit(1)
  }
  console.log(`API surface docs are up to date (${outputPath})`)
} else {
  writeFileSync(outputPath, file)
  console.log(`Generated ${outputPath}`)
}
