#!/usr/bin/env node
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const rootDir = process.cwd()
const checkMode = process.argv.includes('--check')

const packageJsonPath = resolve(rootDir, 'package.json')
const installerPaths = {
  core: resolve(rootDir, 'src/installers/core.ts'),
  auth: resolve(rootDir, 'src/installers/auth.ts'),
  permissions: resolve(rootDir, 'src/installers/permissions.ts'),
  advanced: resolve(rootDir, 'src/installers/advanced.ts'),
}
const componentsDir = resolve(rootDir, 'src/runtime/components')
const outputPath = resolve(rootDir, 'docs/content/docs/12.api-reference/7.api-surface.md')

const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8'))
const installerSources = Object.fromEntries(
  Object.entries(installerPaths).map(([key, path]) => [key, readFileSync(path, 'utf8')]),
)

function extractNames(block) {
  const names = new Set()
  for (const match of block.matchAll(/name:\s*'([^']+)'/g)) {
    if (match[1]) names.add(match[1])
  }
  return [...names].sort((a, b) => a.localeCompare(b))
}

function extractAliases(source) {
  const aliases = new Set()
  for (const match of source.matchAll(/nuxt\.options\.alias\['([^']+)'\]/g)) {
    if (match[1]) aliases.add(match[1])
  }
  return [...aliases].sort((a, b) => a.localeCompare(b))
}

function extractCallBlock(source, callName) {
  const start = source.indexOf(`${callName}([`)
  if (start === -1) return ''

  let depth = 0
  let inString = false
  let stringQuote = ''
  let escaped = false

  for (let index = start; index < source.length; index++) {
    const char = source[index]
    if (inString) {
      if (escaped) {
        escaped = false
      } else if (char === '\\') {
        escaped = true
      } else if (char === stringQuote) {
        inString = false
        stringQuote = ''
      }
      continue
    }

    if (char === "'" || char === '"' || char === '`') {
      inString = true
      stringQuote = char
      continue
    }

    if (char === '(' || char === '[' || char === '{') depth++
    if (char === ')' || char === ']' || char === '}') depth--

    if (depth === 0 && char === ')') {
      return source.slice(start, index + 1)
    }
  }

  return ''
}

function toImportPath(key) {
  return key === '.' ? '@lupinum/trellis' : `@lupinum/trellis/${key.replace(/^\.\//, '')}`
}

function toDocRows(items, detailMap) {
  return items.map((item) => {
    const detail = detailMap[item] ?? 'Runtime API'
    return [`\`${item}\``, detail]
  })
}

function makeTable(headers, rows) {
  const widths = headers.map((header, index) =>
    Math.max(header.length, ...rows.map((row) => (row[index] ?? '').length)),
  )

  const formatRow = (row) =>
    `| ${row.map((cell, index) => (cell ?? '').padEnd(widths[index])).join(' | ')} |`

  return [
    formatRow(headers),
    formatRow(widths.map((width) => '-'.repeat(width))),
    ...rows.map(formatRow),
  ].join('\n')
}

const alwaysAutoImports = extractNames(extractCallBlock(installerSources.core, 'addImports'))
const authAutoImports = extractNames(extractCallBlock(installerSources.auth, 'addImports'))
const permissionAutoImports = extractNames(
  extractCallBlock(installerSources.permissions, 'addImports'),
)
const serverAutoImports = extractNames(extractCallBlock(installerSources.core, 'addServerImports'))
const aliases = extractAliases(`${installerSources.core}\n${installerSources.advanced}`)
const components = readdirSync(componentsDir)
  .filter((name) => name.endsWith('.vue'))
  .map((name) => name.replace(/\.vue$/, ''))
  .sort((a, b) => a.localeCompare(b))
const packageSubpaths = Object.keys(packageJson.exports).sort((a, b) => a.localeCompare(b))

const clientDetails = {
  appendTo: 'Optimistic update helper',
  executeConvexQuery:
    'Nuxt auto-import only: one-shot query execution without full composable state',
  getQueryKey: 'Shared cache key helper',
  prependTo: 'Optimistic update helper',
  removeFrom: 'Optimistic update helper',
  updateIn: 'Optimistic update helper',
  useCachedQuery: 'Query composable seeded from an already-fetched parent query',
  useConvex: 'Raw Convex client access',
  useConvexAction: 'Action composable with status tracking',
  useConvexAuth: 'Auth state composable',
  useConvexAuthActions: 'Better Auth action wrapper with refresh + redirect handling',
  useConvexConnectionState: 'Connection state composable',
  useConvexMutation: 'Mutation composable with optimistic hooks',
  useConvexPaginatedQuery: 'Paginated query composable',
  useConvexQuery: 'Query composable with SSR + subscriptions',
  useConvexStorageUrl: 'Storage URL helper',
  useConvexUpload: 'Upload composable',
}

