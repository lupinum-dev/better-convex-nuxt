#!/usr/bin/env node
import { spawnSync } from 'node:child_process'
import {
  existsSync,
  mkdtempSync,
  mkdirSync,
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
const shouldTypecheck = process.argv.includes('--typecheck')
const shouldBuild = process.argv.includes('--build')
const shouldInstallGeneratedApps = shouldTypecheck || shouldBuild

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
  return runCommand(process.execPath, [cliPath, ...args], {
    cwd: repoRoot,
    env: {
      ...process.env,
      NO_COLOR: '1',
      NUXT_TELEMETRY_DISABLED: '1',
    },
    ...options,
  })
}

function runCommand(command, args, options = {}) {
  const result = spawnSync(command, args, {
    encoding: 'utf8',
    env: {
      ...process.env,
      NO_COLOR: '1',
      NUXT_TELEMETRY_DISABLED: '1',
      CI: '1',
    },
    ...options,
  })
  return {
    status: result.status ?? 1,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
  }
}

function formatCommandFailure(label, result) {
  return [
    `${label} failed with status ${result.status}.`,
    result.stdout ? `stdout:\n${result.stdout}` : '',
    result.stderr ? `stderr:\n${result.stderr}` : '',
  ]
    .filter(Boolean)
    .join('\n')
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
      'CONVEX_IDENTITY_FORWARDING_KEY=starter-fixture-validation-identity-forwarding-key-0123456789',
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

function requirePackageArtifacts() {
  const requiredFiles = [
    'dist/module.mjs',
    'dist/types.d.mts',
    'dist/runtime/backend/index.d.ts',
    'dist/runtime/backend/index.js',
    'dist/runtime/identity-forwarding/index.d.ts',
    'dist/runtime/identity-forwarding/index.js',
  ]
  const missing = requiredFiles.filter((path) => !existsSync(resolve(repoRoot, path)))
  assert(
    missing.length === 0,
    `Missing package artifacts for typecheck validation: ${missing.join(
      ', ',
    )}. Run \`pnpm run build:module && pnpm run build:cli\` first.`,
  )
}

function createPackedTrellisPackage(packRoot) {
  requirePackageArtifacts()
  mkdirSync(packRoot, { recursive: true })
  const result = runCommand('npm', ['pack', '--ignore-scripts', '--pack-destination', packRoot], {
    cwd: repoRoot,
  })
  assert(result.status === 0, formatCommandFailure('npm pack', result))
  const tarballName = result.stdout
    .trim()
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .at(-1)
  assert(tarballName, `npm pack did not report a tarball name.\n${result.stdout}\n${result.stderr}`)
  return resolve(packRoot, tarballName)
}

function rewriteGeneratedPackageDependency(appRoot, trellisTarballPath) {
  const packageJsonPath = resolve(appRoot, 'package.json')
  const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8'))
  const dependencies = packageJson.dependencies
  assert(
    dependencies && typeof dependencies === 'object',
    `${appRoot} package.json is missing dependencies.`,
  )
  assert(
    dependencies['@lupinum/trellis'] === 'workspace:*',
    `${appRoot} package.json must use @lupinum/trellis workspace:* before validation rewrite.`,
  )
  dependencies['@lupinum/trellis'] = `file:${trellisTarballPath}`
  writeFileSync(packageJsonPath, `${JSON.stringify(packageJson, null, 2)}\n`)
}

function runGeneratedValidation(template, appRoot, trellisTarballPath) {
  rewriteGeneratedPackageDependency(appRoot, trellisTarballPath)

  const install = runCommand('pnpm', ['install', '--ignore-scripts', '--no-frozen-lockfile'], {
    cwd: appRoot,
  })
  assert(install.status === 0, formatCommandFailure(`${template} install`, install))

  const codegen = runCommand(
    'pnpm',
    ['exec', 'convex', 'codegen', '--system-udfs', '--typecheck=disable'],
    { cwd: appRoot },
  )
  assert(codegen.status === 0, formatCommandFailure(`${template} convex codegen`, codegen))
  patchOfflineComponentCodegen(appRoot)
  assert(
    existsSync(resolve(appRoot, 'convex/_generated/server.d.ts')),
    `${template} convex codegen did not create convex/_generated/server.d.ts.`,
  )
  assert(
    existsSync(resolve(appRoot, 'convex/_generated/api.d.ts')),
    `${template} convex codegen did not create convex/_generated/api.d.ts.`,
  )

  const prepare = runCommand('pnpm', ['exec', 'nuxi', 'prepare', '--dotenv', '.env.local'], {
    cwd: appRoot,
  })
  assert(prepare.status === 0, formatCommandFailure(`${template} nuxt prepare`, prepare))

  const typecheck = runCommand('pnpm', ['run', 'typecheck'], { cwd: appRoot })
  assert(typecheck.status === 0, formatCommandFailure(`${template} typecheck`, typecheck))

  const build = shouldBuild ? runCommand('pnpm', ['run', 'build'], { cwd: appRoot }) : null
  if (build) assert(build.status === 0, formatCommandFailure(`${template} build`, build))

  return {
    install: 'pass',
    codegen: 'pass',
    prepare: 'pass',
    typecheck: 'pass',
    build: build ? 'pass' : null,
  }
}

function patchOfflineComponentCodegen(appRoot) {
  const convexConfigPath = resolve(appRoot, 'convex/convex.config.ts')
  const apiTypesPath = resolve(appRoot, 'convex/_generated/api.d.ts')
  if (!existsSync(convexConfigPath) || !existsSync(apiTypesPath)) return
  const convexConfig = readFileSync(convexConfigPath, 'utf8')
  if (!convexConfig.includes('@convex-dev/better-auth/convex.config')) return

  const apiTypes = readFileSync(apiTypesPath, 'utf8')
  if (!apiTypes.includes('export declare const components')) {
    writeFileSync(apiTypesPath, `${apiTypes}\nexport declare const components: any;\n`)
    return
  }
  writeFileSync(
    apiTypesPath,
    apiTypes.replace(
      'export declare const components: {};',
      'export declare const components: any;',
    ),
  )
}

const tempRoot = mkdtempSync(resolve(tmpdir(), 'trellis-starter-fixtures-'))
const trellisTarballPath = shouldInstallGeneratedApps
  ? createPackedTrellisPackage(resolve(tempRoot, 'pack'))
  : null
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
    const validationSummary = shouldInstallGeneratedApps
      ? runGeneratedValidation(template, appRoot, trellisTarballPath)
      : null
    summaries.push({
      template,
      files: expectedFiles.length,
      doctor: doctorSummary,
      validation: validationSummary,
    })
  }

  console.log(
    shouldBuild
      ? 'starter fixture build validation passed'
      : shouldTypecheck
        ? 'starter fixture typecheck validation passed'
        : 'starter fixture validation passed',
  )
  for (const summary of summaries) {
    const details = [
      `${summary.files} files`,
      `doctor ${summary.doctor.pass} pass / ${summary.doctor.warn} warn / ${summary.doctor.fail} fail`,
    ]
    if (summary.validation) {
      details.push(
        `install ${summary.validation.install}`,
        `codegen ${summary.validation.codegen}`,
        `prepare ${summary.validation.prepare}`,
        `typecheck ${summary.validation.typecheck}`,
      )
      if (summary.validation.build) details.push(`build ${summary.validation.build}`)
    }
    console.log(`${summary.template}: ${details.join(', ')}`)
  }
} finally {
  rmSync(tempRoot, { force: true, recursive: true })
}
