#!/usr/bin/env node

import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { supportedDependencyTuple } from './supported-dependency-tuple.mjs'

const root = resolve(fileURLToPath(new URL('..', import.meta.url)))
const manifestPath = join(root, 'test/mutations/reviewed-mutants.json')
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
const timeoutMs = 15 * 60 * 1_000

function fail(message) {
  throw new Error(`[auth-mutations] ${message}`)
}

function validateManifest(value) {
  if (!value || typeof value !== 'object' || value.schemaVersion !== 1) {
    fail('reviewed-mutants.json must use schemaVersion 1')
  }
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(value.reviewedAt)) {
    fail('reviewed-mutants.json must record an ISO review date')
  }
  if (!Array.isArray(value.mutants) || value.mutants.length === 0) {
    fail('reviewed-mutants.json must declare at least one fixed mutant')
  }

  const ids = new Set()
  for (const [index, mutant] of value.mutants.entries()) {
    if (!mutant || typeof mutant !== 'object') fail(`mutants[${index}] must be an object`)
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(mutant.id)) {
      fail(`mutants[${index}].id is invalid`)
    }
    if (ids.has(mutant.id)) fail(`duplicate reviewed mutant ${mutant.id}`)
    ids.add(mutant.id)
    if (!['node', 'convex'].includes(mutant.project)) {
      fail(`${mutant.id} has unsupported project ${String(mutant.project)}`)
    }
    if (typeof mutant.invariant !== 'string' || mutant.invariant.length < 20) {
      fail(`${mutant.id} must explain the security invariant it removes`)
    }
    const keys = Object.keys(mutant).sort().join(',')
    if (keys !== 'id,invariant,project') fail(`${mutant.id} has unreviewed manifest fields`)
  }
  return ids
}

function redact(value) {
  return String(value)
    .replace(/Basic\s+[\w+/=-]+/giu, 'Basic [REDACTED]')
    .replace(/Bearer\s+[\w.~-]+/giu, 'Bearer [REDACTED]')
    .replace(/(client_secret|code|token|authorization)=[^&\s]+/giu, '$1=[REDACTED]')
    .slice(0, 4_000)
}

function assertions(report) {
  return (report.testResults ?? []).flatMap((result) => result.assertionResults ?? [])
}

const expectedIds = validateManifest(manifest)
const temporaryDirectory = mkdtempSync(join(tmpdir(), 'bcn-auth-mutations-'))
const reportPath = join(temporaryDirectory, 'vitest.json')

try {
  process.stdout.write(
    `[auth-mutations] tuple=${JSON.stringify(supportedDependencyTuple)} backend=isolated-node-and-convex-test-fixtures mutants=${expectedIds.size}\n`,
  )
  const result = spawnSync(
    'pnpm',
    [
      'exec',
      'vitest',
      'run',
      '--project=auth-mutations',
      '--project=auth-mutations-convex',
      '--reporter=json',
      `--outputFile=${reportPath}`,
    ],
    {
      cwd: root,
      encoding: 'utf8',
      env: { ...process.env, NO_COLOR: '1' },
      maxBuffer: 20 * 1024 * 1024,
      timeout: timeoutMs,
    },
  )

  if (result.error) fail(`Vitest could not complete: ${redact(result.error.message)}`)
  let report
  try {
    report = JSON.parse(readFileSync(reportPath, 'utf8'))
  } catch (error) {
    fail(
      `Vitest did not emit a readable mutation report: ${redact(error instanceof Error ? error.message : error)}`,
    )
  }

  const executed = new Map()
  for (const assertion of assertions(report)) {
    const match = /(?:^|\s)MUTANT::([a-z0-9]+(?:-[a-z0-9]+)*)$/u.exec(assertion.fullName)
    if (!match) continue
    const id = match[1]
    if (!expectedIds.has(id)) fail(`test executed undeclared mutant ${id}`)
    if (executed.has(id)) fail(`mutant ${id} executed more than once`)
    executed.set(id, assertion)
  }

  const missing = [...expectedIds].filter((id) => !executed.has(id))
  if (missing.length > 0) fail(`declared mutants did not execute: ${missing.join(', ')}`)

  const survivors = [...executed.entries()].filter(([, assertion]) => assertion.status !== 'passed')
  if (result.status !== 0 || report.success !== true || survivors.length > 0) {
    for (const [id, assertion] of survivors) {
      process.stderr.write(
        `[auth-mutations] SURVIVED ${id}: ${redact(assertion.failureMessages?.join('\n') || assertion.status)}\n`,
      )
    }
    const suiteFailures = (report.testResults ?? []).filter((suite) => suite.status === 'failed')
    for (const suite of suiteFailures) {
      process.stderr.write(
        `[auth-mutations] FAILED ${suite.name}: ${redact(suite.message || 'suite setup failed')}\n`,
      )
    }
    fail(`${survivors.length} reviewed mutant(s) survived; Vitest exit=${String(result.status)}`)
  }

  process.stdout.write(
    `[auth-mutations] ${executed.size}/${expectedIds.size} reviewed mutants killed\n`,
  )
} finally {
  rmSync(temporaryDirectory, { force: true, recursive: true })
}
