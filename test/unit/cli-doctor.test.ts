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
    expect(output).toContain('bridge')
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

  it('fails when the convex dependency is missing', () => {
    const result = runDoctorJson('doctor-missing-convex')
    const finding = result.report.findings.find((entry) => entry.id === 'convex-installed')

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
    const siteUrlFinding = result.report.findings.find(
      (entry) => entry.id === 'site-url-configured',
    )
    const authRoutesFinding = result.report.findings.find(
      (entry) => entry.id === 'better-auth-routes-registered',
    )

    expect(result.status, result.stderr).toBe(0)
    expect(finding?.status).toBe('warn')
    expect(siteUrlFinding?.status).toBe('warn')
    expect(authRoutesFinding?.status).toBe('warn')
    expect(result.report.summary.warn).toBeGreaterThan(0)
    expect(result.report.summary.fail).toBe(0)
  })

  it('warns when trusted-caller surfaces are present without a shared key', () => {
    const cwd = mkdtempSync(resolve(tmpdir(), 'bcn-doctor-trusted-caller-'))
    mkdirSync(resolve(cwd, 'server/api'), { recursive: true })
    writeFileSync(
      resolve(cwd, 'package.json'),
      JSON.stringify({
        dependencies: {
          nuxt: '^4.0.0',
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
      resolve(cwd, '.env.local'),
      [
        'CONVEX_URL=https://doctor-valid.convex.cloud',
        'CONVEX_SITE_URL=https://doctor-valid.convex.site',
        'SITE_URL=http://localhost:3000',
        'BETTER_AUTH_SECRET=test-secret',
      ].join('\n'),
    )
    writeFileSync(
      resolve(cwd, 'server/api/mcp.ts'),
      "import { defineConvexTool } from '@lupinum/trellis/mcp'\nexport default defineConvexTool({ description: 'x', args: {}, handler: async () => null })\n",
    )

    const result = runCli(['doctor', '--json'], cwd)
    const report = JSON.parse(result.stdout) as {
      findings: Array<{ id: string; status: string }>
      summary: { fail: number; warn: number }
    }
    const finding = report.findings.find((entry) => entry.id === 'trusted-caller-key-configured')

    expect(result.status, result.stderr).toBe(0)
    expect(finding?.status).toBe('warn')
    expect(report.summary.fail).toBe(0)
    expect(report.summary.warn).toBeGreaterThan(0)
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
    const principal = readFileSync(resolve(cwd, 'convex/auth/principal.ts'), 'utf8')
    const checks = readFileSync(resolve(cwd, 'convex/auth/checks.ts'), 'utf8')
    const functions = readFileSync(resolve(cwd, 'convex/functions.ts'), 'utf8')
    const workspaces = readFileSync(resolve(cwd, 'convex/workspaces.ts'), 'utf8')

    expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0)
    expect(actor).toContain('getActorFromPrincipal')
    expect(actor).toContain('getPermissionActor')
    expect(principal).toContain("kind: 'agent'")
    expect(principal).toContain("provider?: 'mcp'")
    expect(checks).toContain('hasWorkspace')
    expect(functions).toContain('createApp')
    expect(functions).toContain('export const { app, raw }')
    expect(functions).toContain('principal,')
    expect(functions).toContain('actor: getActorFromPrincipal')
    expect(existsSync(resolve(cwd, 'convex/auth/scope.ts'))).toBe(false)
    expect(existsSync(resolve(cwd, 'convex/auth/resource.ts'))).toBe(false)
    expect(workspaces).toContain('definePermissionContext')
    expect(workspaces).toContain('getPermissionContext')
    expect(workspaces).not.toContain('can: {')
  })

  it('initializes the workspace-mcp permissions files', () => {
    const cwd = mkdtempSync(resolve(tmpdir(), 'bcn-init-workspace-mcp-permissions-'))
    const result = runCli(
      ['init', 'permissions', '--model', 'workspace-mcp', '--cwd', cwd],
      repoRoot,
    )
    const actor = readFileSync(resolve(cwd, 'convex/auth/actor.ts'), 'utf8')
    const principal = readFileSync(resolve(cwd, 'convex/auth/principal.ts'), 'utf8')
    const functions = readFileSync(resolve(cwd, 'convex/functions.ts'), 'utf8')
    const workspaces = readFileSync(resolve(cwd, 'convex/workspaces.ts'), 'utf8')

    expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0)
    expect(actor).toContain('getActorFromPrincipal')
    expect(actor).toContain('getPermissionActor')
    expect(principal).toContain("kind: 'agent'")
    expect(functions).toContain('createApp')
    expect(functions).toContain('export const { app, raw }')
    expect(functions).toContain('principal,')
    expect(functions).toContain('actor: getActorFromPrincipal')
    expect(functions).not.toContain('trustedCaller: true')
    expect(existsSync(resolve(cwd, 'convex/auth/scope.ts'))).toBe(false)
    expect(existsSync(resolve(cwd, 'convex/auth/resource.ts'))).toBe(false)
    expect(workspaces).toContain('definePermissionContext')
    expect(workspaces).toContain('getPermissionContext')
    expect(workspaces).not.toContain('can: {')
  })

  it('initializes MCP middleware files', () => {
    const cwd = mkdtempSync(resolve(tmpdir(), 'bcn-init-mcp-'))
    const result = runCli(['init', 'mcp', '--cwd', cwd], repoRoot)
    const middleware = readFileSync(resolve(cwd, 'server/middleware/mcp-auth.ts'), 'utf8')
    const runtime = readFileSync(resolve(cwd, 'server/mcp/runtime.ts'), 'utf8')

    expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0)
    expect(middleware).toContain('serverConvexQuery')
    expect(middleware).toContain('event.context.mcpAuth')
    expect(runtime).toContain('createServerConvexCaller')
    expect(runtime).toContain('resolvePrincipal')
    expect(runtime).toContain('resolveCapabilities')
    expect(runtime).toContain('Project root internal refs or bridge refs')
  })

  it('generates bridge files from a package manifest', () => {
    const cwd = mkdtempSync(resolve(tmpdir(), 'bcn-bridge-generate-'))
    const packagePath = resolve(repoRoot, '../ginko-cms')
    mkdirSync(resolve(cwd, 'convex'), { recursive: true })
    const result = runCli(['bridge', 'generate', packagePath, '--cwd', cwd], repoRoot)
    const auth = readFileSync(resolve(cwd, 'convex/auth.ts'), 'utf8')
    const principal = readFileSync(resolve(cwd, 'convex/ginkoCms/_principal.ts'), 'utf8')

    expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0)
    expect(auth).toContain('@trellis-bridge-package: @lupinum/ginko-cms')
    expect(auth).toContain('defineGinkoAuth')
    expect(principal).toContain('createCmsComponentBridge')
  })

  it('generates bridge files from a direct manifest path', () => {
    const cwd = mkdtempSync(resolve(tmpdir(), 'bcn-bridge-manifest-'))
    const manifestPath = resolve(repoRoot, '../ginko-cms/convex/manifest.js')
    mkdirSync(resolve(cwd, 'convex'), { recursive: true })
    const result = runCli(['bridge', 'generate', manifestPath, '--cwd', cwd], repoRoot)
    const auth = readFileSync(resolve(cwd, 'convex/auth.ts'), 'utf8')

    expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0)
    expect(auth).toContain('@trellis-bridge-package: @lupinum/ginko-cms')
    expect(auth).toContain('defineGinkoAuth')
  })
})
