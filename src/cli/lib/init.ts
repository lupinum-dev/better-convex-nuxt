import { access, mkdir, readFile, writeFile } from 'node:fs/promises'
import { basename, dirname, resolve } from 'node:path'

import {
  appShellTemplate,
  authConfigTemplate,
  authTsTemplate,
  cmsChecksTemplate,
  cmsFeaturesIndexTemplate,
  cmsPagesTemplate,
  cmsPagesFeatureTemplate,
  cmsPagesIndexTemplate,
  cmsPagesSchemaTemplate,
  cmsPermissionQueryTemplate,
  cmsPermissionsTemplate,
  cmsPublicPageTemplate,
  cmsSchemaTemplate,
  cmsSlugPageTemplate,
  cmsStudioPageTemplate,
  cmsUsersFeatureTemplate,
  cmsUsersIndexTemplate,
  cmsUsersSchemaTemplate,
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
  routeShellTemplate,
  testSetupTemplate,
  todoContractTemplate,
  uploadsContractTemplate,
  uploadsDomainTemplate,
  uploadsPageTemplate,
  workspaceActorTemplate,
  workspaceChecksTemplate,
  workspaceFeaturesIndexTemplate,
  workspaceFunctionsAppTemplate,
  workspaceFunctionsTemplate,
  workspacePageTemplate,
  workspacePermissionQueryTemplate,
  workspacePrincipalTemplate,
  workspaceSchemaTemplate,
  workspaceTodosFeatureTemplate,
  workspaceTodosIndexTemplate,
  workspaceTodosPermissionsTemplate,
  workspaceTodosSchemaTemplate,
  workspaceTodosTemplate,
  workspaceUsersFeatureTemplate,
  workspaceUsersIndexTemplate,
  workspaceUsersSchemaTemplate,
  workspaceWorkspacesContractTemplate,
  workspaceWorkspacesDomainTemplate,
  workspaceWorkspacesFeatureTemplate,
  workspaceWorkspacesIndexTemplate,
  workspaceWorkspacesSchemaTemplate,
} from './init-templates.js'
import { buildResourceTemplateSet } from './resource.js'
import { isFixtureBackedAppTemplate, renderAppStarterFixture } from './starter-fixtures.js'

export type AppTemplate = 'public' | 'personal' | 'workspace' | 'workspace-mcp' | 'cms'

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

