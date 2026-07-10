import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join, relative, sep } from 'node:path'

const version = process.argv
  .slice(2)
  .map((arg) => arg.replace(/^--(?=\d)/, ''))
  .find((arg) => arg !== '--')
const otpIndex = process.argv.indexOf('--otp')
const otp =
  process.argv.find((arg) => arg.startsWith('--otp='))?.slice('--otp='.length) ??
  (otpIndex >= 0 ? process.argv[otpIndex + 1] : undefined)
const versionPattern = /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:-[\dA-Z.-]+)?$/i

if (!version || !versionPattern.test(version)) {
  console.error('Usage: pnpm run release -- <version>')
  process.exit(1)
}

const tag = `v${version}`
const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
const changelog = readFileSync(new URL('../CHANGELOG.md', import.meta.url), 'utf8')
const repoRoot = process.cwd()

function run(command, args, options = {}) {
  console.log(`\n> ${[command, ...args].join(' ')}`)
  return execFileSync(command, args, {
    encoding: 'utf8',
    stdio: options.capture ? 'pipe' : 'inherit',
  })
}

function output(command, args) {
  return run(command, args, { capture: true }).trim()
}

function tryOutput(command, args) {
  try {
    return output(command, args)
  } catch {
    return ''
  }
}

function ensureAllowedWorkingTree() {
  const allowed = new Set(['package.json', 'scripts/release.mjs'])
  const status = run('git', ['status', '--porcelain'], { capture: true })
  if (status) {
    const unexpected = status
      .trimEnd()
      .split('\n')
      .map((line) => line.slice(3).replace(/^"|"$/g, ''))
      .filter((file) => !allowed.has(file))

    if (unexpected.length > 0) {
      console.error(`Working tree has unrelated changes:\n${unexpected.join('\n')}`)
      process.exit(1)
    }
  }
}

