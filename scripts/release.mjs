import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
const version = pkg.version
const versionPattern = /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:-[\dA-Z.-]+)?$/i

if (process.argv.slice(2).some((argument) => argument !== '--') || !versionPattern.test(version)) {
  console.error('Usage: pnpm run release:prepare')
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
  run('pnpm', ['run', 'prepack'])

  // Pack once, from the prepared clean tree, straight to a tarball file.
  // `--ignore-scripts` is required here: `npm pack` on a local directory
  // otherwise reruns the `prepack` lifecycle script itself, which would
  // rebuild `dist` a second time and pack something that was never verified.
  const artifactsDir = join(repoRoot, '.release-artifacts')
  rmSync(artifactsDir, { recursive: true, force: true })
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
  run('pnpm', ['run', 'check:contract-fixtures:dist'])
  run('pnpm', ['run', 'check:candidate-apps', '--', '--tarball', tarballPath])
  console.log(`\nVerified tarball: ${tarballPath}`)
  console.log(`Content manifest: ${manifestPath}`)

  const sbomPath = join(artifactsDir, `${tag}.sbom.cdx.json`)
  run('node', ['scripts/generate-sbom.mjs', '--output', sbomPath])
  console.log(`CycloneDX SBOM: ${sbomPath}`)

  const sha256 = createHash('sha256').update(readFileSync(tarballPath)).digest('hex')
  console.log(`SHA-256: ${sha256}`)

  return { sha256, tarballPath }
}

ensureCleanWorkingTree()

if (!changelog.includes(`## ${tag}`)) {
  console.error(`CHANGELOG.md must contain a prepared ${tag} release entry.`)
  process.exit(1)
}

run('pnpm', ['run', 'release:verify'])
ensureCleanWorkingTree()
const { tarballPath } = buildPackAndVerify()
ensureCleanWorkingTree()

console.log(`\nPrepared and verified ${pkg.name}@${version} without publishing or changing Git.`)
console.log(`Publish candidate: npm publish ${tarballPath} --tag next`)
console.log(`Promote later: npm dist-tag add ${pkg.name}@${version} latest`)
