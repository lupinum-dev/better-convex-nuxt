import { existsSync, readFileSync } from 'node:fs'
import { join, relative, resolve, sep } from 'node:path'

import { describe, expect, it } from 'vitest'

type StarterManifest = {
  name: string
  include: string[]
  exclude: string[]
  generated?: { path: string }[]
  generatedPaths?: string[]
}

const fixtureRoot = resolve(process.cwd(), 'tests/fixtures/phase0-workspace-mcp')
const manifestPath = join(fixtureRoot, 'starter.manifest.json')
const cliStarterRoot = resolve(process.cwd(), 'src/cli/starter-fixtures')

function matchesPattern(path: string, pattern: string): boolean {
  const deepFileMatch = pattern.match(/^(.+)\/\*\*\/\*(\.[^/]+)$/)
  if (deepFileMatch) {
    const [, prefix, suffix] = deepFileMatch
    return path.startsWith(`${prefix}/`) && path.endsWith(suffix)
  }

  if (pattern.endsWith('/**')) {
    return path.startsWith(pattern.slice(0, -3))
  }

  return path === pattern
}

function matchesAny(path: string, patterns: readonly string[]): boolean {
  return patterns.some((pattern) => matchesPattern(path, pattern))
}

function toFixturePath(path: string): string {
  return relative(fixtureRoot, path).split(sep).join('/')
}

describe('phase0 workspace-mcp starter manifest', () => {
  it('keeps generated starter inputs explicit and excludes local runtime artifacts', () => {
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as StarterManifest

    const selected = [
      '.gitignore',
      'app.vue',
      'convex.json',
      'convex/_generated/api.d.ts',
      'convex/_generated/api.js',
      'convex/_generated/dataModel.d.ts',
      'convex/_generated/server.d.ts',
      'convex/_generated/server.js',
      'convex/features/projects/domain.ts',
      'convex/schema.ts',
      'generated/mcp-tool-refs.ts',
      'generated/operation-refs.ts',
      'nuxt.config.ts',
      'package.json',
      'server/mcp/tools/create-project.ts',
      'server/mcp/tools/delete-project.ts',
      'shared/app-inventory.ts',
      'shared/features/projects/tools.ts',
    ]

    for (const path of selected) {
      expect(existsSync(join(fixtureRoot, path)), path).toBe(true)
      expect(matchesAny(path, manifest.include), path).toBe(true)
      expect(matchesAny(path, manifest.exclude), path).toBe(false)
    }

    for (const localPath of ['.env.local', '.convex/local/default/config.json']) {
      expect(matchesAny(localPath, manifest.exclude), localPath).toBe(true)
    }

    expect(manifest.include).not.toContain('.env.local')
    expect(manifest.include).not.toContain('.nuxt/**')
    expect(manifest.include).not.toContain('.output/**')

    expect(manifest.generated?.map((file) => file.path)).toEqual([
      'generated/operation-refs.ts',
      'generated/mcp-tool-refs.ts',
    ])
    expect(toFixturePath(manifestPath)).toBe('starter.manifest.json')
  })
})