// Builds once, packs once, extracts the resulting tarball, and records a
// path/mode/size/SHA-256 content manifest as release evidence. Returns the
// absolute path of the exact verified tarball that must be published.
function buildPackAndVerify() {
  const distDir = join(repoRoot, 'dist')
  rmSync(distDir, { recursive: true, force: true })

  // Build once. `prepack` also runs `check:package-exports -- --dist`, which
  // validates the freshly built `dist` directory before it is packed.
  run('npm', ['run', 'prepack'])

  // Pack once, from the prepared clean tree, straight to a tarball file.
  // `--ignore-scripts` is required here: `npm pack` on a local directory
  // otherwise reruns the `prepack` lifecycle script itself, which would
  // rebuild `dist` a second time and pack something that was never verified.
  const artifactsDir = join(repoRoot, 'release-artifacts')
  mkdirSync(artifactsDir, { recursive: true })
  const packJson = output('npm', [
    'pack',
    '--json',
    '--ignore-scripts',
    '--pack-destination',
    artifactsDir,
  ])
  const [packResult] = JSON.parse(packJson)
  const tarballPath = join(artifactsDir, packResult.filename)

  if (!existsSync(tarballPath)) {
    console.error(`Expected pack artifact missing: ${tarballPath}`)
    process.exit(1)
  }

  // Extract that exact tarball (never the source directory) to verify it.
  const extractDir = mkdtempSync(join(tmpdir(), 'better-convex-nuxt-release-'))
  run('tar', ['xf', tarballPath, '-C', extractDir])
  const packageDir = join(extractDir, 'package')

  const entryPoint = join(packageDir, 'dist/module.mjs')
  if (!existsSync(entryPoint)) {
    console.error(`Packed tarball is missing its entry point: ${entryPoint}`)
    process.exit(1)
  }

  const packedPkg = JSON.parse(readFileSync(join(packageDir, 'package.json'), 'utf8'))
  if (packedPkg.version !== version) {
    console.error(
      `Packed tarball version ${packedPkg.version} does not match release version ${version}.`,
    )
    process.exit(1)
  }

  const manifest = buildContentManifest(packageDir)
  const manifestPath = join(artifactsDir, `${tag}.manifest.json`)
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`)
  console.log(`\nVerified tarball: ${tarballPath}`)
  console.log(`Content manifest: ${manifestPath}`)

  rmSync(extractDir, { recursive: true, force: true })

  return tarballPath
}

// Records path, mode, size, and SHA-256 for every file in the extracted
// package. This is evidence, not a release gate: manifest diffs alone must
// not fail a release.
function buildContentManifest(packageDir) {
  const entries = []

  function walk(dir) {
    for (const name of readdirSync(dir).sort()) {
      const absolutePath = join(dir, name)
      const stats = statSync(absolutePath)
      if (stats.isDirectory()) {
        walk(absolutePath)
        continue
      }
      const relativePath = relative(packageDir, absolutePath).split(sep).join('/')
      entries.push({
        path: relativePath,
        mode: (stats.mode & 0o777).toString(8).padStart(3, '0'),
        size: stats.size,
        sha256: createHash('sha256').update(readFileSync(absolutePath)).digest('hex'),
      })
    }
  }

  walk(packageDir)
  return { version, generatedAt: new Date().toISOString(), files: entries }
}

ensureAllowedWorkingTree()

const branch = output('git', ['branch', '--show-current'])
if (branch !== 'main') {
  console.error(`Release must run from main, current branch is ${branch}.`)
  process.exit(1)
}

run('git', ['fetch', 'origin', 'main', '--tags', '--prune-tags'])

const localHead = output('git', ['rev-parse', 'HEAD'])
const remoteHead = output('git', ['rev-parse', 'origin/main'])
const tagTarget = tryOutput('git', ['rev-list', '-n', '1', tag])
const releasePrepared =
  pkg.version === version && changelog.includes(`## ${tag}`) && tagTarget === localHead

if (localHead !== remoteHead && !releasePrepared) {
  console.error('Local main is not at origin/main. Pull or push first.')
  process.exit(1)
}

if (localHead !== remoteHead && releasePrepared) {
  try {
    run('git', ['merge-base', '--is-ancestor', 'origin/main', 'HEAD'], { capture: true })
  } catch {
    console.error(
      'Local release commit is not based on origin/main. Resolve git history before publishing.',
    )
    process.exit(1)
  }
  console.log(`\nResuming prepared ${tag} release at build/pack/publish.`)
}

if (tagTarget && !releasePrepared) {
  console.error(`${tag} already exists locally or on origin.`)
  process.exit(1)
}

try {
  const publishedVersion = output('npm', ['view', `${pkg.name}@${version}`, 'version'])
  if (publishedVersion === version) {
    console.error(`${pkg.name}@${version} is already published.`)
    process.exit(1)
  }
} catch {
  // npm exits non-zero when this exact version does not exist, which is what we want.
}

run('npm', ['whoami'])
if (!releasePrepared) {
  run('npm', ['run', 'format:check'])
  run('npm', ['run', 'lint'])
  run('npm', ['run', 'test:types'])
  run('npm', ['run', 'check:contracts'])
  run('npm', ['run', 'test'])

  run('pnpm', ['exec', 'changelogen', '--bump', '-r', version])
  run('git', ['add', 'package.json', 'CHANGELOG.md', 'scripts/release.mjs'])
  run('git', ['commit', '-m', `chore(release): ${tag}`])
  run('git', ['tag', '-a', tag, '-m', tag])
}

// Every run — fresh or resumed — rebuilds, repacks, and re-verifies from the
// prepared clean tree before publish. A resume path may re-verify or re-pack,
// but it never publishes a build that was not verified in this same run.
const tarballPath = buildPackAndVerify()

run('npm', ['publish', tarballPath, ...(otp ? ['--otp', otp] : [])])
run('git', ['push', 'origin', 'main', '--follow-tags'])

console.log(`\nReleased ${pkg.name}@${version}.`)
