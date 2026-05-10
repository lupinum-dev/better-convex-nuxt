#!/usr/bin/env node
import { spawnSync } from 'node:child_process'
import {
  existsSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const cliPath = resolve(repoRoot, 'dist/cli.mjs')
const fixtureRoot = resolve(repoRoot, 'src/cli/starter-fixtures')
const templates = ['public', 'personal', 'workspace', 'workspace-mcp']

if (!existsSync(cliPath)) {
  console.error('Missing dist/cli.mjs. Run `pnpm run build:cli` before starter validation.')
  process.exit(1)
}

function toManifestPath(path) {
  return path.split(sep).join('/')
}

function matchesPattern(path, pattern) {
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

function matchesAny(path, patterns) {
  return patterns.some((pattern) => matchesPattern(path, pattern))
}

function includeSearchRoots(patterns) {
  const roots = new Set()
  for (const pattern of patterns) {
    const wildcardIndex = pattern.indexOf('*')
    if (wildcardIndex === -1) {
      const slashIndex = pattern.lastIndexOf('/')
      roots.add(slashIndex === -1 ? pattern : pattern.slice(0, slashIndex))
      continue
    }

    const prefix = pattern.slice(0, wildcardIndex).replace(/\/+$/u, '')
    roots.add(prefix || '.')
  }
  return [...roots]
}

function collectFiles(rootDir, searchRoot = '.') {
  const absoluteRoot = resolve(rootDir, searchRoot)
  if (!existsSync(absoluteRoot)) return []
  const stats = statSync(absoluteRoot)
  if (stats.isFile()) return [toManifestPath(searchRoot)]
  if (!stats.isDirectory()) return []

  const files = []
  const walk = (directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const absolutePath = join(directory, entry.name)
      if (entry.isDirectory()) {
        walk(absolutePath)
        continue
      }
      if (!entry.isFile()) continue
      files.push(toManifestPath(relative(rootDir, absolutePath)))
    }
  }
  walk(absoluteRoot)
  return files
}

function expectedFixturePaths(template) {
  const root = resolve(fixtureRoot, template)
  const manifest = JSON.parse(readFileSync(resolve(root, 'starter.manifest.json'), 'utf8'))
  const selected = new Set()

  for (const searchRoot of includeSearchRoots(manifest.include)) {
    for (const path of collectFiles(root, searchRoot)) {
      if (!matchesAny(path, manifest.include)) continue
      if (matchesAny(path, manifest.exclude)) continue
      selected.add(path)
    }
  }

  for (const generated of manifest.generated ?? []) {
    if (!matchesAny(generated.path, manifest.include)) continue
    if (matchesAny(generated.path, manifest.exclude)) continue
    selected.add(generated.path)
  }

  return [...selected].sort((left, right) => left.localeCompare(right))
}

function runCli(args, options = {}) {
  const result = spawnSync(process.execPath, [cliPath, ...args], {
    cwd: repoRoot,
    encoding: 'utf8',
    env: {
      ...process.env,
      NO_COLOR: '1',
      NUXT_TELEMETRY_DISABLED: '1',
    },
    ...options,
  })
  return {
    status: result.status ?? 1,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
  }
}

function parseJson(output, context) {
  try {
    return JSON.parse(output)
  } catch (error) {
    throw new Error(`Unable to parse ${context} JSON: ${error.message}\n${output}`)
  }
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message)
  }
}

function assertSameSet(actual, expected, label) {
  const actualSet = new Set(actual)
  const expectedSet = new Set(expected)
  const missing = expected.filter((path) => !actualSet.has(path))
  const unexpected = actual.filter((path) => !expectedSet.has(path))

  assert(
    missing.length === 0 && unexpected.length === 0,
    [
      `${label} mismatch.`,
      missing.length > 0 ? `Missing: ${missing.join(', ')}` : '',
      unexpected.length > 0 ? `Unexpected: ${unexpected.join(', ')}` : '',
    ]
      .filter(Boolean)
      .join('\n'),
  )
}

function readGeneratedText(appRoot, files) {
  return files
    .map((path) => readFileSync(resolve(appRoot, path), 'utf8'))
    .join('\n')
    .toLowerCase()
}