export type CanonicalAppTemplate = 'public' | 'personal' | 'workspace' | 'workspace-mcp' | 'cms'
export type AddFeature = 'mcp' | 'uploads' | 'operation' | 'entity'

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
    label: 'auth:personal',
    description: 'Scaffold app-owned personal actor and guard files',
    files: [
      { path: 'convex/auth/actor.ts', content: personalActorTemplate(), ownership: 'authored' },
      {
        path: 'convex/functions.ts',
        content: personalFunctionsTemplate(),
        ownership: 'authored',
      },
      {
        path: 'convex/auth/guards.ts',
        content: personalChecksTemplate(),
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
        path: 'convex/auth/guards.ts',
        content: workspaceChecksTemplate(),
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
      {
        path: 'convex/features/index.ts',
        content: workspaceFeaturesIndexTemplate(),
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

function buildAppTemplateSet(template: AppTemplate, appName: string): InitTemplateSet {
  if (template === 'public') {
    return {
      label: 'app:public',
      description: 'Bootstrap a public Trellis app inside the current workspace',
      files: renderAppStarterFixture({ appName, template }),
    }
  }

  if (template === 'personal') {
    return {
      label: 'app:personal',
      description: 'Bootstrap a personal Trellis app inside the current workspace',
      files: renderAppStarterFixture({ appName, template }),
    }
  }

  if (template === 'workspace') {
    return {
      label: 'app:workspace',
      description: 'Bootstrap a workspace Trellis app inside the current workspace',
      files: renderAppStarterFixture({ appName, template }),
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
          path: 'convex/auth/guards.ts',
          content: cmsChecksTemplate(),
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
          path: 'convex/features/index.ts',
          content: cmsFeaturesIndexTemplate(),
          ownership: 'authored',
        },
        {
          path: 'convex/features/pages/schema.ts',
          content: cmsPagesSchemaTemplate(),
          ownership: 'authored',
        },
        {
          path: 'convex/features/pages/permissions.ts',
          content: cmsPermissionsTemplate(),
          ownership: 'authored',
        },
        {
          path: 'convex/features/pages/domain.ts',
          content: cmsPagesTemplate(),
          ownership: 'authored',
        },
        {
          path: 'convex/features/pages/feature.ts',
          content: cmsPagesFeatureTemplate(),
          ownership: 'authored',
        },
        {
          path: 'convex/features/pages/index.ts',
          content: cmsPagesIndexTemplate(),
          ownership: 'authored',
        },
        {
          path: 'convex/features/users/schema.ts',
          content: cmsUsersSchemaTemplate(),
          ownership: 'authored',
        },
        {
          path: 'convex/features/users/feature.ts',
          content: cmsUsersFeatureTemplate(),
          ownership: 'authored',
        },
        {
          path: 'convex/features/users/index.ts',
          content: cmsUsersIndexTemplate(),
          ownership: 'authored',
        },
        {
          path: 'shared/features/pages/contract.ts',
          content: pageContractTemplate(),
          ownership: 'authored',
        },
        {
          path: 'app/features/cms/components/CmsHomePage.vue',
          content: cmsPublicPageTemplate(),
          ownership: 'authored',
        },
        {
          path: 'app/features/cms/components/CmsPublishedPage.vue',
          content: cmsSlugPageTemplate(),
          ownership: 'authored',
        },
        {
          path: 'app/features/cms/components/CmsStudioPage.vue',
          content: cmsStudioPageTemplate(),
          ownership: 'authored',
        },
        {
          path: 'app/app.vue',
          content: appShellTemplate(),
          ownership: 'authored',
        },
        {
          path: 'app/pages/index.vue',
          content: routeShellTemplate({
            importPath: '~~/app/features/cms/components/CmsHomePage.vue',
            componentName: 'CmsHomePage',
          }),
          ownership: 'authored',
        },
        {
          path: 'app/pages/studio.vue',
          content: routeShellTemplate({
            importPath: '~~/app/features/cms/components/CmsStudioPage.vue',
            componentName: 'CmsStudioPage',
          }),
          ownership: 'authored',
        },
        {
          path: 'app/pages/[slug].vue',
          content: routeShellTemplate({
            importPath: '~~/app/features/cms/components/CmsPublishedPage.vue',
            componentName: 'CmsPublishedPage',
          }),
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
        path: 'convex/features/todos/schema.ts',
        content: workspaceTodosSchemaTemplate(),
        ownership: 'authored',
      },
      {
        path: 'convex/features/todos/permissions.ts',
        content: workspaceTodosPermissionsTemplate(),
        ownership: 'authored',
      },
      {
        path: 'convex/features/todos/domain.ts',
        content: workspaceTodosTemplate(),
        ownership: 'authored',
      },
      {
        path: 'convex/features/todos/feature.ts',
        content: workspaceTodosFeatureTemplate(),
        ownership: 'authored',
      },
      {
        path: 'convex/features/todos/index.ts',
        content: workspaceTodosIndexTemplate(),
        ownership: 'authored',
      },
      {
        path: 'shared/features/todos/contract.ts',
        content: todoContractTemplate('workspace'),
        ownership: 'authored',
      },
      {
        path: 'shared/features/workspaces/contract.ts',
        content: workspaceWorkspacesContractTemplate(),
        ownership: 'authored',
      },
      {
        path: 'convex/features/users/schema.ts',
        content: workspaceUsersSchemaTemplate(),
        ownership: 'authored',
      },
      {
        path: 'convex/features/users/feature.ts',
        content: workspaceUsersFeatureTemplate(),
        ownership: 'authored',
      },
      {
        path: 'convex/features/users/index.ts',
        content: workspaceUsersIndexTemplate(),
        ownership: 'authored',
      },
      {
        path: 'convex/features/workspaces/schema.ts',
        content: workspaceWorkspacesSchemaTemplate(),
        ownership: 'authored',
      },
      {
        path: 'convex/features/workspaces/domain.ts',
        content: workspaceWorkspacesDomainTemplate(),
        ownership: 'authored',
      },
      {
        path: 'convex/features/workspaces/feature.ts',
        content: workspaceWorkspacesFeatureTemplate(),
        ownership: 'authored',
      },
      {
        path: 'convex/features/workspaces/index.ts',
        content: workspaceWorkspacesIndexTemplate(),
        ownership: 'authored',
      },
      {
        path: 'convex/features/mcpKeys/domain.ts',
        content: mcpKeysTemplate(),
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
        path: 'app/features/workspace/components/WorkspaceStarterPage.vue',
        content: workspacePageTemplate({ title: 'Workspace MCP Starter', mcp: true }),
        ownership: 'authored',
      },
      {
        path: 'app/app.vue',
        content: appShellTemplate(),
        ownership: 'authored',
      },
      {
        path: 'app/pages/index.vue',
        content: routeShellTemplate({
          importPath: '~~/app/features/workspace/components/WorkspaceStarterPage.vue',
          componentName: 'WorkspaceStarterPage',
        }),
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
    ['@lupinum/trellis', 'workspace:*'],
    ['convex', '^1.34.1'],
    ['nuxt', '^4.4.2'],
  ]

  if (options.template !== 'public') {
    dependencies.unshift(['better-auth', '^1.5.6'])
    dependencies.unshift(['@convex-dev/better-auth', '^0.11.4'])
  }

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
  const lines = ['CONVEX_URL=https://your-app.convex.cloud']

  if (options.template !== 'public') {
    lines.push('CONVEX_SITE_URL=https://your-app.convex.site')
    lines.push('SITE_URL=http://localhost:3000')
    lines.push('BETTER_AUTH_SECRET=replace-me')
  }

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
  const baseTemplate = options.template === 'workspace-mcp' ? 'workspace' : options.template
  const maintainedReferenceLines =
    baseTemplate === 'public'
      ? [
          '- Start with the maintained reference: [`01-public-todo`](https://github.com/lupinum-dev/trellis/tree/main/examples/01-public-todo).',
        ]
      : baseTemplate === 'personal'
        ? [
            '- Start with the maintained reference: [`02-auth-todo`](https://github.com/lupinum-dev/trellis/tree/main/examples/02-auth-todo).',
          ]
        : baseTemplate === 'workspace' && options.mcp
          ? [
              '- Start with the protected-app baseline: [`03-team-workspace`](https://github.com/lupinum-dev/trellis/tree/main/examples/03-team-workspace).',
              '- Then study the MCP branch: [`07-mcp-reference`](https://github.com/lupinum-dev/trellis/tree/main/examples/07-mcp-reference).',
            ]
          : baseTemplate === 'workspace'
            ? [
                '- Start with the maintained reference: [`03-team-workspace`](https://github.com/lupinum-dev/trellis/tree/main/examples/03-team-workspace).',
              ]
            : [
                '- This starter is the simple public-site + signed-in studio baseline.',
                '- Use [`08-component-mini-cms`](https://github.com/lupinum-dev/trellis/tree/main/examples/08-component-mini-cms) only when you need the advanced component-boundary architecture on top of that baseline.',
              ]

  const lines = [
    `# ${options.appName}`,
    '',
    `Generated with \`trellis init ${options.appName} --template ${options.template}${options.mcp && options.template !== 'workspace-mcp' ? ' --mcp' : ''}\`.`,
    '',
    '## Quick start',
    '',
    '```bash',
    'pnpm install',
    'pnpm convex:dev',
    'pnpm dev',
    '```',
    '',
    '## Canonical shape',
    '',
    '- `convex/features/` for backend feature modules',
    '- `shared/features/` for runtime-neutral contracts',
    `- \`convex/auth/\` for actor and guard logic${baseTemplate === 'public' ? ' (not used in the public starter)' : ''}`,
    '- `convex/permissions/` for permission projection when the starter uses permission context',
    '- `app/features/` for feature-owned UI and route shells',
  ]

  if (options.mcp) {
    lines.push('- server/mcp/ for MCP runtime and tools')
  }

  lines.push('', '## Maintained reference', '', ...maintainedReferenceLines, '')

  return `${lines.join('\n')}`
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

  return {
    label: `scaffold:${options.template}`,
    description: 'Scaffold app-root package and canonical shell + features layout',
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
import { defineOperation, previewOf } from '@lupinum/trellis/backend'
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

export const preview${exportName} = query.protected(previewOf(${exportName}Op))
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
  const mcp = options.mcp === true || options.template === 'workspace-mcp'
  const template = options.template === 'workspace' && mcp ? 'workspace-mcp' : options.template
  const scaffoldTemplate = template === 'workspace-mcp' ? 'workspace-mcp' : options.template
  const appTemplateSet = buildAppTemplateSet(template, options.appName)

  return {
    label: `init:${template}`,
    description: `Bootstrap a ${template} Trellis app`,
    files: isFixtureBackedAppTemplate(template)
      ? appTemplateSet.files
      : mergeTemplateSets(
          appScaffoldTemplateSet({
            appName: options.appName,
            template: scaffoldTemplate,
            mcp,
          }),
          appTemplateSet,
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
          path: 'convex/features/mcpKeys/domain.ts',
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
          path: 'shared/features/files/contract.ts',
          content: uploadsContractTemplate(),
          ownership: 'authored',
        },
        {
          path: 'convex/features/files/domain.ts',
          content: uploadsDomainTemplate(),
          ownership: 'authored',
        },
        {
          path: 'app/features/uploads/components/UploadsStarterPage.vue',
          content: uploadsPageTemplate(),
          ownership: 'authored',
        },
        {
          path: 'app/pages/uploads.vue',
          content: routeShellTemplate({
            importPath: '~~/app/features/uploads/components/UploadsStarterPage.vue',
            componentName: 'UploadsStarterPage',
          }),
          ownership: 'authored',
        },
      ],
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
