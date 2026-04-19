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
      import { defineTool } from '#trellis/mcp'

      export default defineTool({
        schema: schema,
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

  it('uses tenant metadata from convex/functions.ts and flags bare collection reads only', async () => {
    const rootDir = createProjectFixture({
      'convex/functions.ts': `
        export const { query, raw } = defineTrellis({ query, mutation }, {
          tenantIsolation: {
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
      export const list = raw.query({
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
      export const listByProject = query({
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
      '@lupinum/trellis/tenant-scoped-query-requires-index',
    )
    expect(goodResult!.messages.map((message) => message.ruleId)).not.toContain(
      '@lupinum/trellis/tenant-scoped-query-requires-index',
    )
  })

  it('does not flag intentional public app handlers for missing enforce()', async () => {
    const rootDir = createProjectFixture({})
    const eslint = await createEslint(rootDir)

    const [result] = await eslint.lintText(
      `
      export const listPublic = query({
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

  it('does not flag guarded app handlers for missing enforce() or actor narrowing', async () => {
    const rootDir = createProjectFixture({})
    const eslint = await createEslint(rootDir)

    const [result] = await eslint.lintText(
      `
      export const listWorkspace = query({
        guard: canReadWorkspaceRunbook,
        args: {},
        handler: async (ctx) => {
          const actor = await ctx.actor()
          return await ctx.db.query('runbooks').withIndex('by_workspace', (q) => q.eq('workspaceId', actor.tenantId)).collect()
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
      '@lupinum/trellis/actor-access-after-enforce',
    )
  })

  it('does not flag db access in public branches that happen before ctx.actor() is resolved', async () => {
    const rootDir = createProjectFixture({})
    const eslint = await createEslint(rootDir)

    const [result] = await eslint.lintText(
      `
      export const getArticle = raw.query({
        args: { shareToken: v.optional(v.string()), id: v.id('articles') },
        handler: async (ctx, args) => {
          if (args.shareToken) {
            const article = await ctx.db.get(args.id)
            return article
          }

          const actor = await ctx.actor()
          enforce(actor, 'Read article', canReadArticle)
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

  it('does not flag handlers that validate tenant resources after ctx.db.get()', async () => {
    const rootDir = createProjectFixture({})
    const eslint = await createEslint(rootDir)

    const [result] = await eslint.lintText(
      `
      export const updateTodo = raw.mutation({
        args: { id: v.id('todos') },
        handler: async (ctx, args) => {
          const actor = await ctx.actor()
          const todo = await ctx.db.get(args.id)
          requireRecord(todo, 'Todo')
          ensureTenant(actor, todo)
          enforce(actor, 'Update todo', canUpdateTodo(todo))
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