describe('fixture-backed beginner starter manifests', () => {
  it('keeps the public starter fixture scoped to public app concepts', () => {
    const root = join(cliStarterRoot, 'public')
    const manifest = JSON.parse(
      readFileSync(join(root, 'starter.manifest.json'), 'utf8'),
    ) as StarterManifest
    const selected = [
      '.env.example',
      '.gitignore',
      'README.md',
      'app/app.vue',
      'app/features/public/components/PublicStarterPage.vue',
      'app/pages/index.vue',
      'convex/features/todos/domain.ts',
      'convex/features/todos/index.ts',
      'convex/features/todos/schema.ts',
      'convex/functions.ts',
      'convex/schema.ts',
      'nuxt.config.ts',
      'package.json',
      'server/api/.gitkeep',
      'server/mcp/.gitkeep',
      'shared/features/todos/contract.ts',
    ]

    for (const path of selected) {
      expect(existsSync(join(root, path)), path).toBe(true)
      expect(matchesAny(path, manifest.include), path).toBe(true)
      expect(matchesAny(path, manifest.exclude), path).toBe(false)
    }

    const fixtureText = selected.map((path) => readFileSync(join(root, path), 'utf8')).join('\n')
    expect(fixtureText).not.toContain('@convex-dev/better-auth')
    expect(fixtureText).not.toContain('@nuxtjs/mcp-toolkit')
    expect(fixtureText).not.toContain('defineMcpApp')
    expect(fixtureText).not.toContain('workspaceId')
    expect(manifest.generatedPaths).toContain('package.json')
  })

  it('keeps the personal starter fixture scoped to auth without workspace or MCP concepts', () => {
    const root = join(cliStarterRoot, 'personal')
    const manifest = JSON.parse(
      readFileSync(join(root, 'starter.manifest.json'), 'utf8'),
    ) as StarterManifest
    const selected = [
      '.env.example',
      '.gitignore',
      'README.md',
      'app/app.vue',
      'app/features/personal/components/PersonalStarterPage.vue',
      'app/pages/index.vue',
      'convex/auth.config.ts',
      'convex/auth.ts',
      'convex/auth/appIdentity.ts',
      'convex/auth/guards.ts',
      'convex/convex.config.ts',
      'convex/features/todos/domain.ts',
      'convex/features/todos/index.ts',
      'convex/features/todos/schema.ts',
      'convex/features/users/index.ts',
      'convex/features/users/schema.ts',
      'convex/functions.ts',
      'convex/http.ts',
      'convex/schema.ts',
      'convex/test.setup.ts',
      'nuxt.config.ts',
      'package.json',
      'shared/features/todos/contract.ts',
    ]

    for (const path of selected) {
      expect(existsSync(join(root, path)), path).toBe(true)
      expect(matchesAny(path, manifest.include), path).toBe(true)
      expect(matchesAny(path, manifest.exclude), path).toBe(false)
    }

    const fixtureText = selected.map((path) => readFileSync(join(root, path), 'utf8')).join('\n')
    expect(fixtureText).toContain('@convex-dev/better-auth')
    expect(fixtureText).not.toContain('@nuxtjs/mcp-toolkit')
    expect(fixtureText).not.toContain('defineMcpApp')
    expect(fixtureText).not.toContain('workspaceId')
    expect(manifest.generatedPaths).toContain('convex/auth.config.ts')
  })

  it('keeps the workspace starter fixture scoped to workspace without MCP concepts', () => {
    const root = join(cliStarterRoot, 'workspace')
    const manifest = JSON.parse(
      readFileSync(join(root, 'starter.manifest.json'), 'utf8'),
    ) as StarterManifest
    const selected = [
      '.env.example',
      '.gitignore',
      'README.md',
      'app/app.vue',
      'app/features/workspace/components/WorkspaceStarterPage.vue',
      'app/pages/index.vue',
      'convex/auth.config.ts',
      'convex/auth.ts',
      'convex/auth/appIdentity.ts',
      'convex/auth/guards.ts',
      'convex/auth/caller.ts',
      'convex/convex.config.ts',
      'convex/features/index.ts',
      'convex/features/todos/domain.ts',
      'convex/features/todos/feature.ts',
      'convex/features/todos/index.ts',
      'convex/features/todos/permissions.ts',
      'convex/features/todos/schema.ts',
      'convex/features/users/feature.ts',
      'convex/features/users/index.ts',
      'convex/features/users/schema.ts',
      'convex/features/workspaces/domain.ts',
      'convex/features/workspaces/feature.ts',
      'convex/features/workspaces/index.ts',
      'convex/features/workspaces/schema.ts',
      'convex/functions.ts',
      'convex/http.ts',
      'convex/permissions/context.ts',
      'convex/schema.ts',
      'convex/test.setup.ts',
      'nuxt.config.ts',
      'package.json',
      'server/api/.gitkeep',
      'server/mcp/.gitkeep',
      'shared/features/todos/contract.ts',
      'shared/features/workspaces/contract.ts',
    ]

    for (const path of selected) {
      expect(existsSync(join(root, path)), path).toBe(true)
      expect(matchesAny(path, manifest.include), path).toBe(true)
      expect(matchesAny(path, manifest.exclude), path).toBe(false)
    }

    const fixtureText = selected.map((path) => readFileSync(join(root, path), 'utf8')).join('\n')
    expect(fixtureText).toContain('@convex-dev/better-auth')
    expect(fixtureText).toContain('workspaceId')
    expect(fixtureText).toContain('isolation')
    expect(fixtureText).not.toContain('@nuxtjs/mcp-toolkit')
    expect(fixtureText).not.toContain('defineMcpApp')
    expect(fixtureText).not.toContain('mcp.tool')
    expect(fixtureText).not.toContain('ginko')
    expect(fixtureText).not.toContain('cms')
    expect(manifest.generatedPaths).toContain('convex/auth.config.ts')
  })

  it('keeps the workspace MCP starter fixture scoped to workspace and MCP concepts', () => {
    const root = join(cliStarterRoot, 'workspace-mcp')
    const manifest = JSON.parse(
      readFileSync(join(root, 'starter.manifest.json'), 'utf8'),
    ) as StarterManifest
    const selected = [
      '.env.example',
      '.gitignore',
      'README.md',
      'app/app.vue',
      'app/features/workspace/components/WorkspaceStarterPage.vue',
      'app/pages/index.vue',
      'convex/auth.config.ts',
      'convex/auth.ts',
      'convex/auth/appIdentity.ts',
      'convex/auth/guards.ts',
      'convex/auth/caller.ts',
      'convex/convex.config.ts',
      'convex/features/index.ts',
      'convex/features/mcpKeys/domain.ts',
      'convex/features/todos/domain.ts',
      'convex/features/todos/feature.ts',
      'convex/features/todos/index.ts',
      'convex/features/todos/permissions.ts',
      'convex/features/todos/schema.ts',
      'convex/features/users/feature.ts',
      'convex/features/users/index.ts',
      'convex/features/users/schema.ts',
      'convex/features/workspaces/domain.ts',
      'convex/features/workspaces/feature.ts',
      'convex/features/workspaces/index.ts',
      'convex/features/workspaces/schema.ts',
      'convex/functions.ts',
      'convex/http.ts',
      'convex/permissions/context.ts',
      'convex/schema.ts',
      'convex/test.setup.ts',
      'nuxt.config.ts',
      'package.json',
      'server/api/.gitkeep',
      'server/mcp/index.ts',
      'server/mcp/runtime.ts',
      'server/mcp/tools/create-todo.ts',
      'server/mcp/tools/list-todos.ts',
      'server/middleware/mcp-auth.ts',
      'shared/features/todos/contract.ts',
      'shared/features/workspaces/contract.ts',
    ]

    for (const path of selected) {
      expect(existsSync(join(root, path)), path).toBe(true)
      expect(matchesAny(path, manifest.include), path).toBe(true)
      expect(matchesAny(path, manifest.exclude), path).toBe(false)
    }

    const fixtureText = selected.map((path) => readFileSync(join(root, path), 'utf8')).join('\n')
    expect(fixtureText).toContain('@convex-dev/better-auth')
    expect(fixtureText).toContain('@nuxtjs/mcp-toolkit')
    expect(fixtureText).toContain('defineMcpApp')
    expect(fixtureText).toContain('CONVEX_IDENTITY_FORWARDING_KEY')
    expect(fixtureText).toContain('workspaceId')
    expect(fixtureText).toContain('isolation')
    expect(fixtureText).not.toContain('ginko')
    expect(fixtureText).not.toContain('cms')
    expect(fixtureText).not.toContain('bridge-author')
    expect(fixtureText).not.toContain('deleteProjectDescriptor')
    expect(fixtureText).not.toContain('createProjectToolDescriptor')
    expect(manifest.generatedPaths).toContain('convex/auth.config.ts')
  })
})