const permissionDetails = {
  useAuthGuard: 'Available only when `trellis.permissions.query` is configured',
  usePermissions: 'Available only when `trellis.permissions.query` is configured',
}

const serverDetails = {
  serverConvexAction: 'Nuxt server auto-import and package export from `@lupinum/trellis/server`',
  serverConvexClearAuthCache: 'Nuxt server auto-import only',
  serverConvexMutation: 'Nuxt server auto-import and package export from `@lupinum/trellis/server`',
  serverConvexQuery: 'Nuxt server auto-import and package export from `@lupinum/trellis/server`',
  validateConvexArgs: 'Nuxt server auto-import only',
}

const aliasDetails = {
  '#trellis': 'Nuxt alias generated by the module; re-exports the runtime composables barrel',
  '#trellis/api':
    'Nuxt alias generated by the module; points at the app-local `convex/_generated/api` entrypoint',
  '#trellis/mcp':
    'Nuxt alias generated by the module; re-exports the MCP entrypoint inside the app',
  '#trellis/server':
    'Nuxt alias generated by the module; re-exports the server entrypoint inside the app',
}

const packageRows = packageSubpaths.map((key) => {
  const label = key === '.' ? 'root module' : key.replace(/^\.\//, '')
  return [`\`${toImportPath(key)}\``, label]
})

const file = [
  '---',
  "title: 'API Surface'",
  "description: 'Generated reference for package subpaths, Nuxt auto-imports, aliases, and auth components.'",
  '---',
  '',
  'This page is generated from:',
  '',
  '- `package.json` package exports',
  '- `src/installers/*`',
  '- `src/runtime/components/*`',
  '',
  'Use it to answer one question first: **is this API a package import, a Nuxt auto-import, or a generated alias?**',
  '',
  '## Which Surface Do I Use?',
  '',
  '- Vue component or composable: start with Nuxt auto-imports like `useConvexQuery()` and `useConvexMutation()`.',
  '- Nuxt server route, server middleware, or Nitro endpoint: use server auto-imports or `@lupinum/trellis/server`.',
  '- Convex backend code: use package subpaths such as `@lupinum/trellis/auth`, `@lupinum/trellis/functions`, or `@lupinum/trellis/args`.',
  '- App-local generated Convex schema: use `#trellis/api`.',
  '- Advanced MCP-only app wiring: use `#trellis/mcp` or `@lupinum/trellis/mcp` depending on runtime context.',
  '',
  '## Package Subpaths',
  '',
  'These are the published npm entrypoints.',
  '',
  makeTable(['Import', 'Surface'], packageRows),
  '',
  '## Nuxt Auto-Imports',
  '',
  'These are available inside a Nuxt app that has the module installed. The intended ladder is: core first, then auth, then permissions.',
  '',
  '### Core Client Auto-Imports',
  '',
  makeTable(['Name', 'Notes'], toDocRows(alwaysAutoImports, clientDetails)),
  '',
  '### Auth-Enabled Auto-Imports',
  '',
  'These are registered only when `trellis.auth` is enabled.',
  '',
  makeTable(['Name', 'Notes'], toDocRows(authAutoImports, clientDetails)),
  '',
  '### Permission-Configured Auto-Imports',
  '',
  'These are registered only when `trellis.permissions.query` is configured.',
  '',
  makeTable(['Name', 'Notes'], toDocRows(permissionAutoImports, permissionDetails)),
  '',
  '### Server Auto-Imports',
  '',
  'These are available from Nuxt server files via `#imports`.',
  '',
  makeTable(['Name', 'Notes'], toDocRows(serverAutoImports, serverDetails)),
  '',
  '## Nuxt Aliases',
  '',
  'These aliases are generated inside the consumer app by the module.',
  '',
  makeTable(['Alias', 'Notes'], toDocRows(aliases, aliasDetails)),
  '',
  '## Global Auth Components',
  '',
  'These components are globally registered only when `trellis.auth` is enabled.',
  '',
  makeTable(
    ['Component', 'Notes'],
    components.map((name) => [`\`<${name}>\``, 'Global auth component']),
  ),
  '',
  '## Important Boundaries',
  '',
  '- `@lupinum/trellis/server` is a **package export**.',
  '- `serverConvexClearAuthCache` and `validateConvexArgs` are **Nuxt server auto-imports**, not package subpath exports.',
  '- `#trellis/mcp` and `#trellis/server` are **generated Nuxt aliases**, not bare npm specifiers.',
  '- `usePermissions()` and `useAuthGuard()` are **config-driven auto-imports**, not package subpath exports.',
  '',
].join('\n')

if (checkMode) {
  const current = readFileSync(outputPath, 'utf8')
  if (current !== file) {
    console.error('[docs] API surface page is stale. Run `pnpm docs:api-surface`.')
    process.exit(1)
  }
  process.exit(0)
}

writeFileSync(outputPath, file)
console.log(`Generated ${outputPath}`)
