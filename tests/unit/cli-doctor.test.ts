import { spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { stripVTControlCharacters } from 'node:util'

import { beforeAll, describe, expect, it } from 'vitest'

const repoRoot = process.cwd()
const cliEntry = resolve(repoRoot, 'dist/cli.mjs')
const canonicalPaths = [
  'convex/auth.ts',
  'convex/auth.config.ts',
  'convex/convex.config.ts',
  'convex/functions.ts',
  'convex/http.ts',
  'convex/schema.ts',
  'convex/auth',
  'convex/domain',
  'convex/operations',
  'convex/permissions',
  'shared/schemas',
  'pages',
  'server/api',
  'server/mcp',
] as const

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

function expectCanonicalLayout(appRoot: string) {
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
  }, 30_000)

  it('renders the cutover help surface', () => {
    const result = runCli(['--help'], repoRoot)
    const output = `${result.stdout ?? ''}\n${result.stderr ?? ''}`

    expect(result.status, output).toBe(0)
    expect(output).toContain('@lupinum/trellis')
    expect(output).toContain('add')
    expect(output).toContain('doctor')
    expect(output).toContain('init')
    expect(output).not.toContain('bridge')
    expect(output).toContain('USAGE')
  })

  it('initializes a personal app in a named target directory with the canonical layout', () => {
    const cwd = createTempDir('trellis-init-personal-')
    const result = runCli(
      ['init', 'demo-personal', '--template', 'personal', '--cwd', cwd],
      repoRoot,
    )
    const appRoot = resolve(cwd, 'demo-personal')

    expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0)
    expectCanonicalLayout(appRoot)
    expect(read(resolve(appRoot, 'package.json'))).toContain('"name": "demo-personal"')
    expect(read(resolve(appRoot, 'pages/index.vue'))).toContain('Personal Starter')
    expect(read(resolve(appRoot, 'README.md'))).toContain('demo-personal')
  })

  it('initializes a workspace app with MCP via --mcp', () => {
    const cwd = createTempDir('trellis-init-workspace-mcp-')
    const result = runCli(
      ['init', 'demo-workspace', '--template', 'workspace', '--mcp', '--cwd', cwd],
      repoRoot,
    )
    const appRoot = resolve(cwd, 'demo-workspace')

    expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0)
    expectCanonicalLayout(appRoot)
    expect(read(resolve(appRoot, 'nuxt.config.ts'))).toContain(
      "mcp: { name: 'demo-workspace', sessions: true }",
    )
    expect(read(resolve(appRoot, 'convex/schema.ts'))).toContain('mcpKeys: defineTable')
    expect(read(resolve(appRoot, 'server/mcp/index.ts'))).toContain('defineMcpHandler')
    const runtime = read(resolve(appRoot, 'server/mcp/runtime.ts'))
    expect(runtime).toContain("auth: 'trusted'")
    expect(runtime).toContain('resolveDelegation')
    expect(runtime).not.toContain('actor: { userId: principal.userId }')
    expect(runtime).not.toContain('principal.userId')
    const actor = read(resolve(appRoot, 'convex/auth/actor.ts'))
    expect(actor).toContain('getSubjectValue')
    expect(actor).toContain("getSubjectValue(delegation?.subject, 'user')")
    expect(actor).not.toContain("delegation.subject.startsWith('user:')")
    expect(read(resolve(appRoot, 'server/middleware/mcp-auth.ts'))).toContain(
      'serverConvexQuery(event, api.domain.mcpKeys.validate, { hash }, { auth: \'none\' })',
    )
  })

  it('adds MCP to an existing workspace app', () => {
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
    expect(read(resolve(appRoot, 'convex/domain/files.ts'))).toContain('generateUploadUrl')
    expect(read(resolve(appRoot, 'pages/uploads.vue'))).toContain('Uploads Starter')

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

  it('fails doctor when the canonical layout drifts', () => {
    const cwd = createTempDir('trellis-doctor-layout-drift-')
    const initResult = runCli(
      ['init', 'doctor-app', '--template', 'workspace', '--cwd', cwd],
      repoRoot,
    )
    const appRoot = resolve(cwd, 'doctor-app')
    expect(initResult.status, `${initResult.stdout}\n${initResult.stderr}`).toBe(0)
    writeDoctorEnv(appRoot)
    rmSync(resolve(appRoot, 'convex/domain'), { recursive: true, force: true })

    const result = runCli(['doctor', '--json', '--cwd', appRoot], repoRoot)
    const report = JSON.parse(result.stdout) as {
      findings: Array<{ id: string; status: string; message: string }>
      summary: { fail: number }
    }
    const finding = report.findings.find((entry) => entry.id === 'canonical-layout')

    expect(result.status, result.stderr).toBe(1)
    expect(report.summary.fail).toBeGreaterThan(0)
    expect(finding?.status).toBe('fail')
    expect(finding?.message).toContain('convex/domain')
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
    writeFileSync(
      resolve(cwd, 'pages/index.vue'),
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
  return await serverMutation(event, api.domain.todos.create, { title: 'Bad' }, { principal })
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
import { todoDelete } from '~/convex/auth/permissions'

export default tool({
  permission: todoDelete,
  call: api.domain.todos.remove,
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
