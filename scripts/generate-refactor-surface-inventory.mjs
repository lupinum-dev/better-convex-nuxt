#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, relative, resolve } from 'node:path'

import { collectRepoPublicSurfaceInventory } from './lib/public-surface-inventory.mjs'

const rootDir = process.cwd()
const checkMode = process.argv.includes('--check')
const outputPath = resolve(rootDir, 'meta/refactor/sprint1-public-surface-inventory.md')
const inventory = collectRepoPublicSurfaceInventory(rootDir)

function packageDecision(exportKey) {
  const importPath =
    exportKey === '.' ? '@lupinum/trellis' : `@lupinum/trellis/${exportKey.slice(2)}`
  const decisions = {
    '.': ['keep', 'root Nuxt module remains the app entrypoint'],
    './auth': ['keep', 'auth product layer subpath'],
    './args': ['keep', 'schema/args helper subpath unless merged by Slice 1 decision'],
    './backend': ['keep', 'canonical 1.0 backend builder and operation subpath'],
    './workspace': ['keep', 'workspace, tenant isolation, feature inventory, and visibility helpers'],
    './composables': [
      'keep',
      'client composable subpath unless root-only Nuxt auto-imports replace it',
    ],
    './functions': ['replace', 'hard-cut to @lupinum/trellis/backend'],
    './bridge': ['move/delete', 'bridge APIs leave core for @lupinum/trellis-bridge'],
    './feature': ['move/delete', 'feature manifest helpers fold into @lupinum/trellis/workspace'],
    './eslint': [
      'move/delete',
      'runtime package should not carry tooling unless explicitly retained',
    ],
    './trusted-forwarding': [
      'move/delete',
      'signed helpers are exposed through @lupinum/trellis/backend and server callers',
    ],
    './visibility': ['move/delete', 'visibility/capability helpers fold into @lupinum/trellis/workspace'],
    './mcp': ['keep', 'MCP product layer subpath'],
    './type-primitives': ['keep', 'type-only helper surface unless folded into functions/backend'],
    './server': ['keep', 'Nuxt/Nitro server helper subpath'],
    './testing': ['keep', 'testing helpers stay public but must stop emitting raw forwarding'],
  }
  const [action, note] = decisions[exportKey] ?? ['decide', 'unclassified export']
  return { importPath, action, note }
}

function mdTable(headers, rows) {
  const widths = headers.map((header, index) =>
    Math.max(header.length, ...rows.map((row) => String(row[index] ?? '').length)),
  )
  const format = (row) =>
    `| ${row.map((cell, index) => String(cell ?? '').padEnd(widths[index])).join(' | ')} |`
  return [
    format(headers),
    format(widths.map((width) => '-'.repeat(width))),
    ...rows.map(format),
  ].join('\n')
}

function checklist(items) {
  if (items.length === 0) return '- none'
  return items.map((item) => `- [ ] ${item}`).join('\n')
}

function bulletList(items) {
  if (items.length === 0) return '- none'
  return items.map((item) => `- ${item}`).join('\n')
}

function docsAction(file) {
  if (
    file.startsWith('meta/experiments/') ||
    file === 'meta/rfc-forwarding-envelope.md' ||
    file === 'meta/trellis-1.0-refactor-plan.md'
  ) {
    return 'historical/planning reference allowed'
  }
  if (file.startsWith('meta/adr/')) return 'historical ADR reference allowed'
  return 'rewrite/delete before 1.0 docs gate'
}

const packageRows = inventory.packageExports.map((exportKey) => {
  const decision = packageDecision(exportKey)
  return [`\`${decision.importPath}\``, decision.action, decision.note]
})

