import { spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { stripVTControlCharacters } from 'node:util'

import { beforeAll, describe, expect, it } from 'vitest'

const repoRoot = process.cwd()
const cliEntry = resolve(repoRoot, 'dist/cli.mjs')

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
    expect(readAppFile(appRoot, 'convex/features/todos/domain.ts')).toBe(before)
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
  })

  it('emits human-readable upgrade check output', () => {
    const appRoot = createPublicApp()
    const result = runCli(['upgrade', '--check', '--cwd', appRoot], repoRoot)
    const output = `${result.stdout ?? ''}\n${result.stderr ?? ''}`

    expect(result.status, output).toBe(0)
    expect(output).toContain('Trellis 1.0 upgrade check')
    expect(output).toContain('Summary:')
  })

  it('fails raw trusted-forwarding migration findings with file locations', () => {
    const appRoot = createPublicApp()
    writeAppFile(
      appRoot,
      'server/api/legacy.post.ts',
      [
        'export default defineEventHandler(async () => {',
        '  return { _trustedForwardingKey: "legacy", principal: { subject: "user:1" } }',
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
          inventoryPath: 'forwarding.forwardedPrincipalMisuses',
        }),
      ]),
    )
    expect(JSON.stringify(finding.sources)).not.toContain('user:1')
    expect(JSON.stringify(finding.sources)).not.toContain('_trustedForwardingKey')
    expect(JSON.stringify(finding.sources)).not.toContain('subject')
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
})
