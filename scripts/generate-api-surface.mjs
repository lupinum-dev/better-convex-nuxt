#!/usr/bin/env node
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const rootDir = process.cwd()
const modulePath = resolve(rootDir, 'src/module.ts')
const componentsDir = resolve(rootDir, 'src/runtime/components')
const outputPath = resolve(rootDir, 'docs/content/docs/6.advanced/8.api-surface.md')
const packageJsonPath = resolve(rootDir, 'package.json')

const moduleSource = readFileSync(modulePath, 'utf8')
const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8'))

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

function extractNames(pattern) {
  const names = new Set()
  for (const match of moduleSource.matchAll(pattern)) {
    if (!match[1]) continue
    names.add(match[1])
  }
  return [...names].sort((a, b) => a.localeCompare(b))
}

const composableImports = extractNames(
  /name:\s*'([^']+)'\s*,\s*from:\s*resolver\.resolve\('\.\/runtime\/composables\/[^']+'\)/g,
)
const serverImports = extractNames(
  /name:\s*'([^']+)'\s*,\s*from:\s*resolver\.resolve\('\.\/runtime\/server\/utils\/[^']+'\)/g,
)
const componentNames = readdirSync(componentsDir)
  .filter((name) => name.endsWith('.vue'))
  .map((name) => name.replace(/\.vue$/, ''))
  .sort((a, b) => a.localeCompare(b))

const composableMeta = {
  createPermissions: {
    kind: 'Factory',
    purpose: 'Builds a typed permission API for route/UI guards and capability checks.',
    guide: '/docs/auth-security/permissions',
  },
  defineSharedConvexQuery: {
    kind: 'Helper',
    purpose: 'Creates a shared query instance that is reused across a Nuxt app/request.',
    guide: '/docs/data-fetching/queries',
  },
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
  getQueryKey: {
    kind: 'Helper',
    purpose: 'Creates a stable query cache key for invalidation and updates.',
    guide: '/docs/data-fetching/caching-reuse',
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
  optimisticallyUpdateValueInPaginatedQuery: {
    kind: 'Helper',
    purpose: 'Optimistically updates matching items across paginated query pages.',
    guide: '/docs/mutations/optimistic-updates',
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
  updateInPaginatedQuery: {
    kind: 'Helper',
    purpose: 'Optimistically updates matching items across paginated query pages.',
    guide: '/docs/mutations/optimistic-updates',
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
  useConvexCall: {
    kind: 'Composable',
    purpose: 'Runs imperative one-shot query, mutation, or action calls on the client.',
    guide: '/docs/data-fetching/queries',
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
    purpose:
      'Clears cached auth token state for Nuxt server routes via the `#imports` auto-import surface.',
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
- [src/module.ts](${repoBase}/blob/main/src/module.ts)
- [src/runtime/composables/index.ts](${repoBase}/blob/main/src/runtime/composables/index.ts)
- [src/runtime/server/utils](${repoBase}/tree/main/src/runtime/server/utils)
- [src/runtime/server/utils/auth-cache.ts](${repoBase}/blob/main/src/runtime/server/utils/auth-cache.ts)
- [src/runtime/components](${repoBase}/tree/main/src/runtime/components)

This reference answers:
- Which APIs are auto-imported?
- What is each API for?
- Where is the best guide for examples and deeper usage?

Note:
- Server APIs listed here are Nuxt auto-imports available from \`#imports\`.
- The package export \`better-convex-nuxt/server\` is narrower and should not be assumed to match the full Nuxt auto-import surface.

Regenerate this page with:

\`\`\`bash
node scripts/generate-api-surface.mjs
\`\`\`

## Composable Auto-Imports

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

writeFileSync(outputPath, file)
console.log(`Generated ${outputPath}`)
