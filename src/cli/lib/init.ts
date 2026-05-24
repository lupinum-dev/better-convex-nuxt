import { access, mkdir, readFile, writeFile } from 'node:fs/promises'
import { basename, dirname, resolve } from 'node:path'

import { buildResourceTemplateSet } from './resource.js'
import {
  renderAddFixture,
  renderAppStarterFixture,
  renderAppStarterFixtureSubset,
} from './starter-fixtures.js'

export type AppTemplate = 'public' | 'personal' | 'workspace' | 'workspace-mcp'

export interface TemplateFile {
  path: string
  content: string
  ownership: 'authored' | 'generated'
}

export interface InitTemplateSet {
  label: string
  description: string
  files: TemplateFile[]
  afterWrite?: (cwd: string) => Promise<void>
}

export type CanonicalAppTemplate = 'public' | 'personal' | 'workspace' | 'workspace-mcp'
export type AddFeature = 'mcp' | 'uploads' | 'operation' | 'entity'

const mcpAddFixturePaths = [
  'server/middleware/mcp-auth.ts',
  'server/mcp/index.ts',
  'server/mcp/runtime.ts',
  'server/mcp/tools/list-todos.ts',
  'server/mcp/tools/create-todo.ts',
  'convex/features/mcpKeys/domain.ts',
] as const

function buildAppTemplateSet(template: AppTemplate, appName: string): InitTemplateSet {
  return {
    label: `app:${template}`,
    description: `Bootstrap a ${template} Trellis app inside the current workspace`,
    files: renderAppStarterFixture({ appName, template }),
  }
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

async function writeTemplateFiles(
  cwd: string,
  files: TemplateFile[],
  force: boolean,
): Promise<{ written: string[]; skipped: string[] }> {
  const written: string[] = []
  const skipped: string[] = []

  for (const file of files) {
    const destination = resolve(cwd, file.path)
    const exists = await pathExists(destination)
    if (exists && !force) {
      skipped.push(file.path)
      continue
    }

    await mkdir(dirname(destination), { recursive: true })
    await writeFile(destination, file.content, 'utf8')
    written.push(file.path)
  }

  return { written, skipped }
}

export async function applyInitTemplateSet(
  cwd: string,
  templateSet: InitTemplateSet,
  force: boolean,
): Promise<{
  written: string[]
  skipped: string[]
  authored: string[]
  generated: string[]
}> {
  const { written, skipped } = await writeTemplateFiles(cwd, templateSet.files, force)
  await templateSet.afterWrite?.(cwd)

  return {
    written,
    skipped,
    authored: templateSet.files
      .filter((file) => file.ownership === 'authored')
      .map((file) => file.path),
    generated: templateSet.files
      .filter((file) => file.ownership === 'generated')
      .map((file) => file.path),
  }
}

function appPackageName(name: string): string {
  return (
    name
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'trellis-app'
  )
}

function addMcpKeysSchemaBlock() {
  return `

  mcpKeys: defineTable({
    hash: v.string(),
    name: v.string(),
    boundUserId: v.id('users'),
    boundWorkspaceId: v.id('workspaces'),
    status: v.union(v.literal('active'), v.literal('revoked')),
    createdAt: v.number(),
    lastUsedAt: v.optional(v.number()),
  })
    .index('by_hash', ['hash'])
    .index('by_bound_workspace', ['boundWorkspaceId']),
`
}

async function rewriteFile(path: string, rewrite: (source: string) => string): Promise<void> {
  const source = await readFile(path, 'utf8')
  const next = rewrite(source)
  if (next === source) {
    throw new Error(`Unable to update ${basename(path)} for the requested scaffold.`)
  }
  await writeFile(path, next, 'utf8')
}

async function enableNuxtMcpConfig(cwd: string): Promise<void> {
  const path = resolve(cwd, 'nuxt.config.ts')
  await rewriteFile(path, (source) => {
    const appName = appPackageName(basename(cwd))
    const namedConfig = `mcp: { name: '${appName}', sessions: true }`

    if (/mcp:\s*\{/.test(source)) {
      return source.replace(/mcp:\s*\{[^}]+\}/, namedConfig)
    }

    let next = source
    if (next.includes("modules: ['@lupinum/trellis']") && !next.includes('@nuxtjs/mcp-toolkit')) {
      next = next.replace(
        "modules: ['@lupinum/trellis']",
        "modules: ['@lupinum/trellis', '@nuxtjs/mcp-toolkit']",
      )
    }

    if (/modules:\s*\[[\s\S]*?@lupinum\/trellis[\s\S]*?\],/.test(next)) {
      return next.replace(/(modules:\s*\[[\s\S]*?\],\n)/, `$1  ${namedConfig},\n`)
    }

    if (next.includes("permissions: '")) {
      return next.replace(/(permissions:\s*'[^']+',\n)/, `$1    ${namedConfig},\n`)
    }

    const trellisStart = next.indexOf('trellis: {')
    if (trellisStart === -1) {
      return next
    }

    const trellisClose = next.indexOf('\n  },', trellisStart)
    if (trellisClose === -1) {
      return next
    }

    return `${next.slice(0, trellisClose)}\n    ${namedConfig},${next.slice(trellisClose)}`
  })
}

async function addMcpDependency(cwd: string): Promise<void> {
  const path = resolve(cwd, 'package.json')
  const source = await readFile(path, 'utf8')
  const parsed = JSON.parse(source) as {
    dependencies?: Record<string, string>
  }
  parsed.dependencies ??= {}
  parsed.dependencies['@nuxtjs/mcp-toolkit'] = '^0.16.1'
  await writeFile(path, `${JSON.stringify(parsed, null, 2)}\n`, 'utf8')
}

async function enableWorkspaceMcpSchema(cwd: string): Promise<void> {
  const path = resolve(cwd, 'convex/schema.ts')
  await rewriteFile(path, (source) => {
    if (source.includes('mcpKeys: defineTable')) return source
    return source.replace(/\n\}\)\s*$/m, `${addMcpKeysSchemaBlock()}\n})`)
  })
}

