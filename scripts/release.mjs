import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'

const args = process.argv.slice(2).filter((argument) => argument !== '--')
const positional = []
let otp
let verifyOnly = false

for (let index = 0; index < args.length; index += 1) {
  const argument = args[index]
  if (argument === '--verify-only') {
    verifyOnly = true
  } else if (argument === '--otp') {
    if (!args[index + 1] || args[index + 1].startsWith('--')) {
      console.error('--otp requires a code.')
      process.exit(1)
    }
    otp = args[index + 1]
    index += 1
  } else if (argument.startsWith('--otp=')) {
    otp = argument.slice('--otp='.length)
  } else if (argument.startsWith('--') && !/^--\d/.test(argument)) {
    console.error(`Unknown release option: ${argument}`)
    process.exit(1)
  } else {
    positional.push(argument.replace(/^--(?=\d)/, ''))
  }
}

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
const version = positional[0] ?? (verifyOnly ? pkg.version : undefined)
const versionPattern = /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:-[\dA-Z.-]+)?$/i

if (positional.length > 1 || !version || !versionPattern.test(version)) {
  console.error('Usage: pnpm run release -- [<version>] [--verify-only] [--otp <code>]')
  process.exit(1)
}

if (verifyOnly && otp) {
  console.error('--otp is only valid when publishing.')
  process.exit(1)
}

const tag = `v${version}`
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

function ensureCleanWorkingTree() {
  const status = run('git', ['status', '--porcelain'], { capture: true })
  if (status) {
    console.error(`Release verification requires a clean working tree:\n${status.trimEnd()}`)
    process.exit(1)
  }
}

// Builds once, packs once, extracts the resulting tarball, and records a
// path/mode/size/SHA-256 content manifest as release evidence. Returns the
// absolute path of the exact verified tarball that must be published.
function buildPackAndVerify() {
  const distDir = join(repoRoot, 'dist')
  rmSync(distDir, { recursive: true, force: true })

  // Build once. `prepack` runs only the dist-level export and purity checks;
  // the packed consumer checks run below against the exact release artifact.
  run('npm', ['run', 'prepack'])

  // Pack once, from the prepared clean tree, straight to a tarball file.
  // `--ignore-scripts` is required here: `npm pack` on a local directory
  // otherwise reruns the `prepack` lifecycle script itself, which would
  // rebuild `dist` a second time and pack something that was never verified.
  const artifactsDir = join(repoRoot, '.release-artifacts')
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

  const manifestPath = join(artifactsDir, `${tag}.manifest.json`)
  run('node', [
    'scripts/check-package-exports.mjs',
    '--tarball',
    tarballPath,
    '--manifest',
    manifestPath,
  ])
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
  if (manifest.version !== version) {
    console.error(
      `Packed tarball version ${manifest.version} does not match release version ${version}.`,
    )
    process.exit(1)
  }
  console.log(`\nVerified tarball: ${tarballPath}`)
  console.log(`Content manifest: ${manifestPath}`)

  return tarballPath
}

ensureCleanWorkingTree()

if (verifyOnly) {
  if (pkg.version !== version) {
    console.error(
      `Verification version ${version} does not match package.json version ${pkg.version}.`,
    )
    process.exit(1)
  }
  run('npm', ['run', 'check'])
  run('npm', ['run', 'check:contract-fixtures'])
  buildPackAndVerify()
  console.log(`\nVerified ${pkg.name}@${version} without publishing.`)
  process.exit(0)
}

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
  // `check` is the one authoritative PR command (format, lint, module/server
  // types, source boundaries, and the full test suite). The fixture command
  // owns the non-package contracts; buildPackAndVerify owns the one build, one
  // pack, and exact-artifact checks. Keeping those tiers named prevents this
  // script from duplicating a hand-picked list that can drift from CI.
  run('npm', ['run', 'check'])
  run('npm', ['run', 'check:contract-fixtures'])

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
