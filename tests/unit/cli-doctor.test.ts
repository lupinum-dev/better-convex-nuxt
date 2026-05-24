import { spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { stripVTControlCharacters } from 'node:util'

import { beforeAll, describe, expect, it } from 'vitest'

const repoRoot = process.cwd()
const cliEntry = resolve(repoRoot, 'dist/cli.mjs')
type CanonicalLayoutOptions = {
  auth: boolean
  permissions: boolean
}

type FindingSourceJson = {
  kind: 'inventory' | 'project-scan'
  inventoryPath?: string
  label?: string
  locations?: Array<{ path: string; line: number }>
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

function read(path: string): string {
  return readFileSync(path, 'utf8')
}

function parseJsonOutput<T>(output: string): T {
  return JSON.parse(stripVTControlCharacters(output)) as T
}

type DoctorInventoryJsonReport = {
  inventory: {
    schemaVersion: 1
    cwd: string
    package: {
      hasPackageJson: boolean
      hasTrellisDependency: boolean
      hasNuxtDependency: boolean
      hasConvexDependency: boolean
    }
    layers: {
      core: boolean
      auth: boolean
      workspace: boolean
      mcp: boolean
      bridge: boolean
    }
    bridge: {
      enabled: boolean
      packages: Array<{
        packageName: string
        source:
          | 'dependency'
          | 'devDependency'
          | 'optionalDependency'
          | 'peerDependency'
          | 'source-reference'
        location: { path: string; line: number } | null
      }>
    }
    files: {
      nuxtConfig: string | null
      convexHttp: string | null
      convexAuth: string | null
      appInventory: string | null
    }
    surfaces: {
      identityForwarding: boolean
      permissions: boolean
      destructiveOperations: number
      unsafeEntrypoints: number
      crossTenantEscapes: number
      mcpTools: number
      customMcpToolsWithAppWrites: number
      forwardedCallerMisuses: number
      identityForwardingPublicExposures: number
      destructiveMcpToolMisuses: number
      mcpRateLimit: boolean
      mcpRateLimitStore: 'supported' | 'unverified' | 'none'
    }
    forwarding: {
      expected: boolean
      publicExposures: Array<{ path: string; line: number }>
      forwardedCallerMisuses: Array<{ path: string; line: number }>
    }
    mcp: {
      toolCount: number
      destructiveToolMisuses: Array<{ path: string; line: number }>
      customAppWriteMisuses: Array<{ path: string; line: number }>
      rateLimit: {
        expected: boolean
        store: 'supported' | 'unverified' | 'none'
      }
    }
    backend: {
      unsafeEntrypoints: Array<{
        exportName: string | null
        surface: 'query' | 'mutation' | 'action'
        style: 'string-bypass' | 'typed-permit' | 'missing' | 'unknown'
        file: string
        source: { path: string; line: number }
        permit?: {
          kind?: string
          scopeCount?: number
          hasReviewBy: boolean
        }
      }>
      crossTenantEscapes: Array<{ path: string; line: number }>
      destructiveOperations: Array<{ path: string; line: number }>
    }
    appInventory: {
      file: string | null
      detected: boolean
      featureBindings: Array<{
        name: string
        importPath: string | null
        source: { path: string; line: number }
      }>
      warnings: Array<{
        code: 'missing-define-app-inventory' | 'dynamic-features'
        source: { path: string; line: number }
      }>
    }
    features: Array<{
      exportName: string
      name: string
      file: string
      source: { path: string; line: number }
      tenantTables: string[]
      sharedTables: string[]
      permissionRefs: string[]
      operationRefs: string[]
    }>
    permissions: {
      definitions: Array<{
        exportName: string
        key: string
        file: string
        source: { path: string; line: number }
        label?: string
        roles: string[]
        projected: boolean
      }>
      inventories: Array<{
        exportName: string
        file: string
        source: { path: string; line: number }
        permissions: string[]
        unknown: string[]
      }>
    }
    publicSurface: {
      operations: Array<{
        id: string
        exportName: string
        kind: 'safe' | 'destructive'
        source: { path: string; line: number }
      }>
      projections: Array<{
        operationId: string
        exportName: string
        projection: 'preview' | 'execute'
        source: { path: string; line: number }
      }>
      tools: Array<{
        name: string
        source: 'tool' | 'operation' | 'defineTool'
        sourceLocation: { path: string; line: number }
      }>
    }
    findings: []
  }
  findings: Array<{ id: string; status: string; sources?: FindingSourceJson[] }>
  summary: { fail: number; warn: number }
}

function expectCanonicalLayout(appRoot: string, options: CanonicalLayoutOptions) {
  const canonicalPaths = [
    'convex/functions.ts',
    'convex/schema.ts',
    'convex/features',
    'shared/features',
    'app/app.vue',
    'app/features',
    'app/pages',
    'server/api',
    'server/mcp',
    ...(options.auth
      ? [
          'convex/auth.ts',
          'convex/auth.config.ts',
          'convex/convex.config.ts',
          'convex/http.ts',
          'convex/auth',
        ]
      : []),
    ...(options.permissions ? ['convex/permissions'] : []),
  ]

  for (const relativePath of canonicalPaths) {
    expect(existsSync(resolve(appRoot, relativePath)), relativePath).toBe(true)
  }
}

function expectNoOldBackendSurface(source: string, label: string) {
  expect(source, label).not.toContain('@lupinum/trellis/functions')
  expect(source, label).not.toMatch(/=\s*(?:query|mutation)\(\s*\{/)
}

function writeDoctorEnv(appRoot: string) {
  writeFileSync(
    resolve(appRoot, '.env.local'),
    [
      'CONVEX_URL=https://doctor-valid.convex.cloud',
      'CONVEX_SITE_URL=https://doctor-valid.convex.site',
      'SITE_URL=http://localhost:3000',
      'BETTER_AUTH_SECRET=test-secret',
    ].join('\n'),
  )
}

function appendDoctorEnv(appRoot: string, lines: string[]) {
  writeFileSync(
    resolve(appRoot, '.env.local'),
    `${read(resolve(appRoot, '.env.local'))}\n${lines.join('\n')}\n`,
  )
}

describe('CLI doctor', () => {
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

  it('renders the cutover help surface', () => {
    const result = runCli(['--help'], repoRoot)
    const output = `${result.stdout ?? ''}\n${result.stderr ?? ''}`

    expect(result.status, output).toBe(0)
    expect(output).toContain('@lupinum/trellis')
    expect(output).toContain('add')
    expect(output).toContain('doctor')
    expect(output).toContain('init')
    expect(output).toContain('USAGE')
  })

  it('initializes a public app without auth or permission-context wiring', () => {
    const cwd = createTempDir('trellis-init-public-')
    const result = runCli(['init', 'demo-public', '--template', 'public', '--cwd', cwd], repoRoot)
    const appRoot = resolve(cwd, 'demo-public')

    expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0)
    expectCanonicalLayout(appRoot, { auth: false, permissions: false })
    expect(read(resolve(appRoot, 'nuxt.config.ts'))).toContain('auth: false')
    expect(read(resolve(appRoot, 'nuxt.config.ts'))).not.toContain('permissions:')
    expect(existsSync(resolve(appRoot, 'convex/auth.ts'))).toBe(false)
    expect(existsSync(resolve(appRoot, 'convex/permissions'))).toBe(false)
    expect(existsSync(resolve(appRoot, 'shared/features/todos/contract.ts'))).toBe(true)
    expect(existsSync(resolve(appRoot, 'shared/schemas'))).toBe(false)
    const functions = read(resolve(appRoot, 'convex/functions.ts'))
    const todos = read(resolve(appRoot, 'convex/features/todos/domain.ts'))
    expect(functions).toContain('@lupinum/trellis/backend')
    expect(todos).toContain('query.public({')
    expect(todos).toContain('mutation.public({')
    expectNoOldBackendSurface(functions, 'public convex/functions.ts')
    expectNoOldBackendSurface(todos, 'public todos domain')
  })

  it('rejects the deleted cms starter', () => {
    const cwd = createTempDir('trellis-init-cms-deleted-')
    const result = runCli(['init', 'demo-cms', '--template', 'cms', '--cwd', cwd], repoRoot)
    const output = `${result.stdout ?? ''}\n${result.stderr ?? ''}`

    expect(result.status, output).not.toBe(0)
    expect(output).toContain(
      'Invalid template. Use one of: public, personal, workspace, workspace-mcp.',
    )
  })

  it('rejects init app names that escape the requested cwd', () => {
    const cwd = createTempDir('trellis-init-cwd-escape-')
    const result = runCli(
      ['init', '../target', '--template', 'public', '--cwd', cwd, '--force'],
      repoRoot,
    )
    const output = `${result.stdout ?? ''}\n${result.stderr ?? ''}`

    expect(result.status, output).not.toBe(0)
    expect(output).toContain('Invalid app name. Use a single directory name, not a path.')
  })

  it('returns a machine-readable JSON summary for init', () => {
    const cwd = createTempDir('trellis-init-json-')
    const result = runCli(
      ['init', 'demo-json', '--template', 'workspace', '--cwd', cwd, '--json'],
      repoRoot,
    )
    const appRoot = resolve(cwd, 'demo-json')
    const report = parseJsonOutput<{
      status: string
      command: string
      label: string
      cwd: string
      description: string
      authored: string[]
      generated: string[]
      written: string[]
      skipped: string[]
    }>(result.stdout)

    expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0)
    expect(result.stderr).toBe('')
    expect(report).toMatchObject({
      status: 'ok',
      command: 'init',
      label: 'init:workspace',
      cwd: appRoot,
      description: 'Bootstrap a workspace Trellis app',
    })
    expect(Array.isArray(report.authored)).toBe(true)
    expect(Array.isArray(report.generated)).toBe(true)
    expect(Array.isArray(report.written)).toBe(true)
    expect(Array.isArray(report.skipped)).toBe(true)
    expect(result.stdout).not.toContain('authored files')
    expect(result.stdout).not.toContain('Finished ')
  })

  it('initializes a personal app in a named target directory with the canonical layout', () => {
    const cwd = createTempDir('trellis-init-personal-')
    const result = runCli(
      ['init', 'demo-personal', '--template', 'personal', '--cwd', cwd],
      repoRoot,
    )
    const appRoot = resolve(cwd, 'demo-personal')

    expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0)
    expectCanonicalLayout(appRoot, { auth: true, permissions: false })
    expect(read(resolve(appRoot, 'package.json'))).toContain('"name": "demo-personal"')
    expect(read(resolve(appRoot, 'app/pages/index.vue'))).toContain('PersonalStarterPage')
    expect(
      read(resolve(appRoot, 'app/features/personal/components/PersonalStarterPage.vue')),
    ).toContain('Personal Starter')
    expect(read(resolve(appRoot, 'README.md'))).toContain('demo-personal')
    expect(read(resolve(appRoot, 'nuxt.config.ts'))).not.toContain('permissions:')
    expect(existsSync(resolve(appRoot, 'convex/permissions'))).toBe(false)
    expect(existsSync(resolve(appRoot, 'convex/auth/permissions.ts'))).toBe(false)
    expect(existsSync(resolve(appRoot, 'shared/features/todos/contract.ts'))).toBe(true)
    expect(existsSync(resolve(appRoot, 'shared/schemas'))).toBe(false)
    const functions = read(resolve(appRoot, 'convex/functions.ts'))
    const todos = read(resolve(appRoot, 'convex/features/todos/domain.ts'))
    expect(functions).toContain('@lupinum/trellis/backend')
    expect(todos).toContain('query.protected({')
    expect(todos).toContain('mutation.protected({')
    expectNoOldBackendSurface(functions, 'personal convex/functions.ts')
    expectNoOldBackendSurface(todos, 'personal todos domain')
  })

  it('initializes a workspace app with MCP via --mcp', () => {
    const cwd = createTempDir('trellis-init-workspace-mcp-')
    const result = runCli(
      ['init', 'demo-workspace', '--template', 'workspace', '--mcp', '--cwd', cwd],
      repoRoot,
    )
    const appRoot = resolve(cwd, 'demo-workspace')

    expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0)
    expectCanonicalLayout(appRoot, { auth: true, permissions: true })
    expect(read(resolve(appRoot, 'nuxt.config.ts'))).toContain(
      "mcp: { name: 'demo-workspace', sessions: true }",
    )
    expect(read(resolve(appRoot, 'convex/schema.ts'))).toContain('mcpKeys: defineTable')
    expect(read(resolve(appRoot, 'server/mcp/index.ts'))).toContain('defineMcpHandler')
    const runtime = read(resolve(appRoot, 'server/mcp/runtime.ts'))
    expect(runtime).toContain("auth: 'trusted'")
    expect(runtime).not.toContain('resolveActingFor')
    expect(runtime).not.toContain('appIdentity: { userId: caller.userId }')
    expect(runtime).not.toContain('caller.userId')
    const appIdentity = read(resolve(appRoot, 'convex/auth/appIdentity.ts'))
    expect(appIdentity).toContain('getSubjectValue')
    expect(appIdentity).toContain("getSubjectValue(actingFor?.subject, 'user')")
    expect(appIdentity).not.toContain("actingFor.subject.startsWith('user:')")
    const mcpAuthMiddleware = read(resolve(appRoot, 'server/middleware/mcp-auth.ts'))
    expect(mcpAuthMiddleware).toContain("event.path?.startsWith('/mcp')")
    expect(mcpAuthMiddleware).toContain('MCP bearer token required.')
    expect(mcpAuthMiddleware).toContain('serverConvexQuery(')
    expect(mcpAuthMiddleware).toContain('api.features.mcpKeys.domain.validate')
    expect(mcpAuthMiddleware).toContain("{ auth: 'none' }")
    const functions = read(resolve(appRoot, 'convex/functions.ts'))
    const todos = read(resolve(appRoot, 'convex/features/todos/domain.ts'))
    const mcpKeys = read(resolve(appRoot, 'convex/features/mcpKeys/domain.ts'))
    expect(functions).toContain('@lupinum/trellis/backend')
    expect(todos).toContain('query.protected({')
    expect(todos).toContain('mutation.protected({')
    expect(mcpKeys).toContain('ctx.db.get(key.boundUserId)')
    expect(mcpKeys).not.toContain('boundRole')
    expect(mcpKeys).not.toContain('seenAt')
    expect(mcpKeys).toContain('query.public({')
    expect(mcpKeys).toContain('mutation.public({')
    expectNoOldBackendSurface(functions, 'workspace convex/functions.ts')
    expectNoOldBackendSurface(todos, 'workspace todos domain')
    expectNoOldBackendSurface(mcpKeys, 'workspace MCP keys domain')
  })

  it('initializes a workspace MCP app with the first-class template name', () => {
    const cwd = createTempDir('trellis-init-workspace-mcp-template-')
    const result = runCli(
      ['init', 'demo-workspace', '--template', 'workspace-mcp', '--cwd', cwd],
      repoRoot,
    )
    const appRoot = resolve(cwd, 'demo-workspace')

    expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0)
    expectCanonicalLayout(appRoot, { auth: true, permissions: true })
    expect(read(resolve(appRoot, 'README.md'))).toContain(
      'Generated with `trellis init demo-workspace --template workspace-mcp`.',
    )
    expect(read(resolve(appRoot, 'nuxt.config.ts'))).toContain(
      "mcp: { name: 'demo-workspace', sessions: true }",
    )
    expect(read(resolve(appRoot, 'convex/schema.ts'))).toContain('mcpKeys: defineTable')
    expect(read(resolve(appRoot, 'server/mcp/index.ts'))).toContain('defineMcpHandler')
    expect(existsSync(resolve(appRoot, 'server/mcp/.gitkeep'))).toBe(false)
    const todos = read(resolve(appRoot, 'convex/features/todos/domain.ts'))
    expect(todos).toContain('query.protected({')
    expect(todos).toContain('mutation.protected({')
    expectNoOldBackendSurface(todos, 'workspace-mcp todos domain')
  })

  it('adds MCP to an existing workspace app', { timeout: 15_000 }, () => {
    const cwd = createTempDir('trellis-add-mcp-')
    const initResult = runCli(
      ['init', 'demo-workspace', '--template', 'workspace', '--cwd', cwd],
      repoRoot,
    )
    const appRoot = resolve(cwd, 'demo-workspace')
    expect(initResult.status, `${initResult.stdout}\n${initResult.stderr}`).toBe(0)

    const addResult = runCli(['add', 'mcp', '--cwd', appRoot], repoRoot)

    expect(addResult.status, `${addResult.stdout}\n${addResult.stderr}`).toBe(0)
    expect(read(resolve(appRoot, 'package.json'))).toContain('@nuxtjs/mcp-toolkit')
    expect(read(resolve(appRoot, 'nuxt.config.ts'))).toContain(
      "mcp: { name: 'demo-workspace', sessions: true }",
    )
    expect(read(resolve(appRoot, 'convex/schema.ts'))).toContain('mcpKeys: defineTable')
    expect(read(resolve(appRoot, 'server/mcp/index.ts'))).toContain('defineMcpHandler')
  })

  it('returns a machine-readable JSON summary for add', { timeout: 15_000 }, () => {
    const cwd = createTempDir('trellis-add-json-')
    const initResult = runCli(
      ['init', 'demo-workspace', '--template', 'workspace', '--cwd', cwd],
      repoRoot,
    )
    const appRoot = resolve(cwd, 'demo-workspace')
    expect(initResult.status, `${initResult.stdout}\n${initResult.stderr}`).toBe(0)

    const addResult = runCli(['add', 'uploads', '--cwd', appRoot, '--json'], repoRoot)
    const report = parseJsonOutput<{
      status: string
      command: string
      label: string
      cwd: string
      description: string
      authored: string[]
      generated: string[]
      written: string[]
      skipped: string[]
    }>(addResult.stdout)

    expect(addResult.status, `${addResult.stdout}\n${addResult.stderr}`).toBe(0)
    expect(addResult.stderr).toBe('')
    expect(report).toMatchObject({
      status: 'ok',
      command: 'add',
      label: 'add:uploads',
      cwd: appRoot,
      description: 'Add a canonical upload URL seam and starter page',
    })
    expect(Array.isArray(report.authored)).toBe(true)
    expect(Array.isArray(report.generated)).toBe(true)
    expect(Array.isArray(report.written)).toBe(true)
    expect(Array.isArray(report.skipped)).toBe(true)
    expect(report.written).toContain('shared/features/files/contract.ts')
    expect(addResult.stdout).not.toContain('authored files')
    expect(addResult.stdout).not.toContain('Finished ')
  })

  it('keeps the default init output human-readable when --json is not used', () => {
    const cwd = createTempDir('trellis-init-human-output-')
    const result = runCli(['init', 'demo-human', '--template', 'public', '--cwd', cwd], repoRoot)

    expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0)
    expect(result.stdout).toContain('authored files')
    expect(result.stdout).toContain('generated plumbing')
    expect(result.stdout).toContain('Finished init:public init')
  })

  it('adds uploads and destructive operation scaffolds', () => {
    const cwd = createTempDir('trellis-add-features-')
    const initResult = runCli(
      ['init', 'demo-personal', '--template', 'personal', '--cwd', cwd],
      repoRoot,
    )
    const appRoot = resolve(cwd, 'demo-personal')
    expect(initResult.status, `${initResult.stdout}\n${initResult.stderr}`).toBe(0)

    const uploadsResult = runCli(['add', 'uploads', '--cwd', appRoot], repoRoot)
    expect(uploadsResult.status, `${uploadsResult.stdout}\n${uploadsResult.stderr}`).toBe(0)
    const uploadsDomain = read(resolve(appRoot, 'convex/features/files/domain.ts'))
    expect(uploadsDomain).toContain('generateUploadUrl')
    expect(uploadsDomain).toContain('@lupinum/trellis/backend')
    expect(uploadsDomain).toContain('mutation.unsafe({')
    expectNoOldBackendSurface(uploadsDomain, 'uploads domain')
    expect(read(resolve(appRoot, 'app/pages/uploads.vue'))).toContain('UploadsStarterPage')

    const operationResult = runCli(
      ['add', 'operation', 'publish-entry', '--kind', 'destructive', '--cwd', appRoot],
      repoRoot,
    )
    expect(operationResult.status, `${operationResult.stdout}\n${operationResult.stderr}`).toBe(0)
    const operation = read(resolve(appRoot, 'convex/operations/publish-entry.ts'))
    expect(operation).toContain("kind: 'destructive'")
    expect(operation).toContain('previewPublishEntry')
    expect(operation).toContain('executePublishEntry')
  })

  it('adds entity resources with backend imports and explicit lanes', () => {
    const cwd = createTempDir('trellis-add-entity-')
    const initResult = runCli(
      ['init', 'demo-personal', '--template', 'personal', '--cwd', cwd],
      repoRoot,
    )
    const appRoot = resolve(cwd, 'demo-personal')
    expect(initResult.status, `${initResult.stdout}\n${initResult.stderr}`).toBe(0)

    const entityResult = runCli(['add', 'entity', 'bookmark', '--cwd', appRoot], repoRoot)
    expect(entityResult.status, `${entityResult.stdout}\n${entityResult.stderr}`).toBe(0)

    const domain = read(resolve(appRoot, 'convex/features/bookmarks/domain.ts'))
    expect(domain).toContain('query.protected({')
    expect(domain).toContain('mutation.protected({')
    expectNoOldBackendSurface(domain, 'generated entity domain')
  })

  it('rejects the removed legacy init flows with migration guidance', () => {
    const cwd = createTempDir('trellis-init-legacy-')
    const result = runCli(['init', 'app', '--template', 'personal', '--cwd', cwd], repoRoot)
    const output = `${result.stdout ?? ''}\n${result.stderr ?? ''}`

    expect(result.status, output).toBe(2)
    expect(output).toContain('Legacy init flow removed')
    expect(output).toContain('trellis init <name> --template')
    expect(output).toContain('trellis add')
  })

  it('passes doctor for a generated canonical personal app', () => {
    const cwd = createTempDir('trellis-doctor-valid-')
    const initResult = runCli(
      ['init', 'doctor-app', '--template', 'personal', '--cwd', cwd],
      repoRoot,
    )
    const appRoot = resolve(cwd, 'doctor-app')
    expect(initResult.status, `${initResult.stdout}\n${initResult.stderr}`).toBe(0)
    writeDoctorEnv(appRoot)

    const result = runCli(['doctor', '--json', '--cwd', appRoot], repoRoot)
    const report = JSON.parse(result.stdout) as {
      findings: Array<{ id: string; status: string }>
      summary: { fail: number; warn: number }
    }

    expect(result.status, result.stderr).toBe(0)
    expect(report.summary.fail).toBe(0)
    expect(report.summary.warn).toBe(0)
    expect(report.findings.find((entry) => entry.id === 'canonical-layout')?.status).toBe('pass')
    expect(report.findings.find((entry) => entry.id === 'app-inventory-source')?.status).toBe(
      'pass',
    )
    expect(result.stdout).toBe(stripVTControlCharacters(result.stdout))
  })

  it('treats an unset auth option as no-auth for doctor layout and env checks', () => {
    const appRoot = createTempDir('trellis-doctor-no-auth-default-')
    writeFileSync(
      resolve(appRoot, 'package.json'),
      JSON.stringify(
        {
          dependencies: {
            '@lupinum/trellis': 'workspace:*',
            convex: '1.38.0',
            nuxt: '^4.4.5',
          },
        },
        null,
        2,
      ),
    )
    writeFileSync(
      resolve(appRoot, 'nuxt.config.ts'),
      `export default defineNuxtConfig({ modules: ['@lupinum/trellis'], trellis: { url: process.env.CONVEX_URL } })`,
    )
    for (const path of [
      'convex/features',
      'shared/features',
      'app/features',
      'app/pages',
      'server/api',
      'server/mcp',
    ]) {
      mkdirSync(resolve(appRoot, path), { recursive: true })
    }
    writeFileSync(resolve(appRoot, 'convex/functions.ts'), '')
    writeFileSync(resolve(appRoot, 'convex/schema.ts'), '')
    writeFileSync(resolve(appRoot, 'app/app.vue'), '<template><NuxtPage /></template>')
    writeFileSync(resolve(appRoot, '.env.local'), 'CONVEX_URL=https://doctor.convex.cloud\n')

    const result = runCli(['doctor', '--json', '--cwd', appRoot], repoRoot)
    const report = parseJsonOutput<DoctorInventoryJsonReport>(result.stdout)

    expect(report.findings.find((entry) => entry.id === 'canonical-layout')?.status).toBe('pass')
    expect(report.findings.find((entry) => entry.id === 'site-url-configured')?.status).toBe('pass')
    expect(
      report.findings.find((entry) => entry.id === 'better-auth-secret-configured')?.status,
    ).toBe('pass')
  })

  it('promotes deploy-time MCP identity warnings to failures with doctor --production', () => {
    const cwd = createTempDir('trellis-doctor-production-profile-')
    const initResult = runCli(
      ['init', 'doctor-app', '--template', 'workspace-mcp', '--cwd', cwd],
      repoRoot,
    )
    const appRoot = resolve(cwd, 'doctor-app')
    expect(initResult.status, `${initResult.stdout}\n${initResult.stderr}`).toBe(0)
    writeDoctorEnv(appRoot)
    writeFileSync(
      resolve(appRoot, 'server/mcp/tools/delete-todo.ts'),
      `export default tool.operation(deleteTodoOp, { name: 'delete-todo' })\n`,
    )

    const normalResult = runCli(['doctor', '--json', '--cwd', appRoot], repoRoot)
    const normalReport = parseJsonOutput<DoctorInventoryJsonReport>(normalResult.stdout)
    expect(
      normalReport.findings.find((entry) => entry.id === 'identity-forwarding-key-configured')
        ?.status,
    ).toBe('warn')

    const productionResult = runCli(
      ['doctor', '--production', '--json', '--cwd', appRoot],
      repoRoot,
    )
    const productionReport = parseJsonOutput<DoctorInventoryJsonReport>(productionResult.stdout)

    expect(productionResult.status).toBe(1)
    expect(
      productionReport.findings.find((entry) => entry.id === 'identity-forwarding-key-configured')
        ?.status,
    ).toBe('fail')
  })

  it('includes versioned inventory in doctor JSON for generated starters', () => {
    const cases = [
      { template: 'public', auth: false, workspace: false, mcp: false },
      { template: 'personal', auth: true, workspace: false, mcp: false },
      { template: 'workspace', auth: true, workspace: true, mcp: false },
      { template: 'workspace-mcp', auth: true, workspace: true, mcp: true },
    ] as const

    for (const starter of cases) {
      const cwd = createTempDir(`trellis-doctor-inventory-${starter.template}-`)
      const initResult = runCli(
        ['init', 'doctor-app', '--template', starter.template, '--cwd', cwd],
        repoRoot,
      )
      const appRoot = resolve(cwd, 'doctor-app')
      expect(initResult.status, `${initResult.stdout}\n${initResult.stderr}`).toBe(0)
      writeDoctorEnv(appRoot)

      if (starter.mcp) {
        appendDoctorEnv(appRoot, [
          'CONVEX_IDENTITY_FORWARDING_KEY=this-is-a-long-random-identity-forwarding-key',
        ])
      }

      const result = runCli(['doctor', '--json', '--cwd', appRoot], repoRoot)
      const report = parseJsonOutput<DoctorInventoryJsonReport>(result.stdout)

      expect(result.status, result.stderr).toBe(0)
      expect(report.inventory.schemaVersion).toBe(1)
      expect(report.inventory.cwd).toBe(appRoot)
      expect(report.inventory.package).toMatchObject({
        hasPackageJson: true,
        hasTrellisDependency: true,
        hasNuxtDependency: true,
        hasConvexDependency: true,
      })
      expect(report.inventory.layers).toMatchObject({
        core: true,
        auth: starter.auth,
        workspace: starter.workspace,
        mcp: starter.mcp,
        bridge: false,
      })
      expect(report.inventory.bridge).toEqual({
        enabled: false,
        packages: [],
      })
      expect(report.inventory.files.nuxtConfig).toBe('nuxt.config.ts')
      expect(report.inventory.files.appInventory).toBe(null)
      expect(report.inventory.surfaces.permissions).toBe(starter.workspace)
      expect(report.inventory.surfaces.identityForwarding).toBe(starter.mcp)
      expect(report.inventory.surfaces.mcpTools).toBe(starter.mcp ? 2 : 0)
      expect(report.inventory.surfaces.mcpRateLimitStore).toBe('none')
      expect(report.inventory.forwarding).toMatchObject({
        expected: starter.mcp,
        publicExposures: [],
        forwardedCallerMisuses: [],
      })
      expect(report.inventory.mcp).toMatchObject({
        toolCount: starter.mcp ? 2 : 0,
        destructiveToolMisuses: [],
        customAppWriteMisuses: [],
        rateLimit: {
          expected: false,
          store: 'none',
        },
      })
      expect(report.inventory.backend).toMatchObject({
        unsafeEntrypoints: [],
        crossTenantEscapes: [],
        destructiveOperations: [],
      })
      expect(report.inventory.appInventory).toEqual({
        file: null,
        detected: false,
        featureBindings: [],
        warnings: [],
      })
      if (starter.workspace) {
        expect(report.inventory.features).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              exportName: 'todosFeature',
              name: 'todos',
              file: 'convex/features/todos/feature.ts',
              source: expect.objectContaining({
                path: 'convex/features/todos/feature.ts',
                line: expect.any(Number),
              }),
              permissionRefs: ['todoPermissions'],
            }),
            expect.objectContaining({
              exportName: 'usersFeature',
              name: 'users',
              sharedTables: ['users'],
            }),
            expect.objectContaining({
              exportName: 'workspacesFeature',
              name: 'workspaces',
              sharedTables: ['workspaces'],
            }),
          ]),
        )
        expect(report.inventory.permissions.definitions).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              exportName: 'workspaceRead',
              key: 'workspace.read',
              file: 'convex/features/todos/permissions.ts',
              source: expect.objectContaining({
                path: 'convex/features/todos/permissions.ts',
                line: expect.any(Number),
              }),
              roles: [],
              projected: true,
            }),
            expect.objectContaining({
              exportName: 'todoCreate',
              key: 'todo.create',
              file: 'convex/features/todos/permissions.ts',
              roles: [],
              projected: true,
            }),
          ]),
        )
        expect(report.inventory.permissions.inventories).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              exportName: 'todoPermissions',
              file: 'convex/features/todos/permissions.ts',
              source: expect.objectContaining({
                path: 'convex/features/todos/permissions.ts',
                line: expect.any(Number),
              }),
              permissions: ['workspaceRead', 'todoCreate'],
              unknown: [],
            }),
          ]),
        )
      } else {
        expect(report.inventory.features).toEqual([])
        expect(report.inventory.permissions).toEqual({
          definitions: [],
          inventories: [],
        })
      }
      expect(report.inventory.publicSurface).toMatchObject({
        operations: [],
        projections: [],
      })
      expect(report.inventory.publicSurface.tools.length).toBe(starter.mcp ? 2 : 0)
      expect(report.inventory.findings).toEqual([])
    }
  }, 60_000)

  it('reports bridge dependency inventory without loading bridge packages', () => {
    const cwd = createTempDir('trellis-doctor-bridge-dependency-')
    const initResult = runCli(
      ['init', 'doctor-app', '--template', 'public', '--cwd', cwd],
      repoRoot,
    )
    const appRoot = resolve(cwd, 'doctor-app')
    expect(initResult.status, `${initResult.stdout}\n${initResult.stderr}`).toBe(0)
    writeDoctorEnv(appRoot)

    const packageJsonPath = resolve(appRoot, 'package.json')
    const packageJson = JSON.parse(read(packageJsonPath)) as {
      dependencies?: Record<string, string>
    }
    packageJson.dependencies = {
      ...packageJson.dependencies,
      '@lupinum/trellis-bridge': 'workspace:*',
    }
    writeFileSync(packageJsonPath, `${JSON.stringify(packageJson, null, 2)}\n`)

    const result = runCli(['doctor', '--json', '--cwd', appRoot], repoRoot)
    const report = parseJsonOutput<DoctorInventoryJsonReport>(result.stdout)

    expect(result.status, result.stderr).toBe(0)
    expect(report.inventory.layers.bridge).toBe(true)
    expect(report.inventory.layers.bridge).toBe(report.inventory.bridge.enabled)
    expect(report.inventory.bridge.packages).toEqual([
      {
        packageName: '@lupinum/trellis-bridge',
        source: 'dependency',
        location: null,
      },
    ])
  })

  it('reports bridge source references with safe snippet-free evidence', () => {
    const cwd = createTempDir('trellis-doctor-bridge-source-')
    const initResult = runCli(
      ['init', 'doctor-app', '--template', 'public', '--cwd', cwd],
      repoRoot,
    )
    const appRoot = resolve(cwd, 'doctor-app')
    expect(initResult.status, `${initResult.stdout}\n${initResult.stderr}`).toBe(0)
    writeDoctorEnv(appRoot)

    mkdirSync(resolve(appRoot, 'server/api'), { recursive: true })
    writeFileSync(
      resolve(appRoot, 'server/api/ginko.ts'),
      "const fixtureOnlySecret = 'do-not-leak-bridge-source-snippet'\nimport '@lupinum/ginko-cms'\n",
    )

    const result = runCli(['doctor', '--json', '--cwd', appRoot], repoRoot)
    const report = parseJsonOutput<DoctorInventoryJsonReport>(result.stdout)
    const serializedInventory = JSON.stringify(report.inventory)

    expect(result.status, result.stderr).toBe(0)
    expect(report.inventory.layers.bridge).toBe(true)
    expect(report.inventory.layers.bridge).toBe(report.inventory.bridge.enabled)
    expect(report.inventory.bridge.packages).toEqual([
      {
        packageName: '@lupinum/ginko-cms',
        source: 'source-reference',
        location: {
          path: 'server/api/ginko.ts',
          line: 2,
        },
      },
    ])
    expect(serializedInventory).not.toContain('do-not-leak-bridge-source-snippet')
    expect(serializedInventory).not.toContain("import '@lupinum/ginko-cms'")
  })

  it('discovers canonical static app inventory without executing app code', () => {
    const fixtureRoot = resolve(repoRoot, 'tests/fixtures/phase0-workspace-mcp')
    const result = runCli(['doctor', '--json', '--cwd', fixtureRoot], repoRoot)
    const report = parseJsonOutput<
      DoctorInventoryJsonReport & {
        findings: Array<{ id: string; status: string; message: string }>
      }
    >(result.stdout)

    expect(report.inventory.files.appInventory).toBe('shared/app-inventory.ts')
    expect(report.inventory.appInventory).toEqual({
      file: 'shared/app-inventory.ts',
      detected: true,
      featureBindings: [
        {
          name: 'projectsFeature',
          importPath: './features/projects/feature',
          source: {
            path: 'shared/app-inventory.ts',
            line: expect.any(Number),
          },
        },
      ],
      warnings: [],
    })
    expect(report.inventory.publicSurface.tools).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'delete-project',
          source: 'operation',
          sourceLocation: expect.objectContaining({
            path: 'server/mcp/tools/delete-project.ts',
            line: expect.any(Number),
          }),
        }),
      ]),
    )
    expect(report.findings.find((entry) => entry.id === 'app-inventory-source')).toMatchObject({
      status: 'pass',
      message: expect.stringContaining('1 static feature binding'),
    })
  })

  it('reports dynamic app inventory feature lists without guessing metadata', () => {
    const cwd = createTempDir('trellis-doctor-dynamic-app-inventory-')
    const initResult = runCli(
      ['init', 'doctor-app', '--template', 'public', '--cwd', cwd],
      repoRoot,
    )
    const appRoot = resolve(cwd, 'doctor-app')
    expect(initResult.status, `${initResult.stdout}\n${initResult.stderr}`).toBe(0)
    writeDoctorEnv(appRoot)
    writeFileSync(
      resolve(appRoot, 'shared/app-inventory.ts'),
      `
import { defineAppInventory } from '@lupinum/trellis/workspace'

const features = []

export const appInventory = defineAppInventory({
  features,
})
`.trimStart(),
    )

    const result = runCli(['doctor', '--json', '--cwd', appRoot], repoRoot)
    const report = parseJsonOutput<
      DoctorInventoryJsonReport & {
        findings: Array<{ id: string; status: string; message: string }>
      }
    >(result.stdout)

    expect(result.status, result.stderr).toBe(0)
    expect(report.summary.warn).toBe(1)
    expect(report.inventory.files.appInventory).toBe('shared/app-inventory.ts')
    expect(report.inventory.appInventory).toMatchObject({
      file: 'shared/app-inventory.ts',
      detected: true,
      featureBindings: [],
      warnings: [
        {
          code: 'dynamic-features',
          source: {
            path: 'shared/app-inventory.ts',
            line: expect.any(Number),
          },
        },
      ],
    })
    expect(report.findings.find((entry) => entry.id === 'app-inventory-source')).toMatchObject({
      status: 'warn',
      message: expect.stringContaining('dynamic-features at shared/app-inventory.ts'),
    })
  })

  it('reports malformed app inventory files without executing source', () => {
    const cwd = createTempDir('trellis-doctor-malformed-app-inventory-')
    const initResult = runCli(
      ['init', 'doctor-app', '--template', 'public', '--cwd', cwd],
      repoRoot,
    )
    const appRoot = resolve(cwd, 'doctor-app')
    expect(initResult.status, `${initResult.stdout}\n${initResult.stderr}`).toBe(0)
    writeDoctorEnv(appRoot)
    writeFileSync(
      resolve(appRoot, 'shared/app-inventory.ts'),
      `
export const appInventory = {
  features: ['do-not-leak-this-feature-string'],
}
`.trimStart(),
    )

    const result = runCli(['doctor', '--json', '--cwd', appRoot], repoRoot)
    const report = parseJsonOutput<
      DoctorInventoryJsonReport & {
        findings: Array<{ id: string; status: string; message: string }>
      }
    >(result.stdout)
    const serializedInventory = JSON.stringify(report.inventory)

    expect(result.status, result.stderr).toBe(0)
    expect(report.summary.warn).toBe(1)
    expect(report.inventory.appInventory).toMatchObject({
      file: 'shared/app-inventory.ts',
      detected: true,
      featureBindings: [],
      warnings: [
        {
          code: 'missing-define-app-inventory',
          source: {
            path: 'shared/app-inventory.ts',
            line: 1,
          },
        },
      ],
    })
    expect(report.findings.find((entry) => entry.id === 'app-inventory-source')).toMatchObject({
      status: 'warn',
      message: expect.stringContaining('missing-define-app-inventory at shared/app-inventory.ts:1'),
    })
    expect(serializedInventory).not.toContain('do-not-leak-this-feature-string')
  })

  it('keeps inventory JSON safe to share', () => {
    const cwd = createTempDir('trellis-doctor-inventory-secret-safe-')
    const initResult = runCli(
      ['init', 'doctor-app', '--template', 'workspace-mcp', '--cwd', cwd],
      repoRoot,
    )
    const appRoot = resolve(cwd, 'doctor-app')
    expect(initResult.status, `${initResult.stdout}\n${initResult.stderr}`).toBe(0)
    writeDoctorEnv(appRoot)
    appendDoctorEnv(appRoot, [
      'CONVEX_IDENTITY_FORWARDING_KEY=do-not-leak-this-forwarding-secret-value',
    ])
    writeFileSync(
      resolve(appRoot, 'server/mcp/tools/leaky-caller.ts'),
      `
export const fixture = {
  caller: { subject: 'user:do-not-leak-this-subject-value' },
}
`.trimStart(),
    )
    writeFileSync(
      resolve(appRoot, 'shared/app-inventory.ts'),
      `
import { defineAppInventory } from '@lupinum/trellis/workspace'

const localSecret = 'do-not-leak-this-app-inventory-secret'

export const appInventory = defineAppInventory({
  features: [] as const,
})
`.trimStart(),
    )

    const result = runCli(['doctor', '--json', '--cwd', appRoot], repoRoot)
    const report = parseJsonOutput<DoctorInventoryJsonReport>(result.stdout)
    const serializedInventory = JSON.stringify(report.inventory)

    expect(result.status, result.stderr).toBe(0)
    expect(serializedInventory).not.toContain('do-not-leak-this-forwarding-secret-value')
    expect(serializedInventory).not.toContain('test-secret')
    expect(serializedInventory).not.toContain('do-not-leak-this-subject-value')
    expect(serializedInventory).not.toContain('do-not-leak-this-app-inventory-secret')
    expect(serializedInventory).not.toContain('BETTER_AUTH_SECRET')
    expect(serializedInventory).not.toContain('CONVEX_IDENTITY_FORWARDING_KEY')
  })

  it('keeps doctor human output focused on findings', () => {
    const cwd = createTempDir('trellis-doctor-inventory-human-')
    const initResult = runCli(
      ['init', 'doctor-app', '--template', 'personal', '--cwd', cwd],
      repoRoot,
    )
    const appRoot = resolve(cwd, 'doctor-app')
    expect(initResult.status, `${initResult.stdout}\n${initResult.stderr}`).toBe(0)
    writeDoctorEnv(appRoot)

    const result = runCli(['doctor', '--cwd', appRoot], repoRoot)

    expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0)
    expect(result.stdout).toContain('doctor target')
    expect(result.stdout).toContain('App inventory source')
    expect(result.stdout).not.toContain('schemaVersion')
    expect(result.stdout).not.toContain('"inventory"')
  })

  it('fails doctor when identity-forwarding surfaces use a placeholder key', () => {
    const cwd = createTempDir('trellis-doctor-identity-forwarding-placeholder-')
    const initResult = runCli(
      ['init', 'doctor-trusted-app', '--template', 'workspace', '--mcp', '--cwd', cwd],
      repoRoot,
    )
    const appRoot = resolve(cwd, 'doctor-trusted-app')
    expect(initResult.status, `${initResult.stdout}\n${initResult.stderr}`).toBe(0)
    writeDoctorEnv(appRoot)
    appendDoctorEnv(appRoot, [
      'CONVEX_IDENTITY_FORWARDING_KEY=replace-me-with-a-long-random-shared-secret',
    ])

    const result = runCli(['doctor', '--json', '--cwd', appRoot], repoRoot)
    const report = JSON.parse(result.stdout) as DoctorInventoryJsonReport & {
      findings: Array<{ id: string; status: string; message: string }>
      summary: { fail: number }
    }

    expect(result.status, result.stderr).toBe(1)
    expect(report.summary.fail).toBeGreaterThan(0)
    expect(
      report.findings.find((entry) => entry.id === 'identity-forwarding-key-strength')?.status,
    ).toBe('fail')
    expect(
      report.findings.find((entry) => entry.id === 'identity-forwarding-key-strength')?.message,
    ).toMatch(/placeholder value/i)
  })

  it('fails doctor when the identity-forwarding key is exposed through a public env name', () => {
    const cwd = createTempDir('trellis-doctor-identity-forwarding-public-exposure-')
    const initResult = runCli(
      ['init', 'doctor-trusted-app', '--template', 'workspace', '--mcp', '--cwd', cwd],
      repoRoot,
    )
    const appRoot = resolve(cwd, 'doctor-trusted-app')
    expect(initResult.status, `${initResult.stdout}\n${initResult.stderr}`).toBe(0)
    writeDoctorEnv(appRoot)
    appendDoctorEnv(appRoot, [
      'CONVEX_IDENTITY_FORWARDING_KEY=this-is-a-long-random-identity-forwarding-key',
      'NUXT_PUBLIC_CONVEX_IDENTITY_FORWARDING_KEY=this-should-not-be-public',
    ])

    const result = runCli(['doctor', '--json', '--cwd', appRoot], repoRoot)
    const report = JSON.parse(result.stdout) as DoctorInventoryJsonReport & {
      findings: Array<{ id: string; status: string; message: string }>
      summary: { fail: number }
    }

    expect(result.status, result.stderr).toBe(1)
    expect(report.summary.fail).toBeGreaterThan(0)
    expect(
      report.findings.find((entry) => entry.id === 'identity-forwarding-key-public-exposure')
        ?.status,
    ).toBe('fail')
    expect(
      report.findings.find((entry) => entry.id === 'identity-forwarding-key-public-exposure')
        ?.message,
    ).toMatch(/public-facing code or env sources/i)
    expect(report.inventory.forwarding.publicExposures).toEqual([
      expect.objectContaining({ path: '.env.local', line: expect.any(Number) }),
    ])
    expect(
      report.findings.find((entry) => entry.id === 'identity-forwarding-key-public-exposure')
        ?.message,
    ).toContain('.env.local')
    expect(
      report.findings.find((entry) => entry.id === 'identity-forwarding-key-public-exposure')
        ?.sources,
    ).toEqual([
      expect.objectContaining({
        kind: 'inventory',
        inventoryPath: 'forwarding.publicExposures',
        locations: [
          expect.objectContaining({
            path: '.env.local',
            line: expect.any(Number),
          }),
        ],
      }),
    ])
    expect(
      JSON.stringify(
        report.findings.find((entry) => entry.id === 'identity-forwarding-key-public-exposure')
          ?.sources,
      ),
    ).not.toContain('this-should-not-be-public')
  })

  it('fails doctor when MCP rate-limited tools do not configure an explicit external store', () => {
    const cwd = createTempDir('trellis-doctor-mcp-rate-limit-missing-store-')
    const initResult = runCli(
      ['init', 'doctor-mcp-app', '--template', 'workspace', '--mcp', '--cwd', cwd],
      repoRoot,
    )
    const appRoot = resolve(cwd, 'doctor-mcp-app')
    expect(initResult.status, `${initResult.stdout}\n${initResult.stderr}`).toBe(0)
    writeDoctorEnv(appRoot)

    writeFileSync(
      resolve(appRoot, 'server/mcp/tools/create-todo.ts'),
      read(resolve(appRoot, 'server/mcp/tools/create-todo.ts')).replace(
        "meta: {\n    name: 'create-todo',\n  },",
        "meta: {\n    name: 'create-todo',\n  },\n  rateLimit: { max: 5, window: '1m' },",
      ),
    )

    const result = runCli(['doctor', '--json', '--cwd', appRoot], repoRoot)
    const report = JSON.parse(result.stdout) as DoctorInventoryJsonReport & {
      findings: Array<{ id: string; status: string; message: string }>
      summary: { fail: number; warn: number }
    }

    expect(result.status, result.stderr).toBe(1)
    expect(report.summary.fail).toBeGreaterThan(0)
    expect(report.findings.find((entry) => entry.id === 'mcp-rate-limit-store')?.status).toBe(
      'fail',
    )
    expect(report.inventory.mcp.rateLimit).toEqual({
      expected: true,
      store: 'none',
    })
  })

  it('passes doctor when MCP rate-limited tools configure the supported Redis store', () => {
    const cwd = createTempDir('trellis-doctor-mcp-rate-limit-store-')
    const initResult = runCli(
      ['init', 'doctor-mcp-app', '--template', 'workspace', '--mcp', '--cwd', cwd],
      repoRoot,
    )
    const appRoot = resolve(cwd, 'doctor-mcp-app')
    expect(initResult.status, `${initResult.stdout}\n${initResult.stderr}`).toBe(0)
    writeDoctorEnv(appRoot)

    writeFileSync(
      resolve(appRoot, 'server/mcp/tools/create-todo.ts'),
      read(resolve(appRoot, 'server/mcp/tools/create-todo.ts')).replace(
        "meta: {\n    name: 'create-todo',\n  },",
        "meta: {\n    name: 'create-todo',\n  },\n  rateLimit: { max: 5, window: '1m' },",
      ),
    )
    writeFileSync(
      resolve(appRoot, 'server/mcp/runtime.ts'),
      read(resolve(appRoot, 'server/mcp/runtime.ts'))
        .replace(
          "import { defineMcpApp } from '@lupinum/trellis/mcp'",
          "import { createRedisMcpRateLimitStore, defineMcpApp } from '@lupinum/trellis/mcp'",
        )
        .replace(
          'export const mcpRuntime = defineMcpApp<WorkspaceCaller>({',
          'export const mcpRuntime = defineMcpApp<WorkspaceCaller>({\n  rateLimitStore: createRedisMcpRateLimitStore({ client: { eval: async () => 1 } as never }),',
        ),
    )

    const result = runCli(['doctor', '--json', '--cwd', appRoot], repoRoot)
    const report = JSON.parse(result.stdout) as {
      findings: Array<{ id: string; status: string }>
      summary: { fail: number }
    }

    expect(result.status, result.stderr).toBe(0)
    expect(report.summary.fail).toBe(0)
    expect(report.findings.find((entry) => entry.id === 'mcp-rate-limit-store')?.status).toBe(
      'pass',
    )
  })

  it('passes doctor when the supported Redis store is factored through a local helper', () => {
    const cwd = createTempDir('trellis-doctor-mcp-rate-limit-helper-store-')
    const initResult = runCli(
      ['init', 'doctor-mcp-app', '--template', 'workspace', '--mcp', '--cwd', cwd],
      repoRoot,
    )
    const appRoot = resolve(cwd, 'doctor-mcp-app')
    expect(initResult.status, `${initResult.stdout}\n${initResult.stderr}`).toBe(0)
    writeDoctorEnv(appRoot)

    writeFileSync(
      resolve(appRoot, 'server/mcp/tools/create-todo.ts'),
      read(resolve(appRoot, 'server/mcp/tools/create-todo.ts')).replace(
        "meta: {\n    name: 'create-todo',\n  },",
        "meta: {\n    name: 'create-todo',\n  },\n  rateLimit: { max: 5, window: '1m' },",
      ),
    )
    writeFileSync(
      resolve(appRoot, 'server/mcp/rate-limit-store.ts'),
      [
        "import { createRedisMcpRateLimitStore } from '@lupinum/trellis/mcp'",
        '',
        'export const rateLimitStore = createRedisMcpRateLimitStore({',
        '  client: { eval: async () => 1 } as never,',
        '})',
        '',
      ].join('\n'),
    )
    writeFileSync(
      resolve(appRoot, 'server/mcp/runtime.ts'),
      read(resolve(appRoot, 'server/mcp/runtime.ts'))
        .replace(
          "import { defineMcpApp } from '@lupinum/trellis/mcp'",
          "import { defineMcpApp } from '@lupinum/trellis/mcp'\nimport { rateLimitStore } from './rate-limit-store'",
        )
        .replace(
          'export const mcpRuntime = defineMcpApp<WorkspaceCaller>({',
          'export const mcpRuntime = defineMcpApp<WorkspaceCaller>({\n  rateLimitStore,',
        ),
    )

    const result = runCli(['doctor', '--json', '--cwd', appRoot], repoRoot)
    const report = JSON.parse(result.stdout) as {
      findings: Array<{ id: string; status: string }>
      summary: { fail: number }
    }

    expect(result.status, result.stderr).toBe(0)
    expect(report.summary.fail).toBe(0)
    expect(report.findings.find((entry) => entry.id === 'mcp-rate-limit-store')?.status).toBe(
      'pass',
    )
  })

  it('fails doctor when MCP rate-limited tools use an unverified custom store', () => {
    const cwd = createTempDir('trellis-doctor-mcp-rate-limit-custom-store-')
    const initResult = runCli(
      ['init', 'doctor-mcp-app', '--template', 'workspace', '--mcp', '--cwd', cwd],
      repoRoot,
    )
    const appRoot = resolve(cwd, 'doctor-mcp-app')
    expect(initResult.status, `${initResult.stdout}\n${initResult.stderr}`).toBe(0)
    writeDoctorEnv(appRoot)

    writeFileSync(
      resolve(appRoot, 'server/mcp/tools/create-todo.ts'),
      read(resolve(appRoot, 'server/mcp/tools/create-todo.ts')).replace(
        "meta: {\n    name: 'create-todo',\n  },",
        "meta: {\n    name: 'create-todo',\n  },\n  rateLimit: { max: 5, window: '1m' },",
      ),
    )
    writeFileSync(
      resolve(appRoot, 'server/mcp/runtime.ts'),
      read(resolve(appRoot, 'server/mcp/runtime.ts')).replace(
        'export const mcpRuntime = defineMcpApp<WorkspaceCaller>({',
        'export const mcpRuntime = defineMcpApp<WorkspaceCaller>({\n  rateLimitStore: {} as never,',
      ),
    )

    const result = runCli(['doctor', '--json', '--cwd', appRoot], repoRoot)
    const report = JSON.parse(result.stdout) as {
      findings: Array<{ id: string; status: string }>
      summary: { fail: number; warn: number }
    }

    expect(result.status, result.stderr).toBe(1)
    expect(report.summary.fail).toBeGreaterThan(0)
    expect(report.findings.find((entry) => entry.id === 'mcp-rate-limit-store')?.status).toBe(
      'fail',
    )
  })

  it('fails doctor when the canonical layout drifts', () => {
    const cwd = createTempDir('trellis-doctor-layout-drift-')
    const initResult = runCli(
      ['init', 'doctor-app', '--template', 'workspace', '--cwd', cwd],
      repoRoot,
    )
    const appRoot = resolve(cwd, 'doctor-app')
    expect(initResult.status, `${initResult.stdout}\n${initResult.stderr}`).toBe(0)
    writeDoctorEnv(appRoot)
    rmSync(resolve(appRoot, 'convex/features'), { recursive: true, force: true })

    const result = runCli(['doctor', '--json', '--cwd', appRoot], repoRoot)
    const report = JSON.parse(result.stdout) as {
      findings: Array<{
        id: string
        status: string
        message: string
        sources?: FindingSourceJson[]
      }>
      summary: { fail: number }
    }
    const finding = report.findings.find((entry) => entry.id === 'canonical-layout')

    expect(result.status, result.stderr).toBe(1)
    expect(report.summary.fail).toBeGreaterThan(0)
    expect(finding?.status).toBe('fail')
    expect(finding?.message).toContain('convex/features')
  })

  it('fails doctor when a tenant-shaped schema table is omitted from classification', () => {
    const cwd = createTempDir('trellis-doctor-tenant-drift-')
    const initResult = runCli(
      ['init', 'doctor-app', '--template', 'workspace', '--cwd', cwd],
      repoRoot,
    )
    const appRoot = resolve(cwd, 'doctor-app')
    expect(initResult.status, `${initResult.stdout}\n${initResult.stderr}`).toBe(0)
    writeDoctorEnv(appRoot)

    writeFileSync(
      resolve(appRoot, 'convex/schema.ts'),
      `${read(resolve(appRoot, 'convex/schema.ts'))
        .trimEnd()
        .replace(/\}\)\s*$/, '')},
  comments: defineTable({
    workspaceId: v.id('workspaces'),
    body: v.string(),
  }).index('by_workspace', ['workspaceId']),
})\n`,
    )

    const result = runCli(['doctor', '--json', '--cwd', appRoot], repoRoot)
    const report = JSON.parse(result.stdout) as DoctorInventoryJsonReport & {
      findings: Array<{ id: string; status: string; message: string }>
    }

    expect(result.status, result.stderr).toBe(1)
    expect(report.findings.find((entry) => entry.id === 'isolation-table-coverage')?.status).toBe(
      'fail',
    )
    expect(
      report.findings.find((entry) => entry.id === 'isolation-table-coverage')?.message,
    ).toContain('comments')
  })

  it('fails doctor when destructive-safety schema requirements drift', () => {
    const cwd = createTempDir('trellis-doctor-destructive-drift-')
    const initResult = runCli(
      ['init', 'doctor-app', '--template', 'workspace', '--cwd', cwd],
      repoRoot,
    )
    const appRoot = resolve(cwd, 'doctor-app')
    expect(initResult.status, `${initResult.stdout}\n${initResult.stderr}`).toBe(0)
    writeDoctorEnv(appRoot)

    writeFileSync(
      resolve(appRoot, 'convex/functions.ts'),
      read(resolve(appRoot, 'convex/functions.ts')).replace(
        '    isolation: {\n      tables: isolatedTables,\n      sharedTables: explicitlySharedTables,\n    },',
        [
          '    isolation: {',
          '      tables: isolatedTables,',
          '      sharedTables: explicitlySharedTables,',
          '    },',
          '    destructiveOperations: {',
          "      confirmationTable: 'destructiveConfirmations' as never,",
          "      auditTable: 'destructiveAuditLog' as never,",
          '    },',
        ].join('\n'),
      ),
    )
    writeFileSync(
      resolve(appRoot, 'convex/schema.ts'),
      `${read(resolve(appRoot, 'convex/schema.ts'))
        .trimEnd()
        .replace(/\}\)\s*$/, '')},
  destructiveConfirmations: defineTable({
    tokenHash: v.string(),
    jti: v.string(),
    operationId: v.string(),
    executePath: v.string(),
    previewPath: v.string(),
    callerKey: v.string(),
    scopeKey: v.string(),
    argsHash: v.string(),
    previewHash: v.string(),
    createdAt: v.number(),
    expiresAt: v.number(),
    redeemedAt: v.optional(v.number()),
  })
    .index('by_token_hash', ['tokenHash'])
    .index('by_expires_at', ['expiresAt']),
  destructiveAuditLog: defineTable({
    operationId: v.string(),
    jti: v.string(),
    callerKey: v.string(),
    scopeKey: v.string(),
    argsHash: v.string(),
    previewHash: v.string(),
    executedAt: v.number(),
    executePath: v.string(),
  }),
})\n`,
    )

    const result = runCli(['doctor', '--json', '--cwd', appRoot], repoRoot)
    const report = JSON.parse(result.stdout) as {
      findings: Array<{ id: string; status: string; message: string }>
    }

    expect(result.status, result.stderr).toBe(1)
    expect(report.findings.find((entry) => entry.id === 'destructive-safety-schema')?.status).toBe(
      'fail',
    )
    expect(
      report.findings.find((entry) => entry.id === 'destructive-safety-schema')?.message,
    ).toContain('by_jti')
  })

  it('fails doctor when destructive-safety audit fields drift', () => {
    const cwd = createTempDir('trellis-doctor-destructive-audit-drift-')
    const initResult = runCli(
      ['init', 'doctor-app', '--template', 'workspace', '--cwd', cwd],
      repoRoot,
    )
    const appRoot = resolve(cwd, 'doctor-app')
    expect(initResult.status, `${initResult.stdout}\n${initResult.stderr}`).toBe(0)
    writeDoctorEnv(appRoot)

    writeFileSync(
      resolve(appRoot, 'convex/functions.ts'),
      read(resolve(appRoot, 'convex/functions.ts')).replace(
        '    isolation: {\n      tables: isolatedTables,\n      sharedTables: explicitlySharedTables,\n    },',
        [
          '    isolation: {',
          '      tables: isolatedTables,',
          '      sharedTables: explicitlySharedTables,',
          '    },',
          '    destructiveOperations: {',
          "      confirmationTable: 'destructiveConfirmations' as never,",
          "      auditTable: 'destructiveAuditLog' as never,",
          '    },',
        ].join('\n'),
      ),
    )
    writeFileSync(
      resolve(appRoot, 'convex/schema.ts'),
      `${read(resolve(appRoot, 'convex/schema.ts'))
        .trimEnd()
        .replace(/\}\)\s*$/, '')},
  destructiveConfirmations: defineTable({
    tokenHash: v.string(),
    jti: v.string(),
    operationId: v.string(),
    executePath: v.string(),
    previewPath: v.string(),
    callerKey: v.string(),
    scopeKey: v.string(),
    argsHash: v.string(),
    previewHash: v.string(),
    createdAt: v.number(),
    expiresAt: v.number(),
    redeemedAt: v.optional(v.number()),
  })
    .index('by_token_hash', ['tokenHash'])
    .index('by_jti', ['jti'])
    .index('by_expires_at', ['expiresAt']),
  destructiveAuditLog: defineTable({
    operationId: v.string(),
    jti: v.string(),
    callerKey: v.string(),
    scopeKey: v.string(),
    argsHash: v.string(),
    previewHash: v.string(),
    executedAt: v.number(),
  }),
})\n`,
    )

    const result = runCli(['doctor', '--json', '--cwd', appRoot], repoRoot)
    const report = JSON.parse(result.stdout) as {
      findings: Array<{ id: string; status: string; message: string }>
    }

    expect(result.status, result.stderr).toBe(1)
    expect(report.findings.find((entry) => entry.id === 'destructive-safety-schema')?.status).toBe(
      'fail',
    )
    expect(
      report.findings.find((entry) => entry.id === 'destructive-safety-schema')?.message,
    ).toContain('executePath')
  })

  it('uses exit code 2 for usage errors', () => {
    const result = runCli(['unknown-command'], repoRoot)
    const output = `${result.stdout ?? ''}\n${result.stderr ?? ''}`

    expect(result.status, output).toBe(2)
    expect(output).toContain('Error: Unknown command')
  })

  it('fails when permission composables are used without a configured permissions query', () => {
    const cwd = createTempDir('trellis-doctor-missing-permissions-')
    mkdirSync(resolve(cwd, 'pages'), { recursive: true })
    writeFileSync(
      resolve(cwd, 'package.json'),
      JSON.stringify(
        {
          name: 'doctor-missing-permissions',
          private: true,
          dependencies: {
            '@lupinum/trellis': 'workspace:*',
            convex: '^1.38.0',
            nuxt: '^4.4.5',
          },
        },
        null,
        2,
      ),
    )
    writeFileSync(
      resolve(cwd, 'nuxt.config.ts'),
      "export default defineNuxtConfig({ modules: ['@lupinum/trellis'] })\n",
    )
    mkdirSync(resolve(cwd, 'app/pages'), { recursive: true })
    writeFileSync(
      resolve(cwd, 'app/pages/index.vue'),
      '<script setup lang="ts">\nconst { can } = useAccess()\n</script>\n',
    )

    const result = runCli(['doctor', '--json', '--cwd', cwd], repoRoot)
    const report = JSON.parse(result.stdout) as {
      findings: Array<{ id: string; status: string }>
    }

    expect(result.status, result.stderr).toBe(1)
    expect(
      report.findings.find((entry) => entry.id === 'permissions-query-configured')?.status,
    ).toBe('fail')
  })

  it('fails doctor when a server call forwards caller without auth trusted', () => {
    const cwd = createTempDir('trellis-doctor-forwarded-caller-')
    const initResult = runCli(
      ['init', 'doctor-app', '--template', 'workspace', '--cwd', cwd],
      repoRoot,
    )
    const appRoot = resolve(cwd, 'doctor-app')
    expect(initResult.status, `${initResult.stdout}\n${initResult.stderr}`).toBe(0)
    writeDoctorEnv(appRoot)

    writeFileSync(
      resolve(appRoot, 'server/api/bad-forwarded-caller.post.ts'),
      `
import { serverMutation } from '@lupinum/trellis/server'
import { api } from '~/convex/_generated/api'

export default defineEventHandler(async (event) => {
  const caller = { kind: 'agent', userId: 'agent_1' }
  return await serverMutation(event, api.features.todos.domain.create, { title: 'Bad' }, { caller })
})
`.trimStart(),
    )

    const result = runCli(['doctor', '--json', '--cwd', appRoot], repoRoot)
    const report = JSON.parse(result.stdout) as {
      findings: Array<{ id: string; status: string; message: string }>
    }

    expect(result.status, result.stderr).toBe(1)
    expect(
      report.findings.find((entry) => entry.id === 'forwarded-caller-trusted-path')?.status,
    ).toBe('fail')
  })

  it('surfaces unsafe and cross-scope escape inventories without turning them into failures', () => {
    const cwd = createTempDir('trellis-doctor-inventory-')
    const initResult = runCli(
      ['init', 'doctor-app', '--template', 'workspace', '--cwd', cwd],
      repoRoot,
    )
    const appRoot = resolve(cwd, 'doctor-app')
    expect(initResult.status, `${initResult.stdout}\n${initResult.stderr}`).toBe(0)
    writeDoctorEnv(appRoot)

    writeFileSync(
      resolve(appRoot, 'convex/features/todos/domain.ts'),
      `${read(resolve(appRoot, 'convex/features/todos/domain.ts')).replace(
        "import { mutation, query } from '../../functions'",
        "import { mutation, query } from '../../functions'\nimport { unsafe } from '@lupinum/trellis/backend'",
      )}

export const publicCatalog = query.unsafe({
  permit: unsafe.permit({
    kind: 'publicCatalog',
    reason: 'Intentional public listing for doctor inventory coverage.',
    scope: ['todos'],
  }),
  args: listTodos.args,
  handler: async (ctx) => {
    const db = ctx.db.escapeIsolation({
      reason: 'Intentional cross-scope escape for doctor inventory coverage.',
    })
    return await db.query('todos').collect()
  },
})

export const uploadUrl = mutation.unsafe({
  permit: unsafe.permit({
    kind: 'preTenantUpload',
    reason: 'Generate upload URL before a tenant record exists.',
    scope: ['assets'],
    reviewBy: '2026-07-01',
  }),
  args: {},
  handler: async () => null,
})
`,
    )

    const result = runCli(['doctor', '--json', '--cwd', appRoot], repoRoot)
    const report = JSON.parse(result.stdout) as {
      findings: Array<{ id: string; status: string; message: string }>
      summary: { fail: number }
    }

    expect(result.status, result.stderr).toBe(0)
    expect(report.summary.fail).toBe(0)
    expect(report.findings.find((entry) => entry.id === 'unsafe-surface-inventory')?.status).toBe(
      'pass',
    )
    expect(
      report.findings.find((entry) => entry.id === 'unsafe-surface-inventory')?.message,
    ).toContain('convex/features/todos/domain.ts')
    expect(
      report.findings.find((entry) => entry.id === 'unsafe-surface-inventory')?.sources,
    ).toEqual([
      expect.objectContaining({
        kind: 'inventory',
        inventoryPath: 'backend.unsafeEntrypoints',
        locations: expect.arrayContaining([
          expect.objectContaining({
            path: 'convex/features/todos/domain.ts',
            line: expect.any(Number),
          }),
        ]),
      }),
    ])
    expect(report.inventory.backend.unsafeEntrypoints).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          exportName: 'publicCatalog',
          surface: 'query',
          style: 'typed-permit',
          file: 'convex/features/todos/domain.ts',
          source: expect.objectContaining({
            path: 'convex/features/todos/domain.ts',
            line: expect.any(Number),
          }),
          permit: {
            kind: 'publicCatalog',
            scopeCount: 1,
            hasReviewBy: false,
          },
        }),
        expect.objectContaining({
          exportName: 'uploadUrl',
          surface: 'mutation',
          style: 'typed-permit',
          file: 'convex/features/todos/domain.ts',
          source: expect.objectContaining({
            path: 'convex/features/todos/domain.ts',
            line: expect.any(Number),
          }),
          permit: {
            kind: 'preTenantUpload',
            scopeCount: 1,
            hasReviewBy: true,
          },
        }),
      ]),
    )
    expect(JSON.stringify(report.inventory.backend.unsafeEntrypoints)).not.toContain(
      'Intentional public listing',
    )
    expect(JSON.stringify(report.inventory.backend.unsafeEntrypoints)).not.toContain(
      'Generate upload URL',
    )
    expect(
      report.findings.find((entry) => entry.id === 'cross-scope-escape-inventory')?.status,
    ).toBe('pass')
    expect(
      report.findings.find((entry) => entry.id === 'cross-scope-escape-inventory')?.message,
    ).toContain('convex/features/todos/domain.ts')
    expect(
      report.findings.find((entry) => entry.id === 'cross-scope-escape-inventory')?.sources,
    ).toEqual([
      expect.objectContaining({
        kind: 'inventory',
        inventoryPath: 'backend.crossTenantEscapes',
        locations: [
          expect.objectContaining({
            path: 'convex/features/todos/domain.ts',
            line: expect.any(Number),
          }),
        ],
      }),
    ])
    expect(report.inventory.backend.crossTenantEscapes).toEqual([
      expect.objectContaining({
        path: 'convex/features/todos/domain.ts',
        line: expect.any(Number),
      }),
    ])
  })

  it('surfaces destructive operation inventory without turning it into a failure', () => {
    const cwd = createTempDir('trellis-doctor-destructive-inventory-')
    const initResult = runCli(
      ['init', 'doctor-app', '--template', 'workspace', '--cwd', cwd],
      repoRoot,
    )
    const appRoot = resolve(cwd, 'doctor-app')
    expect(initResult.status, `${initResult.stdout}\n${initResult.stderr}`).toBe(0)
    writeDoctorEnv(appRoot)

    writeFileSync(
      resolve(appRoot, 'convex/features/todos/operations.ts'),
      `
import { defineOperation, previewOf } from '@lupinum/trellis/backend'
import { v } from 'convex/values'
import { query } from '../../functions'

export const purgeTodoOp = defineOperation({
  id: 'todos.purge',
  kind: 'destructive',
  args: { id: v.string() },
  guard: open,
  handler: async () => null,
})

export const previewPurgeTodo = query.protected(previewOf(purgeTodoOp))
`.trimStart(),
    )

    const result = runCli(['doctor', '--json', '--cwd', appRoot], repoRoot)
    const report = JSON.parse(result.stdout) as DoctorInventoryJsonReport & {
      findings: Array<{ id: string; status: string; message: string }>
      summary: { fail: number }
    }

    expect(result.status, result.stderr).toBe(0)
    expect(report.summary.fail).toBe(0)
    expect(
      report.findings.find((entry) => entry.id === 'destructive-operation-inventory')?.status,
    ).toBe('pass')
    expect(
      report.findings.find((entry) => entry.id === 'destructive-operation-inventory')?.message,
    ).toContain('convex/features/todos/operations.ts')
    expect(report.inventory.backend.destructiveOperations).toEqual([
      expect.objectContaining({
        path: 'convex/features/todos/operations.ts',
        line: expect.any(Number),
      }),
    ])
    expect(report.inventory.publicSurface.operations).toEqual([
      expect.objectContaining({
        id: 'todos.purge',
        exportName: 'purgeTodoOp',
        kind: 'destructive',
        source: expect.objectContaining({
          path: 'convex/features/todos/operations.ts',
          line: expect.any(Number),
        }),
      }),
    ])
    expect(report.findings.find((entry) => entry.id === 'operation-tool-agreement')?.status).toBe(
      'pass',
    )
  })

  it('warns when MCP is enabled and destructive operations have no operation-backed tool', () => {
    const cwd = createTempDir('trellis-doctor-operation-tool-drift-')
    const initResult = runCli(
      ['init', 'doctor-app', '--template', 'workspace-mcp', '--cwd', cwd],
      repoRoot,
    )
    const appRoot = resolve(cwd, 'doctor-app')
    expect(initResult.status, `${initResult.stdout}\n${initResult.stderr}`).toBe(0)
    writeDoctorEnv(appRoot)
    appendDoctorEnv(appRoot, [
      'CONVEX_IDENTITY_FORWARDING_KEY=this-is-a-long-random-identity-forwarding-key',
    ])

    writeFileSync(
      resolve(appRoot, 'convex/features/todos/operations.ts'),
      `
import { defineOperation, previewOf } from '@lupinum/trellis/backend'
import { v } from 'convex/values'
import { query } from '../../functions'

export const purgeTodoOp = defineOperation({
  id: 'todos.purge',
  kind: 'destructive',
  args: { id: v.string() },
  guard: open,
  handler: async () => null,
})

export const previewPurgeTodo = query.protected(previewOf(purgeTodoOp))
`.trimStart(),
    )

    const result = runCli(['doctor', '--json', '--cwd', appRoot], repoRoot)
    const report = JSON.parse(result.stdout) as DoctorInventoryJsonReport & {
      findings: Array<{ id: string; status: string; message: string }>
      summary: { fail: number; warn: number }
    }

    expect(result.status, result.stderr).toBe(0)
    expect(report.summary.fail).toBe(0)
    expect(report.findings.find((entry) => entry.id === 'operation-tool-agreement')).toMatchObject({
      status: 'warn',
      message: expect.stringContaining('no operation-backed MCP tools'),
      sources: expect.arrayContaining([
        expect.objectContaining({
          kind: 'inventory',
          inventoryPath: 'publicSurface.operations',
          locations: [
            expect.objectContaining({
              path: 'convex/features/todos/operations.ts',
              line: expect.any(Number),
            }),
          ],
        }),
        expect.objectContaining({
          kind: 'inventory',
          inventoryPath: 'publicSurface.tools',
        }),
      ]),
    })
  })

  it('passes operation/tool agreement when an operation-backed MCP tool exists', () => {
    const cwd = createTempDir('trellis-doctor-operation-tool-agreement-')
    const initResult = runCli(
      ['init', 'doctor-app', '--template', 'workspace-mcp', '--cwd', cwd],
      repoRoot,
    )
    const appRoot = resolve(cwd, 'doctor-app')
    expect(initResult.status, `${initResult.stdout}\n${initResult.stderr}`).toBe(0)
    writeDoctorEnv(appRoot)
    appendDoctorEnv(appRoot, [
      'CONVEX_IDENTITY_FORWARDING_KEY=this-is-a-long-random-identity-forwarding-key',
    ])

    writeFileSync(
      resolve(appRoot, 'convex/features/todos/operations.ts'),
      `
import { defineOperation, previewOf } from '@lupinum/trellis/backend'
import { v } from 'convex/values'
import { query } from '../../functions'

export const purgeTodoOp = defineOperation({
  id: 'todos.purge',
  kind: 'destructive',
  args: { id: v.string() },
  guard: open,
  handler: async () => null,
})

export const previewPurgeTodo = query.protected(previewOf(purgeTodoOp))
`.trimStart(),
    )
    writeFileSync(
      resolve(appRoot, 'server/mcp/tools/delete-todo.ts'),
      `
import { purgeTodoOp } from '~~/convex/features/todos/operations'
import { tool } from '../runtime'

export default tool.operation(purgeTodoOp, {
  name: 'delete-todo',
})
`.trimStart(),
    )

    const result = runCli(['doctor', '--json', '--cwd', appRoot], repoRoot)
    const report = JSON.parse(result.stdout) as DoctorInventoryJsonReport & {
      findings: Array<{ id: string; status: string; message: string }>
      summary: { fail: number; warn: number }
    }

    expect(result.status, result.stderr).toBe(0)
    expect(report.summary.fail).toBe(0)
    expect(report.inventory.publicSurface.tools).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'delete-todo',
          source: 'operation',
          operationId: 'todos.purge',
          sourceLocation: expect.objectContaining({
            path: 'server/mcp/tools/delete-todo.ts',
            line: expect.any(Number),
          }),
        }),
      ]),
    )
    expect(report.findings.find((entry) => entry.id === 'operation-tool-agreement')).toMatchObject({
      status: 'pass',
      message: expect.stringContaining('operation-backed MCP tool'),
    })
  })

  it('fails doctor when a destructive MCP tool skips tool.operation', () => {
    const cwd = createTempDir('trellis-doctor-mcp-operation-binding-')
    const initResult = runCli(
      ['init', 'doctor-app', '--template', 'workspace', '--mcp', '--cwd', cwd],
      repoRoot,
    )
    const appRoot = resolve(cwd, 'doctor-app')
    expect(initResult.status, `${initResult.stdout}\n${initResult.stderr}`).toBe(0)
    writeDoctorEnv(appRoot)

    writeFileSync(
      resolve(appRoot, 'server/mcp/tools/delete-todo.ts'),
      `
import { api } from '~/convex/_generated/api'
import { todoDelete } from '~/convex/features/todos'

export default tool.mutation({
  permission: todoDelete,
  call: api.features.todos.domain.remove,
  meta: { name: 'delete-todo' },
})
`.trimStart(),
    )

    const result = runCli(['doctor', '--json', '--cwd', appRoot], repoRoot)
    const report = JSON.parse(result.stdout) as {
      findings: Array<{
        id: string
        status: string
        message: string
        sources?: FindingSourceJson[]
      }>
    }

    expect(result.status, result.stderr).toBe(1)
    expect(
      report.findings.find((entry) => entry.id === 'mcp-destructive-operation-binding')?.status,
    ).toBe('fail')
    expect(report.inventory.mcp.destructiveToolMisuses).toEqual([
      expect.objectContaining({
        path: 'server/mcp/tools/delete-todo.ts',
        line: expect.any(Number),
      }),
    ])
    expect(
      report.findings.find((entry) => entry.id === 'mcp-destructive-operation-binding')?.message,
    ).toContain('server/mcp/tools/delete-todo.ts')
    expect(
      report.findings.find((entry) => entry.id === 'mcp-destructive-operation-binding')?.sources,
    ).toEqual([
      expect.objectContaining({
        kind: 'inventory',
        inventoryPath: 'mcp.destructiveToolMisuses',
        locations: [
          expect.objectContaining({
            path: 'server/mcp/tools/delete-todo.ts',
            line: expect.any(Number),
          }),
        ],
      }),
    ])
  })

  it('fails doctor when a standalone custom MCP tool calls Convex writes', () => {
    const cwd = createTempDir('trellis-doctor-mcp-custom-app-write-')
    const initResult = runCli(
      ['init', 'doctor-app', '--template', 'workspace', '--mcp', '--cwd', cwd],
      repoRoot,
    )
    const appRoot = resolve(cwd, 'doctor-app')
    expect(initResult.status, `${initResult.stdout}\n${initResult.stderr}`).toBe(0)
    writeDoctorEnv(appRoot)

    writeFileSync(
      resolve(appRoot, 'server/mcp/tools/create-todo.ts'),
      `
import { defineTool } from '@lupinum/trellis/mcp/advanced'
import { api } from '~/convex/_generated/api'
import { createTodo } from '~/shared/features/todos/contract'

export default defineTool({
  schema: createTodo,
  effect: 'diagnostic',
  handler: async (args, ctx) => {
    return await ctx.mutation(api.features.todos.domain.create, args)
  },
})
`.trimStart(),
    )

    const result = runCli(['doctor', '--json', '--cwd', appRoot], repoRoot)
    const report = JSON.parse(result.stdout) as DoctorInventoryJsonReport & {
      findings: Array<{ id: string; status: string; message: string }>
    }

    expect(result.status, result.stderr).toBe(1)
    expect(
      report.findings.find((entry) => entry.id === 'mcp-custom-app-write-bypass')?.status,
    ).toBe('fail')
    expect(report.inventory.mcp.customAppWriteMisuses).toEqual([
      expect.objectContaining({
        path: 'server/mcp/tools/create-todo.ts',
        line: expect.any(Number),
      }),
    ])
    expect(
      report.findings.find((entry) => entry.id === 'mcp-custom-app-write-bypass')?.message,
    ).toContain('server/mcp/tools/create-todo.ts')
    expect(
      report.findings.find((entry) => entry.id === 'mcp-custom-app-write-bypass')?.sources,
    ).toEqual([
      expect.objectContaining({
        kind: 'inventory',
        inventoryPath: 'mcp.customAppWriteMisuses',
        locations: [
          expect.objectContaining({
            path: 'server/mcp/tools/create-todo.ts',
            line: expect.any(Number),
          }),
        ],
      }),
    ])
  })
})
