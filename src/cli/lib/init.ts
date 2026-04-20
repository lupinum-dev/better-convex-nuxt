import { access, mkdir, readFile, writeFile } from 'node:fs/promises'
import { basename, dirname, resolve } from 'node:path'

import {
  authConfigTemplate,
  authTsTemplate,
  cmsChecksTemplate,
  cmsPagesTemplate,
  cmsPermissionQueryTemplate,
  cmsPermissionsTemplate,
  cmsPublicPageTemplate,
  cmsSchemaTemplate,
  cmsSlugPageTemplate,
  cmsStudioPageTemplate,
  convexConfigTemplate,
  httpTemplate,
  mcpCreateTodoToolTemplate,
  mcpKeysTemplate,
  mcpListTodosToolTemplate,
  mcpMiddlewareTemplate,
  mcpRuntimeTemplate,
  pageContractTemplate,
  nuxtConfigTemplate,
  personalActorTemplate,
  personalChecksTemplate,
  personalFunctionsTemplate,
  personalPageTemplate,
  personalPermissionQueryTemplate,
  personalPermissionsTemplate,
  personalSchemaTemplate,
  personalTodosTemplate,
  sharedPageSchemaTemplate,
  sharedTodoSchemaTemplate,
  testSetupTemplate,
  todoContractTemplate,
  uploadsDomainTemplate,
  uploadsPageTemplate,
  workspaceActorTemplate,
  workspaceChecksTemplate,
  workspaceFunctionsAppTemplate,
  workspaceFunctionsTemplate,
  workspaceOnboardingTemplate,
  workspacePageTemplate,
  workspacePermissionQueryTemplate,
  workspacePermissionsTemplate,
  workspacePrincipalTemplate,
  workspaceSchemaTemplate,
  workspaceTodosTemplate,
} from './init-templates.js'
import { buildResourceTemplateSet } from './resource.js'

export type AppTemplate = 'personal' | 'workspace' | 'workspace-mcp' | 'cms'

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

export type CanonicalAppTemplate = 'personal' | 'workspace' | 'cms'
export type AddFeature = 'mcp' | 'uploads' | 'operation' | 'resource'

function buildAuthTemplateSet(): InitTemplateSet {
  return {
    label: 'auth',
    description: 'Scaffold Better Auth + Convex bridge files',
    files: [
      { path: 'convex/auth.ts', content: authTsTemplate(), ownership: 'authored' },
      { path: 'convex/auth.config.ts', content: authConfigTemplate(), ownership: 'generated' },
      { path: 'convex/http.ts', content: httpTemplate(), ownership: 'generated' },
      {
        path: 'convex/convex.config.ts',
        content: convexConfigTemplate(),
        ownership: 'generated',
      },
      { path: 'convex/test.setup.ts', content: testSetupTemplate(), ownership: 'generated' },
    ],
  }
}

function buildPersonalPermissionsTemplateSet(): InitTemplateSet {
  return {
    label: 'permissions:personal',
    description: 'Scaffold app-owned personal actor and permission context files',
    files: [
      { path: 'convex/auth/actor.ts', content: personalActorTemplate(), ownership: 'authored' },
      {
        path: 'convex/functions.ts',
        content: personalFunctionsTemplate(),
        ownership: 'authored',
      },
      {
        path: 'convex/auth/checks.ts',
        content: personalChecksTemplate(),
        ownership: 'authored',
      },
      {
        path: 'convex/auth/permissions.ts',
        content: personalPermissionsTemplate(),
        ownership: 'authored',
      },
      {
        path: 'convex/permissions/context.ts',
        content: personalPermissionQueryTemplate(),
        ownership: 'authored',
      },
    ],
  }
}

