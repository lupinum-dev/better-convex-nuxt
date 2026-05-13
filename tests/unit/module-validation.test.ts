import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, resolve } from 'node:path'

import { beforeEach, describe, expect, it, vi } from 'vitest'

import { collectConvexFunctionPaths } from '../../src/analysis/project'

const { loggerWarnMock, loggerInfoMock } = vi.hoisted(() => ({
  loggerWarnMock: vi.fn(),
  loggerInfoMock: vi.fn(),
}))

vi.mock('@nuxt/kit', () => ({
  defineNuxtModule: (definition: unknown) => definition,
  addPlugin: vi.fn(),
  createResolver: () => ({
    resolve: (...segments: string[]) => segments.join('/'),
  }),
  addTemplate: vi.fn(({ filename }: { filename: string }) => ({ dst: filename })),
  addImports: vi.fn(),
  addServerHandler: vi.fn(),
  addServerImports: vi.fn(),
  addComponentsDir: vi.fn(),
  addRouteMiddleware: vi.fn(),
  useLogger: () => ({
    warn: loggerWarnMock,
    info: loggerInfoMock,
  }),
}))

function createFixture(files: Record<string, string>) {
  const rootDir = mkdtempSync(resolve(tmpdir(), 'bcn-module-validation-'))
  for (const [relativePath, contents] of Object.entries(files)) {
    const absolutePath = resolve(rootDir, relativePath)
    mkdirSync(dirname(absolutePath), { recursive: true })
    writeFileSync(absolutePath, contents, 'utf8')
  }
  return rootDir
}

function createNuxt(rootDir: string) {
  return {
    options: {
      rootDir,
      buildDir: resolve(rootDir, '.nuxt'),
      dev: false,
      alias: {} as Record<string, string>,
      runtimeConfig: {
        public: {},
      },
    },
    hook: vi.fn(),
  }
}

describe('module validation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('warns by default when auth-only APIs are used while auth is disabled', async () => {
    const rootDir = createFixture({
      'pages/index.vue': `
        <script setup lang="ts">
        const auth = useConvexAuth()
        </script>
      `,
    })
    const moduleDefinition = (await import('../../src/module')).default as unknown as {
      setup: (options: Record<string, unknown>, nuxt: ReturnType<typeof createNuxt>) => void
    }

    expect(() =>
      moduleDefinition.setup(
        {
          auth: false,
          validation: { strict: false },
        },
        createNuxt(rootDir),
      ),
    ).not.toThrow()
    expect(loggerWarnMock).toHaveBeenCalled()
    expect(String(loggerWarnMock.mock.calls[0]?.[0] ?? '')).toContain('auth.enabled')
  }, 15_000)

  it('throws in strict mode for isolation schema mismatches', async () => {
    const rootDir = createFixture({
      'convex/functions.ts': `
        export const { query } = defineTrellis({ query, mutation }, {
          isolation: {
            tables: ['tasks'],
          },
        })
      `,
      'convex/schema.ts': `
        export default defineSchema({
          tasks: defineTable({
            workspaceId: v.id('workspaces'),
            title: v.string(),
          }),
        })
      `,
    })
    const moduleDefinition = (await import('../../src/module')).default as unknown as {
      setup: (options: Record<string, unknown>, nuxt: ReturnType<typeof createNuxt>) => void
    }

    expect(() =>
      moduleDefinition.setup(
        {
          validation: { strict: true },
        },
        createNuxt(rootDir),
      ),
    ).toThrow(/missing the "by_workspace" index/i)
  })

  it('collects Convex exports declared through custom and structured builders', () => {
    const rootDir = createFixture({
      'convex/functions.ts': `
        export const { query, unsafe } = defineTrellis({ query, mutation })
      `,
      'convex/todos.ts': `
        export const list = query.public({
          args: {},
          handler: async () => []
        })

        export const getAccessContext = query.unsafe({
          permit: unsafe.permit({
            kind: 'fixtureAccessContext',
            reason: 'Expose access context through the low-level builder in this fixture.',
            scope: ['tests'],
          }),
          args: {},
          handler: async () => null
        })
      `,
    })

    expect(collectConvexFunctionPaths(rootDir)).toEqual(['todos.getAccessContext', 'todos.list'])
  })
})