function assertLayerBoundaries(template, appRoot, expectedFiles) {
  const text = readGeneratedText(
    appRoot,
    expectedFiles.filter((path) => !path.endsWith('.gitkeep')),
  )

  const legacyTemplateExtension = ['.', 'tpl'].join('')
  assert(
    !text.includes(legacyTemplateExtension),
    `${template} output contains old template-file reference.`,
  )
  assert(!text.includes('ginko'), `${template} output contains Ginko starter language.`)
  assert(!text.includes('cms'), `${template} output contains CMS starter language.`)

  if (template === 'public') {
    assert(!text.includes('@convex-dev/better-auth'), 'public starter leaked auth dependency.')
    assert(!text.includes('@nuxtjs/mcp-toolkit'), 'public starter leaked MCP dependency.')
    assert(!text.includes('definemcpapp'), 'public starter leaked MCP runtime.')
    assert(!text.includes('workspaceid'), 'public starter leaked workspace tenant concepts.')
    return
  }

  if (template === 'personal') {
    assert(text.includes('@convex-dev/better-auth'), 'personal starter is missing auth dependency.')
    assert(!text.includes('@nuxtjs/mcp-toolkit'), 'personal starter leaked MCP dependency.')
    assert(!text.includes('definemcpapp'), 'personal starter leaked MCP runtime.')
    assert(!text.includes('workspaceid'), 'personal starter leaked workspace tenant concepts.')
    return
  }

  if (template === 'workspace') {
    assert(
      text.includes('@convex-dev/better-auth'),
      'workspace starter is missing auth dependency.',
    )
    assert(text.includes('workspaceid'), 'workspace starter is missing workspace tenant concepts.')
    assert(!text.includes('@nuxtjs/mcp-toolkit'), 'workspace starter leaked MCP dependency.')
    assert(!text.includes('definemcpapp'), 'workspace starter leaked MCP runtime.')
    assert(!text.includes('mcp.tool'), 'workspace starter leaked MCP tool concepts.')
    return
  }

  assert(
    text.includes('@convex-dev/better-auth'),
    'workspace-mcp starter is missing auth dependency.',
  )
  assert(text.includes('@nuxtjs/mcp-toolkit'), 'workspace-mcp starter is missing MCP dependency.')
  assert(text.includes('definemcpapp'), 'workspace-mcp starter is missing MCP runtime.')
  assert(
    text.includes('workspaceid'),
    'workspace-mcp starter is missing workspace tenant concepts.',
  )
}

function writeDoctorEnv(appRoot, template) {
  const lines = [
    'CONVEX_URL=https://doctor-valid.convex.cloud',
    'CONVEX_SITE_URL=https://doctor-valid.convex.site',
    'SITE_URL=http://localhost:3000',
    'BETTER_AUTH_SECRET=test-secret-for-starter-fixture-validation',
  ]

  if (template === 'workspace-mcp') {
    lines.push(
      'CONVEX_TRUSTED_FORWARDING_KEY=starter-fixture-validation-trusted-forwarding-key-0123456789',
      'TRELLIS_MCP_CONFIRMATION_KEY=starter-fixture-validation-confirmation-key-0123456789',
    )
  }

  writeFileSync(resolve(appRoot, '.env.local'), `${lines.join('\n')}\n`)
}

function assertDoctorPass(template, appRoot) {
  const result = runCli(['doctor', '--json', '--cwd', appRoot])
  assert(
    result.status === 0,
    `${template} doctor failed.\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`,
  )

  const report = parseJson(result.stdout, `${template} doctor`)
  const unexpected = report.findings.filter((finding) => finding.status !== 'pass')
  assert(
    unexpected.length === 0,
    `${template} doctor returned unexpected findings: ${unexpected
      .map((finding) => `${finding.id}:${finding.status}`)
      .join(', ')}`,
  )
  return report.summary
}

const tempRoot = mkdtempSync(resolve(tmpdir(), 'trellis-starter-fixtures-'))
const summaries = []

try {
  for (const template of templates) {
    const initRoot = resolve(tempRoot, template)
    const result = runCli([
      'init',
      `demo-${template}`,
      '--template',
      template,
      '--cwd',
      initRoot,
      '--json',
    ])
    assert(
      result.status === 0,
      `${template} init failed.\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`,
    )

    const initReport = parseJson(result.stdout, `${template} init`)
    const appRoot = resolve(initRoot, `demo-${template}`)
    const expectedFiles = expectedFixturePaths(template)
    const actualFiles = collectFiles(appRoot)
      .filter((path) => path !== '.env.local')
      .sort()

    assertSameSet(actualFiles, expectedFiles, `${template} generated file set`)
    assertSameSet(initReport.written.sort(), expectedFiles, `${template} CLI written file set`)
    assertLayerBoundaries(template, appRoot, expectedFiles)

    writeDoctorEnv(appRoot, template)
    const doctorSummary = assertDoctorPass(template, appRoot)
    summaries.push({
      template,
      files: expectedFiles.length,
      doctor: doctorSummary,
    })
  }

  console.log('starter fixture validation passed')
  for (const summary of summaries) {
    console.log(
      `${summary.template}: ${summary.files} files, doctor ${summary.doctor.pass} pass / ${summary.doctor.warn} warn / ${summary.doctor.fail} fail`,
    )
  }
} finally {
  rmSync(tempRoot, { force: true, recursive: true })
}
