import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, resolve } from 'node:path'

import type { Linter } from 'eslint'
import { ESLint } from 'eslint'
import { afterEach, describe, expect, it } from 'vitest'

import plugin from '../../src/eslint'

function createProjectFixture(files: Record<string, string>) {
  const rootDir = mkdtempSync(resolve(tmpdir(), 'bcn-eslint-'))
  for (const [relativePath, contents] of Object.entries(files)) {
    const absolutePath = resolve(rootDir, relativePath)
    mkdirSync(dirname(absolutePath), { recursive: true })
    writeFileSync(absolutePath, contents, 'utf8')
  }
  return rootDir
}

async function createEslint(
  rootDir: string,
  options?: { fix?: boolean; preset?: 'recommended' | 'strict' },
) {
  const tsParser = await import('@typescript-eslint/parser')
  const vueParser = await import('vue-eslint-parser')
  const preset = options?.preset ?? 'recommended'

  return new ESLint({
    cwd: rootDir,
    fix: options?.fix ?? false,
    ignore: false,
    overrideConfigFile: true,
    overrideConfig: [
      {
        files: ['**/*.ts'],
        languageOptions: {
          parser: tsParser.default,
          ecmaVersion: 'latest',
          sourceType: 'module',
        },
      },
      {
        files: ['**/*.vue'],
        languageOptions: {
          parser: vueParser.default,
          parserOptions: {
            parser: tsParser.default,
            ecmaVersion: 'latest',
            sourceType: 'module',
            extraFileExtensions: ['.vue'],
          },
        },
      },
      plugin.configs[preset] as Linter.Config,
    ],
  })
}

afterEach(() => {
  delete process.env.NODE_ENV
})

