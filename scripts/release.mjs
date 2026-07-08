import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'

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
  console.log(`\nResuming prepared ${tag} release at publish/push.`)
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
  run('npm', ['run', 'prepack'])

  run('pnpm', ['exec', 'changelogen', '--bump', '-r', version])
  run('git', ['add', 'package.json', 'CHANGELOG.md', 'scripts/release.mjs'])
  run('git', ['commit', '-m', `chore(release): ${tag}`])
  run('git', ['tag', '-a', tag, '-m', tag])
} else if (!existsSync(new URL('../dist/module.mjs', import.meta.url))) {
  run('npm', ['run', 'prepack'])
}

run('npm', ['publish', ...(otp ? ['--otp', otp] : [])])
run('git', ['push', 'origin', 'main', '--follow-tags'])

console.log(`\nReleased ${pkg.name}@${version}.`)