function pascalCase(value: string): string {
  return value
    .replace(/[^a-z0-9]+/gi, ' ')
    .split(' ')
    .filter(Boolean)
    .map((part) => part[0]!.toUpperCase() + part.slice(1))
    .join('')
}

function kebabCase(value: string): string {
  return value
    .trim()
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/[^a-z0-9]+/gi, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase()
}

function operationTemplate(name: string, kind: 'safe' | 'destructive') {
  const opId = kebabCase(name)
  const exportName = pascalCase(name)

  if (kind === 'destructive') {
    return `
import { authRequired } from '@lupinum/trellis/auth'
import { defineOperation, operationPreview, previewOf } from '@lupinum/trellis/backend'
import { v } from 'convex/values'

import { mutation } from '../functions'

export const ${exportName}Op = defineOperation({
  id: '${opId}',
  name: '${exportName}',
  kind: 'destructive',
  args: {
    id: v.string(),
  },
  guard: authRequired,
  preview: async (_ctx, args) =>
    operationPreview({
      summary: \`Confirm ${opId} for \${args.id}\`,
      confirm: {
        id: args.id,
      },
    }),
  handler: async (_ctx, args) => {
    throw new Error(\`Implement ${opId} for \${args.id}.\`)
  },
})

export const preview${exportName} = mutation.protected(previewOf(${exportName}Op))
export const execute${exportName} = mutation.protected(${exportName}Op)
`.trimStart()
  }

  return `
import { authRequired } from '@lupinum/trellis/auth'
import { defineOperation } from '@lupinum/trellis/backend'
import { v } from 'convex/values'

export const ${exportName}Op = defineOperation({
  name: '${exportName}',
  args: {
    id: v.string(),
  },
  guard: authRequired,
  handler: async (_ctx, args) => {
    throw new Error(\`Implement ${opId} for \${args.id}.\`)
  },
})
`.trimStart()
}

export function getCanonicalAppTemplateSet(options: {
  appName: string
  template: CanonicalAppTemplate
  mcp?: boolean
}): InitTemplateSet {
  const template =
    options.template === 'workspace' && options.mcp === true ? 'workspace-mcp' : options.template
  const appTemplateSet = buildAppTemplateSet(template, options.appName)

  return {
    label: `init:${template}`,
    description: `Bootstrap a ${template} Trellis app`,
    files: appTemplateSet.files,
  }
}

export async function getAddTemplateSet(options: {
  feature: AddFeature
  cwd: string
  name?: string
  kind?: 'safe' | 'destructive'
  appName?: string
}): Promise<InitTemplateSet> {
  if (options.feature === 'mcp') {
    return {
      label: 'add:mcp',
      description: 'Add the canonical MCP runtime to a workspace app',
      files: renderAppStarterFixtureSubset({
        appName: options.appName ?? basename(options.cwd),
        template: 'workspace-mcp',
        paths: mcpAddFixturePaths,
      }),
      afterWrite: async (cwd) => {
        await enableNuxtMcpConfig(cwd)
        await addMcpDependency(cwd)
        await enableWorkspaceMcpSchema(cwd)
      },
    }
  }

  if (options.feature === 'uploads') {
    return {
      label: 'add:uploads',
      description: 'Add a canonical upload URL seam and starter page',
      files: renderAddFixture({ fixture: 'uploads' }),
    }
  }

  if (options.feature === 'entity') {
    if (!options.name) {
      throw new Error('`trellis add entity <name>` requires an entity name.')
    }

    return await buildResourceTemplateSet(options.cwd, options.name)
  }

  if (!options.name) {
    throw new Error('`trellis add operation <name>` requires an operation name.')
  }

  return {
    label: `add:operation:${kebabCase(options.name)}`,
    description: 'Add a canonical operation scaffold',
    files: [
      {
        path: `convex/operations/${kebabCase(options.name)}.ts`,
        content: operationTemplate(options.name, options.kind ?? 'safe'),
        ownership: 'authored',
      },
    ],
  }
}