describe('@lupinum/trellis ESLint plugin', () => {
  it('autofixes scoped tools to require auth', async () => {
    const rootDir = createProjectFixture({})
    const eslint = await createEslint(rootDir, { fix: true, preset: 'strict' })

    const [result] = await eslint.lintText(
      `
      import { defineTool } from '#trellis/mcp/advanced'
      export default defineTool({
        schema: schema,
        effect: 'read',
        scoped: true,
        handler: async () => ({ ok: true }),
      })
      `,
      { filePath: resolve(rootDir, 'server/mcp/tools/create-note.ts') },
    )

    expect(result).toBeDefined()
    expect(result!.output).toContain("auth: 'required'")
  })

  it('reports direct destructuring of non-awaited query composables but allows explicit query state objects', async () => {
    const rootDir = createProjectFixture({})
    const eslint = await createEslint(rootDir)

    const [badResult] = await eslint.lintText(
      `
      const { data, status } = useConvexQuery(api.tasks.list, {})
      `,
      { filePath: resolve(rootDir, 'pages/index.ts') },
    )

    const [goodResult] = await eslint.lintText(
      `
      const tasksQuery = useConvexQuery(api.tasks.list, {})
      const message = tasksQuery.status.value
      `,
      { filePath: resolve(rootDir, 'pages/detail.ts') },
    )

    expect(badResult).toBeDefined()
    expect(goodResult).toBeDefined()
    expect(badResult!.messages.map((message) => message.ruleId)).toContain(
      '@lupinum/trellis/await-convex-query',
    )
    expect(goodResult!.messages.map((message) => message.ruleId)).not.toContain(
      '@lupinum/trellis/await-convex-query',
    )
  })

  it('uses isolation metadata from convex/functions.ts and flags bare collection reads only', async () => {
    const rootDir = createProjectFixture({
      'convex/functions.ts': `
        export const { query, unsafe } = defineTrellis({ query, mutation }, {
          isolation: {
            tables: ['tasks'],
            field: 'workspaceId',
          },
        })
      `,
      'convex/schema.ts': `
        export default defineSchema({
          tasks: defineTable({
            workspaceId: v.id('workspaces'),
            projectId: v.id('projects'),
            title: v.string(),
          })
            .index('by_workspace', ['workspaceId'])
            .index('by_project', ['projectId']),
        })
      `,
    })
    const eslint = await createEslint(rootDir)

    const [badResult] = await eslint.lintText(
      `
      export const list = unsafe.query({
        permit: unsafe.permit({
          kind: 'fixtureUnsafeQuery',
          reason: 'Fixture-only unsafe query for lint coverage.',
          scope: ['tests'],
        }),
        args: {},
        handler: async (ctx) => {
          return await ctx.db.query('tasks').collect()
        },
      })
      `,
      { filePath: resolve(rootDir, 'convex/tasks.ts') },
    )

    const [goodResult] = await eslint.lintText(
      `
      export const listByProject = query.protected({
        guard: open,
        args: {},
        handler: async (ctx, args) => {
          return await ctx.db.query('tasks').withIndex('by_project', (q) => q.eq('projectId', args.projectId)).collect()
        },
      })
      `,
      { filePath: resolve(rootDir, 'convex/projects.ts') },
    )

    expect(badResult).toBeDefined()
    expect(goodResult).toBeDefined()
    expect(badResult!.messages.map((message) => message.ruleId)).toContain(
      '@lupinum/trellis/isolation-query-requires-index',
    )
    expect(goodResult!.messages.map((message) => message.ruleId)).not.toContain(
      '@lupinum/trellis/isolation-query-requires-index',
    )
  })

  it('does not flag intentional public app handlers for missing enforce()', async () => {
    const rootDir = createProjectFixture({})
    const eslint = await createEslint(rootDir)

    const [result] = await eslint.lintText(
      `
      export const listPublic = query.protected({
        guard: open,
        args: {},
        handler: async (ctx) => {
          return await ctx.db.query('runbooks').withIndex('by_visibility', (q) => q.eq('visibility', 'public')).collect()
        },
      })
      `,
      { filePath: resolve(rootDir, 'convex/runbooks.ts') },
    )

    expect(result).toBeDefined()
    expect(result!.messages.map((message) => message.ruleId)).not.toContain(
      '@lupinum/trellis/enforce-required-in-handler',
    )
  })

  it('does not flag guarded app handlers for missing enforce() or appIdentity narrowing', async () => {
    const rootDir = createProjectFixture({})
    const eslint = await createEslint(rootDir)

    const [result] = await eslint.lintText(
      `
      export const listWorkspace = query.protected({
        guard: canReadWorkspaceRunbook,
        args: {},
        handler: async (ctx) => {
          const appIdentity = await ctx.appIdentity()
          return await ctx.db.query('runbooks').withIndex('by_workspace', (q) => q.eq('workspaceId', appIdentity.workspaceId)).collect()
        },
      })
      `,
      { filePath: resolve(rootDir, 'convex/runbooks.ts') },
    )

    expect(result).toBeDefined()
    expect(result!.messages.map((message) => message.ruleId)).not.toContain(
      '@lupinum/trellis/enforce-required-in-handler',
    )
    expect(result!.messages.map((message) => message.ruleId)).not.toContain(
      '@lupinum/trellis/appIdentity-access-after-enforce',
    )
  })

  it('does not flag db access in public branches that happen before ctx.appIdentity() is resolved', async () => {
    const rootDir = createProjectFixture({})
    const eslint = await createEslint(rootDir)

    const [result] = await eslint.lintText(
      `
      export const getArticle = unsafe.query({
        permit: unsafe.permit({
          kind: 'fixturePublicArticleAccess',
          reason: 'Fixture-only public article access for lint coverage.',
          scope: ['tests'],
        }),
        args: { shareToken: v.optional(v.string()), id: v.id('articles') },
        handler: async (ctx, args) => {
          if (args.shareToken) {
            const article = await ctx.db.get(args.id)
            return article
          }

          const appIdentity = await ctx.appIdentity()
          enforce(appIdentity, 'Read article', canReadArticle)
          return await ctx.db.get(args.id)
        },
      })
      `,
      { filePath: resolve(rootDir, 'convex/articles.ts') },
    )

    expect(result).toBeDefined()
    expect(result!.messages.map((message) => message.ruleId)).not.toContain(
      '@lupinum/trellis/enforce-required-in-handler',
    )
  })

  it('does not flag handlers that validate isolation resources after ctx.db.get()', async () => {
    const rootDir = createProjectFixture({})
    const eslint = await createEslint(rootDir)

    const [result] = await eslint.lintText(
      `
      export const updateTodo = unsafe.mutation({
        permit: unsafe.permit({
          kind: 'fixtureUnsafeMutation',
          reason: 'Fixture-only mutation for lint coverage.',
          scope: ['tests'],
        }),
        args: { id: v.id('todos') },
        handler: async (ctx, args) => {
          const appIdentity = await ctx.appIdentity()
          const todo = await ctx.db.get(args.id)
          requireRecord(todo, 'Todo')
          ensureTenant(appIdentity, todo)
          enforce(appIdentity, 'Update todo', canUpdateTodo(todo))
          await ctx.db.patch(args.id, { completed: true })
        },
      })
      `,
      { filePath: resolve(rootDir, 'convex/todos.ts') },
    )

    expect(result).toBeDefined()
    expect(result!.messages.map((message) => message.ruleId)).not.toContain(
      '@lupinum/trellis/enforce-required-in-handler',
    )
  })

  it('requires typed permits on unsafe builders and reasons on isolation escapes', async () => {
    const rootDir = createProjectFixture({})
    const eslint = await createEslint(rootDir)

    const [missingUnsafeBypass] = await eslint.lintText(
      `
      export const listPublic = unsafe.query({
        args: {},
        handler: async (ctx) => {
          return await ctx.db.query('runbooks').collect()
        },
      })
      `,
      { filePath: resolve(rootDir, 'convex/runbooks.ts') },
    )

    const [missingEscapeReason] = await eslint.lintText(
      `
      export const listPublic = unsafe.query({
        permit: unsafe.permit({
          kind: 'fixtureUnsafeQuery',
          reason: 'Fixture-only unsafe query for lint coverage.',
          scope: ['tests'],
        }),
        args: {},
        handler: async (ctx) => {
          return await ctx.db.escapeIsolation({}).query('runbooks').collect()
        },
      })
      `,
      { filePath: resolve(rootDir, 'convex/public.ts') },
    )

    expect(missingUnsafeBypass!.messages.map((message) => message.ruleId)).toContain(
      '@lupinum/trellis/unsafe-requires-permit',
    )
    expect(missingEscapeReason!.messages.map((message) => message.ruleId)).toContain(
      '@lupinum/trellis/escape-isolation-requires-reason',
    )
  })

  it('requires indexed collection reads inside unsafe query handlers', async () => {
    const rootDir = createProjectFixture({})
    const eslint = await createEslint(rootDir)

    const [badResult] = await eslint.lintText(
      `
      export const listPublic = unsafe.query({
        permit: unsafe.permit({
          kind: 'fixturePublicRead',
          reason: 'Fixture-only public read for lint coverage.',
          scope: ['tests'],
        }),
        args: {},
        handler: async (ctx) => {
          return await ctx.db.query('runbooks').collect()
        },
      })
      `,
      { filePath: resolve(rootDir, 'convex/runbooks.ts') },
    )

    const [goodResult] = await eslint.lintText(
      `
      export const listPublic = unsafe.query({
        permit: unsafe.permit({
          kind: 'fixturePublicRead',
          reason: 'Fixture-only public read for lint coverage.',
          scope: ['tests'],
        }),
        args: {},
        handler: async (ctx) => {
          return await ctx.db.query('runbooks').withIndex('by_visibility', (q) => q.eq('visibility', 'public')).collect()
        },
      })
      `,
      { filePath: resolve(rootDir, 'convex/runbooks.ts') },
    )

    expect(badResult!.messages.map((message) => message.ruleId)).toContain(
      '@lupinum/trellis/unsafe-query-collection-requires-index',
    )
    expect(goodResult!.messages.map((message) => message.ruleId)).not.toContain(
      '@lupinum/trellis/unsafe-query-collection-requires-index',
    )
  })

  it('keeps shared feature contracts runtime-neutral', async () => {
    const rootDir = createProjectFixture({})
    const eslint = await createEslint(rootDir)

    const [result] = await eslint.lintText(
      `
      import { computed } from 'vue'
      import { defineSchema } from 'convex/server'

      export const contract = { computed, defineSchema }
      `,
      { filePath: resolve(rootDir, 'shared/features/tasks/contract.ts') },
    )

    expect(result!.messages.map((message) => message.ruleId)).toContain(
      '@lupinum/trellis/shared-features-runtime-neutral',
    )
  })

  it('prevents shell code from importing feature internals but allows feature barrels', async () => {
    const rootDir = createProjectFixture({
      'convex/features/tasks/index.ts': 'export const tasks = true\n',
      'convex/features/tasks/permissions.ts': 'export const taskPermissions = true\n',
    })
    const eslint = await createEslint(rootDir)

    const [badResult] = await eslint.lintText(
      `
      import { taskPermissions } from './features/tasks/permissions'

      export const permissions = taskPermissions
      `,
      { filePath: resolve(rootDir, 'convex/functions.ts') },
    )

    const [goodResult] = await eslint.lintText(
      `
      import { tasks } from './features/tasks'

      export const manifest = tasks
      `,
      { filePath: resolve(rootDir, 'convex/schema.ts') },
    )

    expect(badResult!.messages.map((message) => message.ruleId)).toContain(
      '@lupinum/trellis/feature-boundaries',
    )
    expect(goodResult!.messages.map((message) => message.ruleId)).not.toContain(
      '@lupinum/trellis/feature-boundaries',
    )
  })

  it('prevents deep imports between features but allows barrel imports and same-feature tests', async () => {
    const rootDir = createProjectFixture({
      'convex/features/tasks/index.ts': 'export const tasks = true\n',
      'convex/features/tasks/tests.ts': 'export const tests = true\n',
      'convex/features/projects/index.ts': 'export const projects = true\n',
      'convex/features/projects/permissions.ts': 'export const projectPermissions = true\n',
    })
    const eslint = await createEslint(rootDir)

    const [badResult] = await eslint.lintText(
      `
      import { projectPermissions } from '../projects/permissions'

      export const x = projectPermissions
      `,
      { filePath: resolve(rootDir, 'convex/features/tasks/domain.ts') },
    )

    const [goodBarrelResult] = await eslint.lintText(
      `
      import { projects } from '../projects'

      export const x = projects
      `,
      { filePath: resolve(rootDir, 'convex/features/tasks/domain.ts') },
    )

    const [goodTestResult] = await eslint.lintText(
      `
      import { tasks } from './index'

      export const x = tasks
      `,
      { filePath: resolve(rootDir, 'convex/features/tasks/tests.ts') },
    )

    expect(badResult!.messages.map((message) => message.ruleId)).toContain(
      '@lupinum/trellis/feature-boundaries',
    )
    expect(goodBarrelResult!.messages.map((message) => message.ruleId)).not.toContain(
      '@lupinum/trellis/feature-boundaries',
    )
    expect(goodTestResult!.messages.map((message) => message.ruleId)).not.toContain(
      '@lupinum/trellis/feature-boundaries',
    )
  })

  it('applies the same feature boundary rules inside component roots', async () => {
    const rootDir = createProjectFixture({
      'convex/components/miniCms/features/pages/index.ts': 'export const pages = true\n',
      'convex/components/miniCms/features/pages/domain.ts': 'export const domain = true\n',
      'convex/components/miniCms/auth/guards.ts': 'export const open = true\n',
    })
    const eslint = await createEslint(rootDir)

    const [badShellResult] = await eslint.lintText(
      `
      import { domain } from './features/pages/domain'

      export const x = domain
      `,
      { filePath: resolve(rootDir, 'convex/components/miniCms/schema.ts') },
    )

    const [goodFeatureResult] = await eslint.lintText(
      `
      import { open } from '../../auth/guards'

      export const x = open
      `,
      { filePath: resolve(rootDir, 'convex/components/miniCms/features/pages/query.ts') },
    )

    expect(badShellResult!.messages.map((message) => message.ruleId)).toContain(
      '@lupinum/trellis/feature-boundaries',
    )
    expect(goodFeatureResult!.messages.map((message) => message.ruleId)).not.toContain(
      '@lupinum/trellis/feature-boundaries',
    )
  })

  it('rejects inline guards that do async or db work', async () => {
    const rootDir = createProjectFixture({})
    const eslint = await createEslint(rootDir)

    const [result] = await eslint.lintText(
      `
      export const updateTodo = mutation.protected({
        guard: async (ctx) => {
          const todo = await ctx.db.get('todo_123')
          return Boolean(todo)
        },
        args: {},
        handler: async () => true,
      })
      `,
      { filePath: resolve(rootDir, 'convex/todos.ts') },
    )

    expect(result!.messages.map((message) => message.ruleId)).toContain(
      '@lupinum/trellis/guard-no-db',
    )
  })

  it('autofixes dead v-if branches in Vue templates', async () => {
    const rootDir = createProjectFixture({})
    const eslint = await createEslint(rootDir, { fix: true, preset: 'strict' })

    const [result] = await eslint.lintText(
      `
      <template>
        <div>
          <section v-if="false">dead</section>
          <section>live</section>
        </div>
      </template>
      `,
      { filePath: resolve(rootDir, 'pages/index.vue') },
    )

    expect(result).toBeDefined()
    expect(result!.output).toBeTypeOf('string')
    expect(result!.output).not.toContain('v-if="false"')
    expect(result!.output).not.toContain('dead')
  })
})
