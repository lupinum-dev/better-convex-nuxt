import { spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { stripVTControlCharacters } from 'node:util'

import { beforeAll, describe, expect, it } from 'vitest'

const repoRoot = process.cwd()
const cliEntry = resolve(repoRoot, 'dist/cli.mjs')

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

function runDoctorJson(fixtureName: string) {
  const cwd = resolve(repoRoot, 'test/fixtures', fixtureName)
  const result = runCli(['doctor', '--json'], cwd)

  return {
    ...result,
    report: JSON.parse(result.stdout) as {
      cwd: string
      findings: Array<{ id: string; status: string }>
      summary: { pass: number; warn: number; fail: number }
    },
  }
}

describe('CLI doctor', () => {
  beforeAll(() => {
    const buildResult = spawnSync('pnpm', ['exec', 'tsc', '-p', 'tsconfig.cli.json'], {
      cwd: repoRoot,
      encoding: 'utf8',
      env: {
        ...process.env,
        NUXT_TELEMETRY_DISABLED: '1',
      },
    })

    const output = `${buildResult.stdout ?? ''}\n${buildResult.stderr ?? ''}`
    expect(buildResult.status, output).toBe(0)
  })

  it('renders help output successfully', () => {
    const result = runCli(['--help'], repoRoot)
    const output = `${result.stdout ?? ''}\n${result.stderr ?? ''}`

    expect(result.status, output).toBe(0)
    expect(output).toContain('@lupinum/trellis')
    expect(output).toContain('doctor')
    expect(output).toContain('init')
    expect(output).toContain('USAGE')
  })

  it('passes for a valid consumer fixture', () => {
    const result = runDoctorJson('doctor-valid')

    expect(result.status, result.stderr).toBe(0)
    expect(result.report.summary.fail).toBe(0)
    expect(result.report.summary.warn).toBe(0)
  })

  it('fails when the module dependency is missing', () => {
    const result = runDoctorJson('doctor-missing-module-dep')
    const finding = result.report.findings.find((entry) => entry.id === 'module-installed')

    expect(result.status, result.stderr).toBe(1)
    expect(finding?.status).toBe('fail')
    expect(result.report.summary.fail).toBeGreaterThan(0)
  })

  it('fails when the module is not registered in nuxt.config', () => {
    const result = runDoctorJson('doctor-missing-registration')
    const finding = result.report.findings.find((entry) => entry.id === 'module-registered')

    expect(result.status, result.stderr).toBe(1)
    expect(finding?.status).toBe('fail')
    expect(result.report.summary.fail).toBeGreaterThan(0)
  })

  it('warns when the Convex URL source is missing', () => {
    const result = runDoctorJson('doctor-missing-env')
    const finding = result.report.findings.find((entry) => entry.id === 'convex-url-configured')

    expect(result.status, result.stderr).toBe(0)
    expect(finding?.status).toBe('warn')
    expect(result.report.summary.warn).toBeGreaterThan(0)
    expect(result.report.summary.fail).toBe(0)
  })

  it('returns stable ANSI-free JSON output', () => {
    const result = runCli(['doctor', '--json'], resolve(repoRoot, 'test/fixtures/doctor-valid'))

    expect(result.status, result.stderr).toBe(0)
    expect(result.stdout).toBe(stripVTControlCharacters(result.stdout))
    expect(() => JSON.parse(result.stdout)).not.toThrow()
  })

  it('uses exit code 2 for usage errors', () => {
    const result = runCli(['unknown-command'], repoRoot)
    const output = `${result.stdout ?? ''}\n${result.stderr ?? ''}`

    expect(result.status, output).toBe(2)
    expect(output).toContain('Error: Unknown command')
  })

  it('initializes the auth files', () => {
    const cwd = mkdtempSync(resolve(tmpdir(), 'bcn-init-auth-'))
    const result = runCli(['init', 'auth', '--cwd', cwd], repoRoot)
    const auth = readFileSync(resolve(cwd, 'convex/auth.ts'), 'utf8')
    const testSetup = readFileSync(resolve(cwd, 'convex/test.setup.ts'), 'utf8')

    expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0)
    expect(auth).toContain('defineAuth')
    expect(auth).toContain('createUserIfNeeded')
    expect(testSetup).toContain('createConvexTestModules')
  })

  it('initializes the personal permissions files', () => {
    const cwd = mkdtempSync(resolve(tmpdir(), 'bcn-init-personal-permissions-'))
    const result = runCli(['init', 'permissions', '--model', 'personal', '--cwd', cwd], repoRoot)
    const actor = readFileSync(resolve(cwd, 'convex/auth/actor.ts'), 'utf8')
    const functions = readFileSync(resolve(cwd, 'convex/functions.ts'), 'utf8')
    const users = readFileSync(resolve(cwd, 'convex/users.ts'), 'utf8')

    expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0)
    expect(actor).toContain('defineActor')
    expect(functions).toContain('createApp')
    expect(functions).toContain('export const { app, raw }')
    expect(users).toContain('definePermissionContext')
    expect(users).toContain('getPermissionContext')
  })

  it('initializes the workspace permissions files', () => {
    const cwd = mkdtempSync(resolve(tmpdir(), 'bcn-init-workspace-permissions-'))
    const result = runCli(['init', 'permissions', '--model', 'workspace', '--cwd', cwd], repoRoot)
    const actor = readFileSync(resolve(cwd, 'convex/auth/actor.ts'), 'utf8')
    const functions = readFileSync(resolve(cwd, 'convex/functions.ts'), 'utf8')
    const workspaces = readFileSync(resolve(cwd, 'convex/workspaces.ts'), 'utf8')

    expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0)
    expect(actor).toContain('defineActor')
    expect(functions).toContain('createApp')
    expect(functions).toContain('export const { app, raw }')
    expect(existsSync(resolve(cwd, 'convex/auth/scope.ts'))).toBe(false)
    expect(existsSync(resolve(cwd, 'convex/auth/resource.ts'))).toBe(false)
    expect(workspaces).toContain('definePermissionContext')
    expect(workspaces).toContain('getPermissionContext')
  })

  it('initializes the workspace-mcp permissions files', () => {
    const cwd = mkdtempSync(resolve(tmpdir(), 'bcn-init-workspace-mcp-permissions-'))
    const result = runCli(
      ['init', 'permissions', '--model', 'workspace-mcp', '--cwd', cwd],
      repoRoot,
    )
    const actor = readFileSync(resolve(cwd, 'convex/auth/actor.ts'), 'utf8')
    const functions = readFileSync(resolve(cwd, 'convex/functions.ts'), 'utf8')
    const workspaces = readFileSync(resolve(cwd, 'convex/workspaces.ts'), 'utf8')

    expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0)
    expect(actor).toContain('defineActor')
    expect(functions).toContain('createApp')
    expect(functions).toContain('export const { app, raw }')
    expect(functions).toContain('trustedCaller: true')
    expect(existsSync(resolve(cwd, 'convex/auth/scope.ts'))).toBe(false)
    expect(existsSync(resolve(cwd, 'convex/auth/resource.ts'))).toBe(false)
    expect(workspaces).toContain('definePermissionContext')
    expect(workspaces).toContain('getPermissionContext')
  })

  it('initializes MCP middleware files', () => {
    const cwd = mkdtempSync(resolve(tmpdir(), 'bcn-init-mcp-'))
    const result = runCli(['init', 'mcp', '--cwd', cwd], repoRoot)
    const middleware = readFileSync(resolve(cwd, 'server/middleware/mcp-auth.ts'), 'utf8')

    expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0)
    expect(middleware).toContain('serverConvexQuery')
    expect(middleware).toContain('event.context.mcpAuth')
  })

  it('fails doctor when removed V2 APIs are still present', () => {
    const cwd = mkdtempSync(resolve(tmpdir(), 'bcn-doctor-legacy-'))
    mkdirSync(resolve(cwd, 'composables'), { recursive: true })
    writeFileSync(
      resolve(cwd, 'package.json'),
      JSON.stringify({
        dependencies: {
          nuxt: '^3.0.0',
          convex: '^1.0.0',
          '@lupinum/trellis': '^3.0.0',
        },
      }),
    )
    writeFileSync(
      resolve(cwd, 'nuxt.config.ts'),
      "export default defineNuxtConfig({ modules: ['@lupinum/trellis'] })\n",
    )
    writeFileSync(
      resolve(cwd, 'composables/usePermissions.ts'),
      "import { createAuth } from '@lupinum/trellis/composables'\nexport const auth = createAuth({ query: {} as never })\n",
    )

    const result = runCli(['doctor', '--json'], cwd)
    const report = JSON.parse(result.stdout) as {
      findings: Array<{ id: string; status: string; fixHint: string }>
    }
    const finding = report.findings.find((entry) => entry.id === 'legacy-v2-apis')

    expect(result.status, result.stderr).toBe(1)
    expect(finding?.status).toBe('fail')
    expect(finding?.fixHint).toContain('trellis.permissions.query')
  })
})