function buildWorkspacePermissionsTemplateSet(
  model: 'workspace' | 'workspace-mcp',
): InitTemplateSet {
  return {
    label: `permissions:${model}`,
    description: 'Scaffold workspace permission policy files',
    files: [
      {
        path: 'convex/auth/principal.ts',
        content: workspacePrincipalTemplate(),
        ownership: 'authored',
      },
      {
        path: 'convex/auth/actor.ts',
        content: workspaceActorTemplate(),
        ownership: 'authored',
      },
      {
        path: 'convex/auth/checks.ts',
        content: workspaceChecksTemplate(),
        ownership: 'authored',
      },
      {
        path: 'convex/auth/permissions.ts',
        content: workspacePermissionsTemplate(),
        ownership: 'authored',
      },
      {
        path: 'convex/functions.ts',
        content: workspaceFunctionsTemplate(),
        ownership: 'authored',
      },
      {
        path: 'convex/permissions/context.ts',
        content: workspacePermissionQueryTemplate(),
        ownership: 'authored',
      },
    ],
    afterWrite: async (_cwd) => {
      // Workspace model: userFields in defineAuth should include role: 'member'
    },
  }
}

function buildMcpTemplateSet(): InitTemplateSet {
  return {
    label: 'mcp',
    description: 'Scaffold MCP middleware glue',
    files: [
      {
        path: 'server/middleware/mcp-auth.ts',
        content: mcpMiddlewareTemplate(),
        ownership: 'authored',
      },
      {
        path: 'server/mcp/runtime.ts',
        content: mcpRuntimeTemplate(),
        ownership: 'authored',
      },
    ],
  }
}

function mergeTemplateSets(...sets: InitTemplateSet[]): TemplateFile[] {
  const merged = new Map<string, TemplateFile>()

  for (const set of sets) {
    for (const file of set.files) {
      merged.set(file.path, file)
    }
  }

  return [...merged.values()]
}