const runtimeRows = inventory.runtimeBarrels.map((file) => {
  const surface = file.replace(/^src\/runtime\//, '').replace(/\/index\.ts$/, '')
  const exported = inventory.packageExports.includes(`./${surface}`)
  return [`\`${surface}\``, file, exported ? 'npm export' : 'internal unless promoted']
})

const generatedRows = [
  ...inventory.generatedNuxtSurface.aliases.map((alias) => [
    `alias`,
    `\`${alias}\``,
    'keep in 1.0 generated contract',
  ]),
  ...inventory.generatedNuxtSurface.autoImports.map((autoImport) => [
    `auto-import`,
    `\`${autoImport.name}\``,
    autoImport.layer,
  ]),
  ...inventory.generatedNuxtSurface.serverImports.map((name) => [
    `server import`,
    `\`${name}\``,
    'core installer',
  ]),
  ...inventory.generatedNuxtSurface.authComponents.map((name) => [
    `auth component`,
    `\`<${name}>\``,
    'auth installer',
  ]),
]

const commandRows = [
  ...inventory.cli.commands.map((command) => {
    const action =
      command === 'bridge'
        ? 'move/delete from root CLI'
        : command === 'init'
          ? 'keep; fixture-backed only'
          : command === 'doctor'
            ? 'keep; inventory-backed'
            : command === 'upgrade'
              ? 'keep; inventory-backed migration audit'
              : command === 'explain'
                ? 'keep; inventory-backed operation explain'
                : command === 'add'
                  ? 'keep; fixture/inventory-backed only'
                  : 'delete unless Slice 1 adds an owner'
    return [`command`, `\`trellis ${command}\``, action]
  }),
  ...inventory.cli.initTemplates.map((template) => {
    const action =
      template === 'cms'
        ? 'delete from Trellis starter surface'
        : template === 'workspace-mcp'
          ? 'keep; canonical MCP starter'
          : 'keep; fixture-backed'
    return [`init template`, `\`${template}\``, action]
  }),
]

const docsRows = inventory.staleReferences.docsMatches.map((row) => [
  row.file,
  row.matches.map((match) => `\`${match}\``).join(', '),
  docsAction(row.file),
])
const docsFrontDoorRows = inventory.staleReferences.docsFrontDoorMatches.map((row) => [
  row.file,
  row.matches.map((match) => `\`${match}\``).join(', '),
  'rewrite before docs front-door gate',
])

const decisions = [
  '`@lupinum/trellis/functions` is replaced by `@lupinum/trellis/backend`; no dual public path in 1.0.',
  'Canonical builder spelling is `query.public`, `query.protected`, `mutation.public`, `mutation.protected`, and `mutation.unsafe`.',
  '`cms` is removed from Trellis beginner starters; Ginko owns CMS setup and Trellis keeps only bridge fixtures/docs for package authors.',
  '`trellis bridge` leaves the root Trellis CLI and moves to bridge-owned tooling with `@lupinum/trellis-bridge`.',
  '`workspace-mcp` is the only 1.0 CLI starter spelling; `workspace --mcp` is deleted rather than kept as an alias.',
  '`test:types:public` is the 1.0 public type verification path; the old `public.compat` check is deleted.',
  '`trellis add` remains, but only as a fixture/inventory-backed feature command; old template-backed add slices are replaced with the same fixture discipline as starters.',
]

const requiredProof = [
  'Public-surface snapshot includes npm exports, generated aliases, auto-imports, server imports, auth components, CLI commands, and generated contracts.',
  'Bridge helpers are absent from root/core/functions surfaces.',
  '`tool.fromOperation` is absent from runtime types, docs, templates, doctor, and generated resources.',
  'Raw forwarding fields are absent from production/default validators, test helpers, docs, templates, Ginko bridge paths, and generated bridge files.',
  'Every retained starter is fixture-backed; deleted starters have no CLI path.',
]

const file = [
  '# Sprint 1 Public Surface Inventory',
  '',
  'Status: generated planning artifact',
  '',
  'This file is generated by `node scripts/generate-refactor-surface-inventory.mjs`.',
  'Edit the source script or the 1.0 refactor plan, not this generated output.',
  '',
  '## Package Exports',
  '',
  mdTable(['Import', 'Sprint 1 Action', 'Reason'], packageRows),
  '',
  '## Runtime Barrels',
  '',
  mdTable(['Surface', 'File', 'Current Exposure'], runtimeRows),
  '',
  '## Generated Nuxt Surface',
  '',
  mdTable(['Kind', 'Name', 'Source/Owner'], generatedRows),
  '',
  '## CLI And Starter Surface',
  '',
  mdTable(['Kind', 'Name', 'Sprint 1 Action'], commandRows),
  '',
  '## Docs/Templates That Still Teach Old Paths',
  '',
  mdTable(['File', 'Matched Tokens', 'Action'], docsRows),
  '',
  '## Docs Front Door Old Builder Hits',
  '',
  mdTable(['File', 'Matched Tokens', 'Action'], docsFrontDoorRows),
  '',
  '## Sprint 1 Decisions',
  '',
  bulletList(decisions),
  '',
  '## Required Proof Rows For Slice 1',
  '',
  checklist(requiredProof),
  '',
].join('\n')

if (checkMode) {
  const current = existsSync(outputPath) ? readFileSync(outputPath, 'utf8') : ''
  if (current !== file) {
    console.error(
      '[refactor] Sprint 1 public surface inventory is stale. Run `pnpm run refactor:surface:inventory`.',
    )
    process.exit(1)
  }
  process.exit(0)
}

mkdirSync(dirname(outputPath), { recursive: true })
writeFileSync(outputPath, file)
console.log(`Generated ${relative(rootDir, outputPath)}`)
