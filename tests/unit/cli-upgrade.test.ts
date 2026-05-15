import { spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { stripVTControlCharacters } from 'node:util'

import { beforeAll, describe, expect, it, vi } from 'vitest'

const repoRoot = process.cwd()
const cliEntry = resolve(repoRoot, 'dist/cli.mjs')

vi.setConfig({ testTimeout: 30_000 })

type UpgradeCheckReport = {
  schemaVersion: 1
  inventory: {
    schemaVersion: 1
    cwd: string
  }
  findings: Array<{
    id: string
    status: 'pass' | 'warn' | 'fail'
    message: string
    sources?: Array<{
      kind: 'inventory' | 'project-scan'
      inventoryPath?: string
      label?: string
      locations?: Array<{ path: string; line: number }>
    }>
  }>
  summary: {
    pass: number
    warn: number
    fail: number
  }
}

function runCli(args: string[], cwd: string) {
  return spawnSync(process.execPath, [cliEntry, ...args], {
    cwd,
    encoding: 'utf8',
    env: {
      ...process.env,
      NO_COLOR: '1',
    },
  })
}

function createTempDir(prefix: string): string {
  return mkdtempSync(resolve(tmpdir(), prefix))
}

function parseJsonOutput<T>(output: string): T {
  return JSON.parse(stripVTControlCharacters(output)) as T
}

function createPublicApp(): string {
  const cwd = createTempDir('trellis-upgrade-')
  const result = runCli(['init', 'demo', '--template', 'public', '--cwd', cwd], repoRoot)
  const output = `${result.stdout ?? ''}\n${result.stderr ?? ''}`
  expect(result.status, output).toBe(0)
  return resolve(cwd, 'demo')
}

function writeAppFile(appRoot: string, relativePath: string, source: string): void {
  const fullPath = resolve(appRoot, relativePath)
  mkdirSync(resolve(fullPath, '..'), { recursive: true })
  writeFileSync(fullPath, source)
}

function readAppFile(appRoot: string, relativePath: string): string {
  return readFileSync(resolve(appRoot, relativePath), 'utf8')
}

function findFinding(report: UpgradeCheckReport, id: string) {
  const finding = report.findings.find((candidate) => candidate.id === id)
  expect(finding, id).toBeDefined()
  return finding!
}

describe('CLI upgrade', () => {
  beforeAll(() => {
    const buildResult = spawnSync('pnpm', ['run', 'build:cli'], {
      cwd: repoRoot,
      encoding: 'utf8',
      env: {
        ...process.env,
        NUXT_TELEMETRY_DISABLED: '1',
      },
    })

    const output = `${buildResult.stdout ?? ''}\n${buildResult.stderr ?? ''}`
    expect(buildResult.status, output).toBe(0)
  }, 30_000)

  it('renders the upgrade help surface', () => {
    const result = runCli(['--help'], repoRoot)
    const output = `${result.stdout ?? ''}\n${result.stderr ?? ''}`

    expect(result.status, output).toBe(0)
    expect(output).toContain('upgrade')
  })

  it('refuses non-check mode without mutating files', () => {
    const appRoot = createPublicApp()
    const before = readAppFile(appRoot, 'convex/features/todos/domain.ts')
    const result = runCli(['upgrade', '--cwd', appRoot], repoRoot)
    const output = `${result.stdout ?? ''}\n${result.stderr ?? ''}`

    expect(result.status, output).toBe(1)
    expect(output).toContain('trellis upgrade --check')
    expect(output).toContain('trellis upgrade --write')
    expect(readAppFile(appRoot, 'convex/features/todos/domain.ts')).toBe(before)
  })

  it('rejects write mode with json output until write JSON has a stable contract', () => {
    const appRoot = createPublicApp()
    const result = runCli(['upgrade', '--write', '--json', '--cwd', appRoot], repoRoot)
    const output = `${result.stdout ?? ''}\n${result.stderr ?? ''}`

    expect(result.status, output).toBe(1)
    expect(output).toContain('trellis upgrade --write --json')
  })

  it('passes a clean generated starter in check mode', () => {
    const appRoot = createPublicApp()
    const result = runCli(['upgrade', '--check', '--json', '--cwd', appRoot], repoRoot)
    const output = `${result.stdout ?? ''}\n${result.stderr ?? ''}`
    const report = parseJsonOutput<UpgradeCheckReport>(result.stdout)

    expect(result.status, output).toBe(0)
    expect(report.schemaVersion).toBe(1)
    expect(report.inventory.schemaVersion).toBe(1)
    expect(report.inventory.cwd).toBe(appRoot)
    expect(report.summary.fail).toBe(0)
    expect(report.summary.warn).toBe(0)
    expect(findFinding(report, 'upgrade-tool-from-operation').status).toBe('pass')
    expect(findFinding(report, 'upgrade-functions-import').status).toBe('pass')
    expect(findFinding(report, 'upgrade-backend-root-builder').status).toBe('pass')
  })

  it('emits human-readable upgrade check output', () => {
    const appRoot = createPublicApp()
    const result = runCli(['upgrade', '--check', '--cwd', appRoot], repoRoot)
    const output = `${result.stdout ?? ''}\n${result.stderr ?? ''}`

    expect(result.status, output).toBe(0)
    expect(output).toContain('Trellis 1.0 upgrade check')
    expect(output).toContain('Summary:')
  })

  it('fails raw identity-forwarding migration findings with file locations', () => {
    const appRoot = createPublicApp()
    writeAppFile(
      appRoot,
      'server/api/legacy.post.ts',
      [
        'export default defineEventHandler(async () => {',
        '  return { _identityForwardingKey: "legacy", caller: { subject: "user:1" } }',
        '})',
      ].join('\n'),
    )

    const result = runCli(['upgrade', '--check', '--json', '--cwd', appRoot], repoRoot)
    const output = `${result.stdout ?? ''}\n${result.stderr ?? ''}`
    const report = parseJsonOutput<UpgradeCheckReport>(result.stdout)
    const finding = findFinding(report, 'upgrade-raw-forwarding')

    expect(result.status, output).toBe(1)
    expect(finding.status).toBe('fail')
    expect(finding.message).toContain('server/api/legacy.post.ts:2')
    expect(finding.sources).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'project-scan',
          label: 'legacy raw forwarding tokens',
          locations: [
            expect.objectContaining({
              path: 'server/api/legacy.post.ts',
              line: 2,
            }),
          ],
        }),
        expect.objectContaining({
          kind: 'inventory',
          inventoryPath: 'forwarding.publicExposures',
        }),
        expect.objectContaining({
          kind: 'inventory',
          inventoryPath: 'forwarding.forwardedCallerMisuses',
        }),
      ]),
    )
    expect(JSON.stringify(finding.sources)).not.toContain('user:1')
    expect(JSON.stringify(finding.sources)).not.toContain('_identityForwardingKey')
    expect(JSON.stringify(finding.sources)).not.toContain('subject')
  })

  it('reports multiple token findings in one file with exact line evidence', () => {
    const appRoot = createPublicApp()
    writeAppFile(
      appRoot,
      'server/api/legacy.post.ts',
      [
        'export default defineEventHandler(async () => {',
        '  const readArgs = { _identityForwardingKey: "legacy-read" }',
        '  const writeArgs = { identityForwardingKey: "legacy-write" }',
        '  return { readArgs, writeArgs }',
        '})',
      ].join('\n'),
    )

    const result = runCli(['upgrade', '--check', '--json', '--cwd', appRoot], repoRoot)
    const output = `${result.stdout ?? ''}\n${result.stderr ?? ''}`
    const report = parseJsonOutput<UpgradeCheckReport>(result.stdout)
    const finding = findFinding(report, 'upgrade-raw-forwarding')

    expect(result.status, output).toBe(1)
    expect(finding.status).toBe('fail')
    expect(finding.message).toContain('server/api/legacy.post.ts:2')
    expect(finding.message).toContain('server/api/legacy.post.ts:3')
    expect(finding.sources).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'project-scan',
          label: 'legacy raw forwarding tokens',
          locations: expect.arrayContaining([
            expect.objectContaining({
              path: 'server/api/legacy.post.ts',
              line: 2,
            }),
            expect.objectContaining({
              path: 'server/api/legacy.post.ts',
              line: 3,
            }),
          ]),
        }),
      ]),
    )
    expect(JSON.stringify(finding.sources)).not.toContain('legacy-read')
    expect(JSON.stringify(finding.sources)).not.toContain('legacy-write')
  })

  it('warns for tool.fromOperation with file locations', () => {
    const appRoot = createPublicApp()
    writeAppFile(
      appRoot,
      'server/mcp/tools/delete-todo.ts',
      [
        "import { tool } from '../runtime'",
        '',
        'export default tool.fromOperation(deleteTodoOperation)',
      ].join('\n'),
    )

    const result = runCli(['upgrade', '--check', '--json', '--cwd', appRoot], repoRoot)
    const output = `${result.stdout ?? ''}\n${result.stderr ?? ''}`
    const report = parseJsonOutput<UpgradeCheckReport>(result.stdout)
    const finding = findFinding(report, 'upgrade-tool-from-operation')

    expect(result.status, output).toBe(0)
    expect(finding.status).toBe('warn')
    expect(finding.message).toContain('server/mcp/tools/delete-todo.ts:3')
    expect(finding.sources).toEqual([
      expect.objectContaining({
        kind: 'project-scan',
        label: 'tool.fromOperation tokens',
        locations: [
          expect.objectContaining({
            path: 'server/mcp/tools/delete-todo.ts',
            line: 3,
          }),
        ],
      }),
    ])
  })

  it('warns for old functions imports with file locations', () => {
    const appRoot = createPublicApp()
    writeAppFile(
      appRoot,
      'convex/features/legacy/domain.ts',
      [
        "import { query } from '@lupinum/trellis/functions'",
        '',
        'export const list = query.public({',
        '  args: {},',
        '  handler: async () => [],',
        '})',
      ].join('\n'),
    )

    const result = runCli(['upgrade', '--check', '--json', '--cwd', appRoot], repoRoot)
    const output = `${result.stdout ?? ''}\n${result.stderr ?? ''}`
    const report = parseJsonOutput<UpgradeCheckReport>(result.stdout)
    const finding = findFinding(report, 'upgrade-functions-import')

    expect(result.status, output).toBe(0)
    expect(finding.status).toBe('warn')
    expect(finding.message).toContain('convex/features/legacy/domain.ts:1')
  })

  it('warns for old Trellis backend root builder calls with file locations', () => {
    const appRoot = createPublicApp()
    writeAppFile(
      appRoot,
      'convex/features/legacy/domain.ts',
      [
        "import { mutation, query as backendQuery } from '@lupinum/trellis/backend'",
        "import { action as backendAction } from '../../functions'",
        '',
        'export const list = backendQuery({',
        '  args: {},',
        '  handler: async () => [],',
        '})',
        '',
        'export const remove = mutation(removeTodoOperation)',
        '',
        'export const sync = backendAction({',
        '  args: {},',
        '  handler: async () => null,',
        '})',
      ].join('\n'),
    )

    const result = runCli(['upgrade', '--check', '--json', '--cwd', appRoot], repoRoot)
    const output = `${result.stdout ?? ''}\n${result.stderr ?? ''}`
    const report = parseJsonOutput<UpgradeCheckReport>(result.stdout)
    const finding = findFinding(report, 'upgrade-backend-root-builder')

    expect(result.status, output).toBe(0)
    expect(finding.status).toBe('warn')
    expect(finding.message).toContain('convex/features/legacy/domain.ts:4')
    expect(finding.message).toContain('convex/features/legacy/domain.ts:9')
    expect(finding.message).toContain('convex/features/legacy/domain.ts:11')
    expect(finding.sources).toEqual([
      expect.objectContaining({
        kind: 'project-scan',
        label: 'legacy Trellis backend root builder calls',
        locations: [
          expect.objectContaining({
            path: 'convex/features/legacy/domain.ts',
            line: 4,
          }),
          expect.objectContaining({
            path: 'convex/features/legacy/domain.ts',
            line: 9,
          }),
          expect.objectContaining({
            path: 'convex/features/legacy/domain.ts',
            line: 11,
          }),
        ],
      }),
    ])
  })

  it('does not flag raw Convex builder calls as Trellis backend root builder calls', () => {
    const appRoot = createPublicApp()
    writeAppFile(
      appRoot,
      'convex/features/raw/domain.ts',
      [
        "import { mutation, query } from './_generated/server'",
        '',
        'export const list = query({',
        '  args: {},',
        '  handler: async () => [],',
        '})',
        '',
        'export const remove = mutation({',
        '  args: {},',
        '  handler: async () => null,',
        '})',
      ].join('\n'),
    )

    const result = runCli(['upgrade', '--check', '--json', '--cwd', appRoot], repoRoot)
    const output = `${result.stdout ?? ''}\n${result.stderr ?? ''}`
    const report = parseJsonOutput<UpgradeCheckReport>(result.stdout)
    const finding = findFinding(report, 'upgrade-backend-root-builder')

    expect(result.status, output).toBe(0)
    expect(finding.status).toBe('pass')
  })

  it('warns for deleted starter spellings with file locations', () => {
    const appRoot = createPublicApp()
    writeAppFile(
      appRoot,
      'server/legacy-setup.ts',
      [
        'export const oldWorkspaceMcp = "trellis init demo --template workspace --mcp"',
        'export const oldCms = "trellis init cms-demo --template cms"',
      ].join('\n'),
    )
    writeAppFile(appRoot, 'server/create-app.ts', 'export const starter = { template: "cms" }\n')

    const result = runCli(['upgrade', '--check', '--json', '--cwd', appRoot], repoRoot)
    const output = `${result.stdout ?? ''}\n${result.stderr ?? ''}`
    const report = parseJsonOutput<UpgradeCheckReport>(result.stdout)
    const finding = findFinding(report, 'upgrade-starter-surface')

    expect(result.status, output).toBe(0)
    expect(finding.status).toBe('warn')
    expect(finding.message).toContain('server/legacy-setup.ts:1')
    expect(finding.message).toContain('server/create-app.ts:1')
  })

  it('warns for one-argument authorize callbacks without rewriting files', () => {
    const appRoot = createPublicApp()
    writeAppFile(
      appRoot,
      'convex/features/todos/domain.ts',
      [
        "import { mutation } from '@lupinum/trellis/backend'",
        '',
        'export const update = mutation.protected({',
        '  args: {},',
        '  guard: todoRead,',
        '  load: async () => ({ todo: { ownerId: "user-1" } }),',
        `  ${'author'}ize: ({ todo }) => todo.ownerId === "user-1",`,
        '  handler: async () => null,',
        '})',
      ].join('\n'),
    )
    const before = readAppFile(appRoot, 'convex/features/todos/domain.ts')

    const result = runCli(['upgrade', '--check', '--json', '--cwd', appRoot], repoRoot)
    const output = `${result.stdout ?? ''}\n${result.stderr ?? ''}`
    const report = parseJsonOutput<UpgradeCheckReport>(result.stdout)
    const finding = findFinding(report, 'upgrade-authorize-arity')

    expect(result.status, output).toBe(0)
    expect(finding.status).toBe('warn')
    expect(finding.message).toContain('convex/features/todos/domain.ts:7')
    expect(finding.sources).toEqual([
      expect.objectContaining({
        kind: 'project-scan',
        label: 'one-argument authorize callbacks',
        locations: [
          expect.objectContaining({
            path: 'convex/features/todos/domain.ts',
            line: 7,
          }),
        ],
      }),
    ])
    expect(readAppFile(appRoot, 'convex/features/todos/domain.ts')).toBe(before)
  })

  it('warns for one-argument authorize function expressions', () => {
    const appRoot = createPublicApp()
    writeAppFile(
      appRoot,
      'convex/features/todos/domain.ts',
      [
        "import { mutation } from '@lupinum/trellis/backend'",
        '',
        'export const update = mutation.protected({',
        '  args: {},',
        '  guard: todoRead,',
        '  load: async () => ({ todo: { ownerId: "user-1" } }),',
        '  authorize: function (loaded: { todo: { ownerId: string } }) {',
        '    return loaded.todo.ownerId === "user-1"',
        '  },',
        '  handler: async () => null,',
        '})',
      ].join('\n'),
    )

    const result = runCli(['upgrade', '--check', '--json', '--cwd', appRoot], repoRoot)
    const output = `${result.stdout ?? ''}\n${result.stderr ?? ''}`
    const report = parseJsonOutput<UpgradeCheckReport>(result.stdout)
    const finding = findFinding(report, 'upgrade-authorize-arity')

    expect(result.status, output).toBe(0)
    expect(finding.status).toBe('warn')
    expect(finding.message).toContain('convex/features/todos/domain.ts:7')
  })

  it('does not warn for explicit authorize objects or unrelated authorize symbols', () => {
    const appRoot = createPublicApp()
    writeAppFile(
      appRoot,
      'convex/features/todos/domain.ts',
      [
        "import { mutation } from '@lupinum/trellis/backend'",
        '',
        'const authorize = ({ todo }: { todo: { ownerId: string } }) => todo.ownerId === "user-1"',
        '',
        'export const update = mutation.protected({',
        '  args: {},',
        '  guard: todoRead,',
        '  load: async () => ({ todo: { ownerId: "user-1" } }),',
        '  authorize: {',
        "    label: 'todos.update',",
        '    check: ({ loaded }) => loaded.todo.ownerId === "user-1",',
        '  },',
        '  handler: async () => null,',
        '})',
      ].join('\n'),
    )

    const result = runCli(['upgrade', '--check', '--json', '--cwd', appRoot], repoRoot)
    const output = `${result.stdout ?? ''}\n${result.stderr ?? ''}`
    const report = parseJsonOutput<UpgradeCheckReport>(result.stdout)
    const finding = findFinding(report, 'upgrade-authorize-arity')

    expect(result.status, output).toBe(0)
    expect(finding.status).toBe('pass')
  })

  it('warns for string-only unsafe backend entrypoints without rewriting files', () => {
    const appRoot = createPublicApp()
    writeAppFile(
      appRoot,
      'convex/features/legacy/domain.ts',
      [
        "import { query } from '@lupinum/trellis/backend'",
        '',
        'export const listPublic = query.unsafe({',
        `  ${'bypass'}: 'Legacy unsafe reason that must become a typed permit.',`,
        '  args: {},',
        '  handler: async () => [],',
        '})',
      ].join('\n'),
    )
    const before = readAppFile(appRoot, 'convex/features/legacy/domain.ts')

    const result = runCli(['upgrade', '--check', '--json', '--cwd', appRoot], repoRoot)
    const output = `${result.stdout ?? ''}\n${result.stderr ?? ''}`
    const report = parseJsonOutput<UpgradeCheckReport>(result.stdout)
    const finding = findFinding(report, 'upgrade-unsafe-permits')

    expect(result.status, output).toBe(0)
    expect(finding.status).toBe('warn')
    expect(finding.message).toContain('convex/features/legacy/domain.ts:3')
    expect(finding.sources).toEqual([
      expect.objectContaining({
        kind: 'inventory',
        inventoryPath: 'backend.unsafeEntrypoints',
        locations: [
          expect.objectContaining({
            path: 'convex/features/legacy/domain.ts',
            line: 3,
          }),
        ],
      }),
    ])
    expect(JSON.stringify(finding.sources)).not.toContain('Legacy unsafe reason')
    expect(readAppFile(appRoot, 'convex/features/legacy/domain.ts')).toBe(before)
  })

  it('reports JSON with inventory, findings, and summary', () => {
    const appRoot = createPublicApp()
    const result = runCli(['upgrade', '--check', '--json', '--cwd', appRoot], repoRoot)
    const report = parseJsonOutput<UpgradeCheckReport>(result.stdout)

    expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0)
    expect(report).toMatchObject({
      schemaVersion: 1,
      inventory: {
        schemaVersion: 1,
        cwd: appRoot,
      },
      summary: {
        fail: 0,
      },
    })
    expect(report.findings.map((finding) => finding.id)).toContain('upgrade-starter-surface')
  })

  it('does not write files while checking migration issues', () => {
    const appRoot = createPublicApp()
    writeAppFile(
      appRoot,
      'convex/features/legacy/domain.ts',
      "import { query } from '@lupinum/trellis/functions'\n",
    )
    const before = readAppFile(appRoot, 'convex/features/legacy/domain.ts')

    const result = runCli(['upgrade', '--check', '--json', '--cwd', appRoot], repoRoot)

    expect(existsSync(resolve(appRoot, 'convex/features/legacy/domain.ts'))).toBe(true)
    expect(readAppFile(appRoot, 'convex/features/legacy/domain.ts')).toBe(before)
    expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0)
  })

  it('write mode applies mechanical import path codemods only', () => {
    const appRoot = createPublicApp()
    writeAppFile(
      appRoot,
      'convex/features/legacy/domain.ts',
      [
        "import { query } from '@lupinum/trellis/functions'",
        'import "@lupinum/trellis/bridge"',
        "export { checkBridgeDrift } from '@lupinum/trellis/bridge'",
        '',
        "const docsOnly = '@lupinum/trellis/functions'",
      ].join('\n'),
    )

    const result = runCli(['upgrade', '--write', '--cwd', appRoot], repoRoot)
    const output = `${result.stdout ?? ''}\n${result.stderr ?? ''}`
    const after = readAppFile(appRoot, 'convex/features/legacy/domain.ts')

    expect(result.status, output).toBe(0)
    expect(output).toContain('Changed files:')
    expect(output).toContain('convex/features/legacy/domain.ts')
    expect(after).toContain("import { query } from '@lupinum/trellis/backend'")
    expect(after).toContain('import "@lupinum/trellis-bridge"')
    expect(after).toContain("export { checkBridgeDrift } from '@lupinum/trellis-bridge'")
    expect(after).toContain("const docsOnly = '@lupinum/trellis/functions'")
  })

  it('write mode rewrites direct tool.fromOperation only when an mcp binding exists', () => {
    const appRoot = createPublicApp()
    writeAppFile(
      appRoot,
      'server/mcp/tools/archive.ts',
      [
        "import { mcp, tool } from '../runtime'",
        '',
        'export const archive = tool.fromOperation(archiveOperation)',
        'export const nested = runtime.tool.fromOperation(ignoredOperation)',
      ].join('\n'),
    )

    const result = runCli(['upgrade', '--write', '--cwd', appRoot], repoRoot)
    const output = `${result.stdout ?? ''}\n${result.stderr ?? ''}`
    const after = readAppFile(appRoot, 'server/mcp/tools/archive.ts')

    expect(result.status, output).toBe(0)
    expect(after).toContain('export const archive = mcp.tool.operation(archiveOperation)')
    expect(after).toContain('export const nested = runtime.tool.fromOperation(ignoredOperation)')
  })

  it('write mode leaves tool.fromOperation untouched when mcp binding is missing', () => {
    const appRoot = createPublicApp()
    writeAppFile(
      appRoot,
      'server/mcp/tools/archive.ts',
      [
        "import { tool } from '../runtime'",
        '',
        'export const archive = tool.fromOperation(archiveOperation)',
      ].join('\n'),
    )

    const result = runCli(['upgrade', '--write', '--cwd', appRoot], repoRoot)
    const output = `${result.stdout ?? ''}\n${result.stderr ?? ''}`
    const after = readAppFile(appRoot, 'server/mcp/tools/archive.ts')

    expect(result.status, output).toBe(0)
    expect(after).toContain('tool.fromOperation(archiveOperation)')
    expect(output).toContain('tool.fromOperation migration')
  })

  it('write mode is idempotent for mechanical codemods', () => {
    const appRoot = createPublicApp()
    writeAppFile(
      appRoot,
      'server/mcp/tools/archive.ts',
      [
        "import { mcp, tool } from '../runtime'",
        "import { query } from '@lupinum/trellis/functions'",
        '',
        'export const archive = tool.fromOperation(archiveOperation)',
      ].join('\n'),
    )

    const first = runCli(['upgrade', '--write', '--cwd', appRoot], repoRoot)
    const afterFirst = readAppFile(appRoot, 'server/mcp/tools/archive.ts')
    const second = runCli(['upgrade', '--write', '--cwd', appRoot], repoRoot)
    const secondOutput = `${second.stdout ?? ''}\n${second.stderr ?? ''}`

    expect(first.status, `${first.stdout}\n${first.stderr}`).toBe(0)
    expect(second.status, secondOutput).toBe(0)
    expect(readAppFile(appRoot, 'server/mcp/tools/archive.ts')).toBe(afterFirst)
    expect(secondOutput).toContain('Changed files: none')
  })

  it('write mode keeps security-sensitive migrations as manual findings', () => {
    const appRoot = createPublicApp()
    writeAppFile(
      appRoot,
      'server/api/legacy.post.ts',
      [
        "import { query } from '@lupinum/trellis/functions'",
        'export default defineEventHandler(async () => {',
        '  return { _identityForwardingKey: "legacy", caller: { subject: "user:1" } }',
        '})',
      ].join('\n'),
    )

    const result = runCli(['upgrade', '--write', '--cwd', appRoot], repoRoot)
    const output = `${result.stdout ?? ''}\n${result.stderr ?? ''}`
    const after = readAppFile(appRoot, 'server/api/legacy.post.ts')

    expect(result.status, output).toBe(1)
    expect(after).toContain("import { query } from '@lupinum/trellis/backend'")
    expect(after).toContain('_identityForwardingKey')
    expect(after).toContain('caller')
    expect(output).toContain('Raw identity-forwarding migration')
  })

  it('write mode does not rewrite authorize callbacks or backend lane decisions', () => {
    const appRoot = createPublicApp()
    writeAppFile(
      appRoot,
      'convex/features/legacy/domain.ts',
      [
        "import { mutation } from '@lupinum/trellis/backend'",
        '',
        'export const update = mutation({',
        '  args: {},',
        '  guard: todoRead,',
        '  load: async () => ({ todo: { ownerId: "user-1" } }),',
        '  authorize: ({ todo }) => todo.ownerId === "user-1",',
        '  handler: async () => null,',
        '})',
      ].join('\n'),
    )

    const result = runCli(['upgrade', '--write', '--cwd', appRoot], repoRoot)
    const output = `${result.stdout ?? ''}\n${result.stderr ?? ''}`
    const after = readAppFile(appRoot, 'convex/features/legacy/domain.ts')

    expect(result.status, output).toBe(0)
    expect(after).toContain('export const update = mutation({')
    expect(after).toContain('authorize: ({ todo }) => todo.ownerId === "user-1"')
    expect(output).toContain('Backend root builder migration')
    expect(output).toContain('Authorize arity migration')
  })
})