function buildAppTemplateSet(template: AppTemplate): InitTemplateSet {
  if (template === 'personal') {
    return {
      label: 'app:personal',
      description: 'Bootstrap a personal Trellis app inside the current workspace',
      files: mergeTemplateSets(
        buildAuthTemplateSet(),
        buildPersonalPermissionsTemplateSet(),
      ).concat([
        {
          path: 'nuxt.config.ts',
          content: nuxtConfigTemplate({
            permissionsQuery: 'permissions/context.getPermissionContext',
          }),
          ownership: 'authored',
        },
        {
          path: 'convex/schema.ts',
          content: personalSchemaTemplate(),
          ownership: 'authored',
        },
        {
          path: 'convex/domain/todos.ts',
          content: personalTodosTemplate(),
          ownership: 'authored',
        },
        {
          path: 'convex/domain/todo.contract.ts',
          content: todoContractTemplate('personal'),
          ownership: 'authored',
        },
        {
          path: 'shared/schemas/todo.ts',
          content: sharedTodoSchemaTemplate('personal'),
          ownership: 'authored',
        },
        {
          path: 'pages/index.vue',
          content: personalPageTemplate(),
          ownership: 'authored',
        },
      ]),
    }
  }

  if (template === 'workspace') {
    return {
      label: 'app:workspace',
      description: 'Bootstrap a workspace Trellis app inside the current workspace',
      files: mergeTemplateSets(
        buildAuthTemplateSet(),
        buildWorkspacePermissionsTemplateSet('workspace'),
      ).concat([
        {
          path: 'nuxt.config.ts',
          content: nuxtConfigTemplate({
            permissionsQuery: 'permissions/context.getPermissionContext',
          }),
          ownership: 'authored',
        },
        {
          path: 'convex/functions.ts',
          content: workspaceFunctionsAppTemplate(),
          ownership: 'authored',
        },
        {
          path: 'convex/schema.ts',
          content: workspaceSchemaTemplate(false),
          ownership: 'authored',
        },
        {
          path: 'convex/operations/onboarding.ts',
          content: workspaceOnboardingTemplate(),
          ownership: 'authored',
        },
        {
          path: 'convex/domain/todos.ts',
          content: workspaceTodosTemplate(),
          ownership: 'authored',
        },
        {
          path: 'convex/domain/todo.contract.ts',
          content: todoContractTemplate('workspace'),
          ownership: 'authored',
        },
        {
          path: 'shared/schemas/todo.ts',
          content: sharedTodoSchemaTemplate('workspace'),
          ownership: 'authored',
        },
        {
          path: 'pages/index.vue',
          content: workspacePageTemplate({ title: 'Workspace Starter', mcp: false }),
          ownership: 'authored',
        },
      ]),
    }
  }

  if (template === 'cms') {
    return {
      label: 'app:cms',
      description: 'Bootstrap a CMS Trellis app with public pages and a signed-in studio',
      files: mergeTemplateSets(buildAuthTemplateSet()).concat([
        {
          path: 'convex/auth/actor.ts',
          content: personalActorTemplate(),
          ownership: 'authored',
        },
        {
          path: 'convex/functions.ts',
          content: personalFunctionsTemplate(),
          ownership: 'authored',
        },
        {
          path: 'convex/auth/checks.ts',
          content: cmsChecksTemplate(),
          ownership: 'authored',
        },
        {
          path: 'convex/auth/permissions.ts',
          content: cmsPermissionsTemplate(),
          ownership: 'authored',
        },
        {
          path: 'convex/permissions/context.ts',
          content: cmsPermissionQueryTemplate(),
          ownership: 'authored',
        },
        {
          path: 'nuxt.config.ts',
          content: nuxtConfigTemplate({
            permissionsQuery: 'permissions/context.getPermissionContext',
          }),
          ownership: 'authored',
        },
        {
          path: 'convex/schema.ts',
          content: cmsSchemaTemplate(),
          ownership: 'authored',
        },
        {
          path: 'convex/domain/pages.ts',
          content: cmsPagesTemplate(),
          ownership: 'authored',
        },
        {
          path: 'convex/domain/page.contract.ts',
          content: pageContractTemplate(),
          ownership: 'authored',
        },
        {
          path: 'shared/schemas/page.ts',
          content: sharedPageSchemaTemplate(),
          ownership: 'authored',
        },
        {
          path: 'pages/index.vue',
          content: cmsPublicPageTemplate(),
          ownership: 'authored',
        },
        {
          path: 'pages/studio.vue',
          content: cmsStudioPageTemplate(),
          ownership: 'authored',
        },
        {
          path: 'pages/[slug].vue',
          content: cmsSlugPageTemplate(),
          ownership: 'authored',
        },
      ]),
    }
  }

  return {
    label: 'app:workspace-mcp',
    description: 'Bootstrap a workspace + MCP Trellis app inside the current workspace',
    files: mergeTemplateSets(
      buildAuthTemplateSet(),
      buildWorkspacePermissionsTemplateSet('workspace-mcp'),
      buildMcpTemplateSet(),
    ).concat([
      {
        path: 'nuxt.config.ts',
        content: nuxtConfigTemplate({
          permissionsQuery: 'permissions/context.getPermissionContext',
          mcp: true,
        }),
        ownership: 'authored',
      },
      {
        path: 'convex/functions.ts',
        content: workspaceFunctionsAppTemplate(),
        ownership: 'authored',
      },
      {
        path: 'convex/schema.ts',
        content: workspaceSchemaTemplate(true),
        ownership: 'authored',
      },
      {
        path: 'convex/operations/onboarding.ts',
        content: workspaceOnboardingTemplate(),
        ownership: 'authored',
      },
      {
        path: 'convex/domain/todos.ts',
        content: workspaceTodosTemplate(),
        ownership: 'authored',
      },
      {
        path: 'convex/domain/todo.contract.ts',
        content: todoContractTemplate('workspace'),
        ownership: 'authored',
      },
      {
        path: 'convex/domain/mcpKeys.ts',
        content: mcpKeysTemplate(),
        ownership: 'authored',
      },
      {
        path: 'shared/schemas/todo.ts',
        content: sharedTodoSchemaTemplate('workspace'),
        ownership: 'authored',
      },
      {
        path: 'server/mcp/tools/list-todos.ts',
        content: mcpListTodosToolTemplate(),
        ownership: 'authored',
      },
      {
        path: 'server/mcp/index.ts',
        content: mcpEndpointTemplate('workspace-app'),
        ownership: 'authored',
      },
      {
        path: 'server/mcp/tools/create-todo.ts',
        content: mcpCreateTodoToolTemplate(),
        ownership: 'authored',
      },
      {
        path: 'pages/index.vue',
        content: workspacePageTemplate({ title: 'Workspace MCP Starter', mcp: true }),
        ownership: 'authored',
      },
    ]),
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

function appPackageTemplate(options: {
  appName: string
  template: CanonicalAppTemplate
  mcp: boolean
}) {
  const dependencies = [
    ['@convex-dev/better-auth', '^0.11.4'],
    ['@lupinum/trellis', 'workspace:*'],
    ['better-auth', '^1.5.6'],
    ['convex', '^1.34.1'],
    ['nuxt', '^4.4.2'],
    ['zod', '^4.3.6'],
  ]

  if (options.mcp) {
    dependencies.splice(2, 0, ['@nuxtjs/mcp-toolkit', '^0.13.4'])
  }

  return `${JSON.stringify(
    {
      name: appPackageName(options.appName),
      private: true,
      type: 'module',
      scripts: {
        dev: 'nuxi dev --dotenv .env.local',
        build: 'nuxi build --dotenv .env.local',
        typecheck: 'nuxi typecheck --dotenv .env.local',
        test: 'vitest run',
        'convex:dev': 'convex dev',
        'convex:codegen': 'convex codegen',
      },
      dependencies: Object.fromEntries(dependencies),
      devDependencies: {
        typescript: '^5.9.3',
        vitest: '^4.1.2',
        'vue-tsc': '^3.2.6',
      },
    },
    null,
    2,
  )}\n`
}

function envExampleTemplate(options: { template: CanonicalAppTemplate; mcp: boolean }) {
  const lines = [
    'CONVEX_URL=https://your-app.convex.cloud',
    'CONVEX_SITE_URL=https://your-app.convex.site',
    'SITE_URL=http://localhost:3000',
    'BETTER_AUTH_SECRET=replace-me',
  ]

  if (options.mcp) {
    lines.push('CONVEX_TRUSTED_FORWARDING_KEY=replace-me')
    lines.push('TRELLIS_MCP_CONFIRMATION_KEY=replace-me')
  }

  return `${lines.join('\n')}\n`
}

function readmeTemplate(options: {
  appName: string
  template: CanonicalAppTemplate
  mcp: boolean
}) {
  return `
# ${options.appName}

Generated with \`trellis init ${options.appName} --template ${options.template}${options.mcp ? ' --mcp' : ''}\`.

## Quick start

\`\`\`bash
pnpm install
pnpm convex:dev
pnpm dev
\`\`\`

## Canonical shape

- \`convex/auth/\` for actor and guard logic
- \`convex/domain/\` for app modules
- \`convex/permissions/\` for permission projection
- \`convex/operations/\` for workflow-style actions
- \`shared/schemas/\` for browser/Nitro edge schemas and DTOs
${options.mcp ? '- \\`server/mcp/\\` for MCP runtime and tools' : ''}
`.trimStart()
}

function gitignoreTemplate() {
  return `
.env.local
.nuxt
.output
node_modules
coverage
dist
`.trimStart()
}

function appScaffoldTemplateSet(options: {
  appName: string
  template: CanonicalAppTemplate
  mcp: boolean
}): InitTemplateSet {
  const files: TemplateFile[] = [
    {
      path: 'package.json',
      content: appPackageTemplate(options),
      ownership: 'generated',
    },
    {
      path: '.env.example',
      content: envExampleTemplate(options),
      ownership: 'generated',
    },
    {
      path: '.gitignore',
      content: gitignoreTemplate(),
      ownership: 'generated',
    },
    {
      path: 'README.md',
      content: readmeTemplate(options),
      ownership: 'generated',
    },
    {
      path: 'server/api/.gitkeep',
      content: '',
      ownership: 'generated',
    },
  ]

  if (!options.mcp) {
    files.push({
      path: 'server/mcp/.gitkeep',
      content: '',
      ownership: 'generated',
    })
  }

  if (options.template !== 'workspace') {
    files.push({
      path: 'convex/operations/.gitkeep',
      content: '',
      ownership: 'generated',
    })
  }

  return {
    label: `scaffold:${options.template}`,
    description: 'Scaffold app-root package and canonical empty lanes',
    files,
  }
}

function mcpEndpointTemplate(appName: string) {
  return `
export default defineMcpHandler({
  name: '${appPackageName(appName)}',
  browserRedirect: '/',
})
`.trimStart()
}

function addMcpKeysSchemaBlock() {
  return `

  mcpKeys: defineTable({
    hash: v.string(),
    name: v.string(),
    boundAuthId: v.string(),
    boundRole: v.union(
      v.literal('owner'),
      v.literal('admin'),
      v.literal('member'),
      v.literal('viewer'),
    ),
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

    if (source.includes("permissions: '")) {
      return source.replace(/(permissions:\s*'[^']+',\n)/, `$1    ${namedConfig},\n`)
    }

    const trellisStart = source.indexOf('trellis: {')
    if (trellisStart === -1) {
      return source
    }

    const trellisClose = source.indexOf('\n  },', trellisStart)
    if (trellisClose === -1) {
      return source
    }

    return `${source.slice(0, trellisClose)}\n    ${namedConfig},${source.slice(trellisClose)}`
  })
}

async function addMcpDependency(cwd: string): Promise<void> {
  const path = resolve(cwd, 'package.json')
  const source = await readFile(path, 'utf8')
  const parsed = JSON.parse(source) as {
    dependencies?: Record<string, string>
  }
  parsed.dependencies ??= {}
  parsed.dependencies['@nuxtjs/mcp-toolkit'] = '^0.13.4'
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
import { defineOperation, previewOf } from '@lupinum/trellis/functions'
import { v } from 'convex/values'

import { mutation, query } from '../functions'

export const ${exportName}Op = defineOperation({
  id: '${opId}',
  name: '${exportName}',
  kind: 'destructive',
  args: {
    id: v.string(),
  },
  guard: authRequired,
  preview: async (_ctx, args) => ({
    display: {
      summary: \`Confirm ${opId} for \${args.id}\`,
    },
    confirm: {
      id: args.id,
    },
  }),
  handler: async (_ctx, args) => {
    throw new Error(\`Implement ${opId} for \${args.id}.\`)
  },
})

export const preview${exportName} = query(previewOf(${exportName}Op))
export const execute${exportName} = mutation(${exportName}Op)
`.trimStart()
  }

  return `
import { authRequired } from '@lupinum/trellis/auth'
import { defineOperation } from '@lupinum/trellis/functions'
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
  const mcp = options.mcp === true
  const template = options.template === 'workspace' && mcp ? 'workspace-mcp' : options.template

  return {
    label: `init:${options.template}${mcp ? '+mcp' : ''}`,
    description: `Bootstrap a ${options.template}${mcp ? ' + MCP' : ''} Trellis app`,
    files: mergeTemplateSets(
      appScaffoldTemplateSet({
        appName: options.appName,
        template: options.template,
        mcp,
      }),
      buildAppTemplateSet(template),
    ),
    afterWrite: mcp
      ? async (cwd) => {
          await enableNuxtMcpConfig(cwd)
        }
      : undefined,
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
      files: mergeTemplateSets(buildMcpTemplateSet()).concat([
        {
          path: 'server/mcp/index.ts',
          content: mcpEndpointTemplate(options.appName ?? 'workspace-app'),
          ownership: 'authored',
        },
        {
          path: 'convex/domain/mcpKeys.ts',
          content: mcpKeysTemplate(),
          ownership: 'authored',
        },
        {
          path: 'server/mcp/tools/list-todos.ts',
          content: mcpListTodosToolTemplate(),
          ownership: 'authored',
        },
        {
          path: 'server/mcp/tools/create-todo.ts',
          content: mcpCreateTodoToolTemplate(),
          ownership: 'authored',
        },
      ]),
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
      files: [
        {
          path: 'convex/domain/files.ts',
          content: uploadsDomainTemplate(),
          ownership: 'authored',
        },
        {
          path: 'pages/uploads.vue',
          content: uploadsPageTemplate(),
          ownership: 'authored',
        },
      ],
    }
  }

  if (options.feature === 'resource') {
    if (!options.name) {
      throw new Error('`trellis add resource <name>` requires a resource name.')
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
