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
    expect(output).toContain('bridge')
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
    expect(runtime).not.toContain('resolveDelegation')
    expect(runtime).not.toContain('actor: { userId: principal.userId }')
    expect(runtime).not.toContain('principal.userId')
    const actor = read(resolve(appRoot, 'convex/auth/actor.ts'))
    expect(actor).toContain('getSubjectValue')
    expect(actor).toContain("getSubjectValue(delegation?.subject, 'user')")
    expect(actor).not.toContain("delegation.subject.startsWith('user:')")
    expect(read(resolve(appRoot, 'server/middleware/mcp-auth.ts'))).toContain(
      "serverConvexQuery(event, api.features.mcpKeys.domain.validate, { hash }, { auth: 'none' })",
    )
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
    expect(read(resolve(appRoot, 'convex/features/files/domain.ts'))).toContain('generateUploadUrl')
    expect(read(resolve(appRoot, 'pages/uploads.vue'))).toContain('UploadsStarterPage')

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
    expect(result.stdout).toBe(stripVTControlCharacters(result.stdout))
  })

  it('fails doctor when trusted-forwarding surfaces use a placeholder key', () => {
    const cwd = createTempDir('trellis-doctor-trusted-forwarding-placeholder-')
    const initResult = runCli(
      ['init', 'doctor-trusted-app', '--template', 'workspace', '--mcp', '--cwd', cwd],
      repoRoot,
    )
    const appRoot = resolve(cwd, 'doctor-trusted-app')
    expect(initResult.status, `${initResult.stdout}\n${initResult.stderr}`).toBe(0)
    writeDoctorEnv(appRoot)
    appendDoctorEnv(appRoot, [
      'CONVEX_TRUSTED_FORWARDING_KEY=replace-me-with-a-long-random-shared-secret',
    ])

    const result = runCli(['doctor', '--json', '--cwd', appRoot], repoRoot)
    const report = JSON.parse(result.stdout) as {
      findings: Array<{ id: string; status: string; message: string }>
      summary: { fail: number }
    }

    expect(result.status, result.stderr).toBe(1)
    expect(report.summary.fail).toBeGreaterThan(0)
    expect(
      report.findings.find((entry) => entry.id === 'trusted-forwarding-key-strength')?.status,
    ).toBe('fail')
    expect(
      report.findings.find((entry) => entry.id === 'trusted-forwarding-key-strength')?.message,
    ).toMatch(/placeholder value/i)
  })

  it('fails doctor when the trusted-forwarding key is exposed through a public env name', () => {
    const cwd = createTempDir('trellis-doctor-trusted-forwarding-public-exposure-')
    const initResult = runCli(
      ['init', 'doctor-trusted-app', '--template', 'workspace', '--mcp', '--cwd', cwd],
      repoRoot,
    )
    const appRoot = resolve(cwd, 'doctor-trusted-app')
    expect(initResult.status, `${initResult.stdout}\n${initResult.stderr}`).toBe(0)
    writeDoctorEnv(appRoot)
    appendDoctorEnv(appRoot, [
      'CONVEX_TRUSTED_FORWARDING_KEY=this-is-a-long-random-trusted-forwarding-key',
      'NUXT_PUBLIC_CONVEX_TRUSTED_FORWARDING_KEY=this-should-not-be-public',
    ])

    const result = runCli(['doctor', '--json', '--cwd', appRoot], repoRoot)
    const report = JSON.parse(result.stdout) as {
      findings: Array<{ id: string; status: string; message: string }>
      summary: { fail: number }
    }

    expect(result.status, result.stderr).toBe(1)
    expect(report.summary.fail).toBeGreaterThan(0)
    expect(
      report.findings.find((entry) => entry.id === 'trusted-forwarding-key-public-exposure')
        ?.status,
    ).toBe('fail')
    expect(
      report.findings.find((entry) => entry.id === 'trusted-forwarding-key-public-exposure')
        ?.message,
    ).toMatch(/public-facing code or env sources/i)
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
    const report = JSON.parse(result.stdout) as {
      findings: Array<{ id: string; status: string; message: string }>
      summary: { fail: number; warn: number }
    }

    expect(result.status, result.stderr).toBe(1)
    expect(report.summary.fail).toBeGreaterThan(0)
    expect(report.findings.find((entry) => entry.id === 'mcp-rate-limit-store')?.status).toBe(
      'fail',
    )
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
          'export const mcpRuntime = defineMcpApp<WorkspacePrincipal>({',
          'export const mcpRuntime = defineMcpApp<WorkspacePrincipal>({\n  rateLimitStore: createRedisMcpRateLimitStore({ client: { eval: async () => 1 } as never }),',
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
          'export const mcpRuntime = defineMcpApp<WorkspacePrincipal>({',
          'export const mcpRuntime = defineMcpApp<WorkspacePrincipal>({\n  rateLimitStore,',
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
        'export const mcpRuntime = defineMcpApp<WorkspacePrincipal>({',
        'export const mcpRuntime = defineMcpApp<WorkspacePrincipal>({\n  rateLimitStore: {} as never,',
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
      findings: Array<{ id: string; status: string; message: string }>
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
    const report = JSON.parse(result.stdout) as {
      findings: Array<{ id: string; status: string; message: string }>
    }

    expect(result.status, result.stderr).toBe(1)
    expect(
      report.findings.find((entry) => entry.id === 'tenant-isolation-table-coverage')?.status,
    ).toBe('fail')
    expect(
      report.findings.find((entry) => entry.id === 'tenant-isolation-table-coverage')?.message,
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
        '    tenantIsolation: {\n      tables: isolatedTables,\n      globalTables: explicitlyGlobalTables,\n    },',
        [
          '    tenantIsolation: {',
          '      tables: isolatedTables,',
          '      globalTables: explicitlyGlobalTables,',
          '    },',
          '    destructiveSafety: {',
          "      redemptionTable: 'destructiveRedemptions' as never,",
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
  destructiveRedemptions: defineTable({
    jti: v.string(),
    operationId: v.string(),
    principalKey: v.string(),
    tenantKey: v.string(),
    redeemedAt: v.number(),
  }),
  destructiveAuditLog: defineTable({
    operationId: v.string(),
    jti: v.string(),
    principalKey: v.string(),
    tenantKey: v.string(),
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
            convex: '^1.34.1',
            nuxt: '^4.4.2',
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
      '<script setup lang="ts">\nconst { allows } = usePermissions()\n</script>\n',
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

  it('fails doctor when a server call forwards principal without auth trusted', () => {
    const cwd = createTempDir('trellis-doctor-forwarded-principal-')
    const initResult = runCli(
      ['init', 'doctor-app', '--template', 'workspace', '--cwd', cwd],
      repoRoot,
    )
    const appRoot = resolve(cwd, 'doctor-app')
    expect(initResult.status, `${initResult.stdout}\n${initResult.stderr}`).toBe(0)
    writeDoctorEnv(appRoot)

    writeFileSync(
      resolve(appRoot, 'server/api/bad-forwarded-principal.post.ts'),
      `
import { serverMutation } from '@lupinum/trellis/server'
import { api } from '~/convex/_generated/api'

export default defineEventHandler(async (event) => {
  const principal = { kind: 'agent', userId: 'agent_1' }
  return await serverMutation(event, api.features.todos.domain.create, { title: 'Bad' }, { principal })
})
`.trimStart(),
    )

    const result = runCli(['doctor', '--json', '--cwd', appRoot], repoRoot)
    const report = JSON.parse(result.stdout) as {
      findings: Array<{ id: string; status: string; message: string }>
    }

    expect(result.status, result.stderr).toBe(1)
    expect(
      report.findings.find((entry) => entry.id === 'forwarded-principal-trusted-path')?.status,
    ).toBe('fail')
  })

  it('surfaces unsafe and cross-tenant escape inventories without turning them into failures', () => {
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
        "import { mutation, query, unsafe } from '../../functions'",
      )}

export const publicCatalog = unsafe.query({
  bypass: 'Intentional public listing for doctor inventory coverage.',
  args: listTodos.args,
  handler: async (ctx) => {
    const db = ctx.db.escapeTenantIsolation({
      reason: 'Intentional cross-tenant escape for doctor inventory coverage.',
    })
    return await db.query('todos').collect()
  },
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
      report.findings.find((entry) => entry.id === 'cross-tenant-escape-inventory')?.status,
    ).toBe('pass')
    expect(
      report.findings.find((entry) => entry.id === 'cross-tenant-escape-inventory')?.message,
    ).toContain('convex/features/todos/domain.ts')
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
import { defineOperation } from '@lupinum/trellis/functions'
import { v } from 'convex/values'

export const purgeTodoOp = defineOperation({
  id: 'todos.purge',
  kind: 'destructive',
  args: { id: v.string() },
  guard: open,
  handler: async () => null,
})
`.trimStart(),
    )

    const result = runCli(['doctor', '--json', '--cwd', appRoot], repoRoot)
    const report = JSON.parse(result.stdout) as {
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
  })

  it('fails doctor when a destructive MCP tool skips tool.fromOperation', () => {
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

export default tool({
  permission: todoDelete,
  call: api.features.todos.domain.remove,
  meta: { name: 'delete-todo' },
})
`.trimStart(),
    )

    const result = runCli(['doctor', '--json', '--cwd', appRoot], repoRoot)
    const report = JSON.parse(result.stdout) as {
      findings: Array<{ id: string; status: string; message: string }>
    }

    expect(result.status, result.stderr).toBe(1)
    expect(
      report.findings.find((entry) => entry.id === 'mcp-destructive-operation-binding')?.status,
    ).toBe('fail')
  })
})
