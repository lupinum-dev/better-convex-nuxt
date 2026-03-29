import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
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
    if (existsSync(cliEntry)) return

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
    expect(output).toContain('better-convex-nuxt')
    expect(output).toContain('doctor')
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
})
