import { execFileSync } from 'node:child_process'
import { createHash, randomBytes } from 'node:crypto'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, join, resolve } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { isDeepStrictEqual } from 'node:util'

import { selectProductionManifestContract } from './package-check/production-manifest-contract.mjs'
import { buildContentManifest, packAndExtract } from './package-check/tarball.mjs'

const repoRoot = resolve(fileURLToPath(new URL('..', import.meta.url)))
const packageJson = JSON.parse(readFileSync(join(repoRoot, 'package.json'), 'utf8'))
const version = packageJson.version
const tag = `v${version}`
const expectedArtifactFiles = Object.freeze({
  contents: `${tag}.contents.json`,
  evidence: `${tag}.artifact.json`,
  sbom: `${tag}.sbom.cdx.json`,
  tarball: `${packageJson.name}-${version}.tgz`,
})
const versionPattern = /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:-[\dA-Z.-]+)?$/i
const safeArtifactFilenamePattern = /^\w[\w.-]{0,255}$/u
const command = process.argv[2]
const verifyPath = process.argv[3]
const runtimeFingerprintToken = '__BCN_RELEASE_RUNTIME_FINGERPRINT__'
const runtimeFingerprintPattern = /^bcn-release-v1-[0-9a-f]{64}$/u
const runtimeFingerprintBuildFiles = [
  join(repoRoot, 'dist', 'runtime', 'shared', 'release-fingerprint.js'),
]
const runtimeFingerprintPackedFiles = ['dist/runtime/shared/release-fingerprint.js']
const runtimeFingerprintModulePackedFile = 'dist/module.mjs'
const maxPackedFingerprintFileBytes = 16 * 1024 * 1024

if (
  !['artifact', 'prepare', 'verify'].includes(command) ||
  (command === 'verify' ? process.argv.length !== 4 : process.argv.length !== 3)
) {
  console.error('Usage: node scripts/release.mjs artifact | prepare | verify <artifact.json>')
  process.exit(1)
}
if (
  packageJson.name !== 'better-convex-nuxt' ||
  !versionPattern.test(version) ||
  !Object.values(expectedArtifactFiles).every((file) => safeArtifactFilenamePattern.test(file))
) {
  console.error('Invalid release package identity or artifact filenames.')
  process.exit(1)
}

function run(executable, args, options = {}) {
  console.log(`\n> ${[executable, ...args].join(' ')}`)
  return execFileSync(executable, args, {
    cwd: repoRoot,
    encoding: 'utf8',
    stdio: options.capture ? 'pipe' : 'inherit',
  })
}

function output(executable, args) {
  return run(executable, args, { capture: true }).trim()
}

function ensureCleanWorkingTree() {
  const status = output('git', ['status', '--porcelain'])
  if (status) {
    throw new Error(`Release artifact creation requires a clean working tree:\n${status}`)
  }
}

function requirePreparedChangelog() {
  const changelog = readFileSync(join(repoRoot, 'CHANGELOG.md'), 'utf8')
  if (!changelog.includes(`## ${tag}`)) {
    throw new Error(`CHANGELOG.md must contain a prepared ${tag} release entry.`)
  }
}

function digest(path, algorithm) {
  return createHash(algorithm).update(readFileSync(path)).digest('hex')
}

function integrity(path) {
  return `sha512-${createHash('sha512').update(readFileSync(path)).digest('base64')}`
}

function fileEvidence(path) {
  return {
    file: basename(path),
    bytes: statSync(path).size,
    sha256: digest(path, 'sha256'),
  }
}

function verifyFileEvidence(directory, evidence, label, expectedFile) {
  if (
    !evidence ||
    evidence.file !== expectedFile ||
    basename(evidence.file) !== evidence.file ||
    !Number.isSafeInteger(evidence.bytes) ||
    evidence.bytes < 1 ||
    !/^[0-9a-f]{64}$/u.test(evidence.sha256)
  ) {
    throw new Error(`Artifact ${label} evidence is malformed.`)
  }
  const path = join(directory, evidence.file)
  if (!existsSync(path)) throw new Error(`Artifact ${label} file is missing: ${path}`)
  if (statSync(path).size !== evidence.bytes || digest(path, 'sha256') !== evidence.sha256) {
    throw new Error(`Artifact ${label} bytes do not match their evidence.`)
  }
  return path
}

function verifyRuntimeFingerprintBinding(tarballPath, runtimeFingerprint) {
  for (const packagePath of runtimeFingerprintPackedFiles) {
    let source
    try {
      source = execFileSync('tar', ['-xOf', tarballPath, `package/${packagePath}`], {
        encoding: 'utf8',
        maxBuffer: maxPackedFingerprintFileBytes,
        stdio: ['ignore', 'pipe', 'pipe'],
      })
    } catch {
      throw new Error(`Artifact tarball is missing bounded fingerprint input ${packagePath}.`)
    }
    if (source.split(runtimeFingerprint).length !== 2 || source.includes(runtimeFingerprintToken)) {
      throw new Error(`Artifact runtime fingerprint is not bound to packed ${packagePath}.`)
    }
  }
  let moduleSource
  try {
    moduleSource = execFileSync(
      'tar',
      ['-xOf', tarballPath, `package/${runtimeFingerprintModulePackedFile}`],
      {
        encoding: 'utf8',
        maxBuffer: maxPackedFingerprintFileBytes,
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    )
  } catch {
    throw new Error(
      `Artifact tarball is missing bounded fingerprint input ${runtimeFingerprintModulePackedFile}.`,
    )
  }
  const bindings =
    moduleSource.match(
      /import\s*\{\s*getPackedRuntimeFingerprint\s*\}\s*from\s*['"]\.\.\/dist\/runtime\/shared\/release-fingerprint\.js['"]/gu,
    ) ?? []
  if (bindings.length !== 1 || moduleSource.includes(runtimeFingerprintToken)) {
    throw new Error(
      `Artifact runtime fingerprint helper is not bound to packed ${runtimeFingerprintModulePackedFile}.`,
    )
  }
}

function requireReviewedCandidateManifest(packageDir) {
  const manifestPath = join(packageDir, 'package.json')
  const candidate = JSON.parse(readFileSync(manifestPath, 'utf8'))
  if (candidate.name !== packageJson.name || candidate.version !== version) {
    throw new Error(
      `Packed package identity ${String(candidate.name)}@${String(candidate.version)} does not match reviewed ${packageJson.name}@${version}.`,
    )
  }
  if (
    !isDeepStrictEqual(
      selectProductionManifestContract(candidate),
      selectProductionManifestContract(packageJson),
    )
  ) {
    throw new Error(
      'Packed production manifest contract does not exactly match the reviewed source manifest.',
    )
  }
  return manifestPath
}

function canonicalizeProductionSbom(value, label) {
  const timestamp = value?.metadata?.timestamp
  let canonicalTimestamp
  try {
    canonicalTimestamp =
      typeof timestamp === 'string' ? new Date(timestamp).toISOString() : undefined
  } catch {
    canonicalTimestamp = undefined
  }
  if (canonicalTimestamp !== timestamp) {
    throw new Error(`Artifact ${label} SBOM timestamp is malformed.`)
  }
  const canonical = structuredClone(value)
  canonical.metadata.timestamp = '<canonical-generated-at>'
  return canonical
}

function verifyProductionSbomContract(sbom, candidateManifestPath) {
  const scratchDir = mkdtempSync(join(tmpdir(), 'bcn-release-sbom-'))
  const expectedPath = join(scratchDir, 'expected.sbom.cdx.json')
  try {
    run('node', [
      'scripts/generate-sbom.mjs',
      '--root-manifest',
      candidateManifestPath,
      '--output',
      expectedPath,
    ])
    const expected = JSON.parse(readFileSync(expectedPath, 'utf8'))
    if (
      !isDeepStrictEqual(
        canonicalizeProductionSbom(sbom, 'candidate'),
        canonicalizeProductionSbom(expected, 'expected'),
      )
    ) {
      throw new Error('Artifact SBOM does not match the canonical production dependency contract.')
    }
  } finally {
    rmSync(scratchDir, { force: true, recursive: true })
  }
}

function generateCandidateSbom(tarballPath, outputPath) {
  const { packageDir, scratchDir } = packAndExtract(tarballPath)
  try {
    const candidateManifestPath = requireReviewedCandidateManifest(packageDir)
    run('node', [
      'scripts/generate-sbom.mjs',
      '--root-manifest',
      candidateManifestPath,
      '--output',
      outputPath,
    ])
  } finally {
    rmSync(scratchDir, { force: true, recursive: true })
  }
}

function verifyArtifact(evidenceFile) {
  const evidencePath = resolve(repoRoot, evidenceFile)
  const evidence = JSON.parse(readFileSync(evidencePath, 'utf8'))
  if (
    evidence.schemaVersion !== 2 ||
    evidence.package !== packageJson.name ||
    evidence.version !== version ||
    evidence.tag !== tag ||
    !/^[0-9a-f]{40}$/u.test(evidence.sourceCommit) ||
    evidence.packageManager !== packageJson.packageManager ||
    evidence.node !== process.version ||
    typeof evidence.npm !== 'string' ||
    typeof evidence.pnpm !== 'string' ||
    evidence.sourceTree !== 'clean' ||
    !runtimeFingerprintPattern.test(evidence.runtimeFingerprint)
  ) {
    throw new Error('Artifact identity does not match the checked-out package and source commit.')
  }

  const directory = resolve(evidencePath, '..')
  const tarballPath = verifyFileEvidence(
    directory,
    evidence.tarball,
    'tarball',
    expectedArtifactFiles.tarball,
  )
  const contentsPath = verifyFileEvidence(
    directory,
    evidence.contents,
    'content manifest',
    expectedArtifactFiles.contents,
  )
  const sbomPath = verifyFileEvidence(directory, evidence.sbom, 'SBOM', expectedArtifactFiles.sbom)
  if (
    typeof evidence.tarball.integrity !== 'string' ||
    integrity(tarballPath) !== evidence.tarball.integrity
  ) {
    throw new Error('Artifact tarball SRI does not match its bytes.')
  }
  verifyRuntimeFingerprintBinding(tarballPath, evidence.runtimeFingerprint)

  const currentCommit = output('git', ['rev-parse', 'HEAD'])
  const currentNpm = output('npm', ['--version'])
  const currentPnpm = output('pnpm', ['--version'])
  if (
    evidence.sourceCommit !== currentCommit ||
    evidence.npm !== currentNpm ||
    evidence.pnpm !== currentPnpm
  ) {
    throw new Error('Artifact identity does not match the checked-out package and source commit.')
  }

  const { packageDir, scratchDir } = packAndExtract(tarballPath)
  try {
    const candidateManifestPath = requireReviewedCandidateManifest(packageDir)
    const contents = JSON.parse(readFileSync(contentsPath, 'utf8'))
    const recomputedContents = buildContentManifest(packageDir)
    if (
      contents.version !== version ||
      !Array.isArray(contents.files) ||
      contents.files.length === 0 ||
      !isDeepStrictEqual(contents, recomputedContents)
    ) {
      throw new Error('Artifact content manifest does not exactly match the tarball contents.')
    }
    const sbom = JSON.parse(readFileSync(sbomPath, 'utf8'))
    verifyProductionSbomContract(sbom, candidateManifestPath)
  } finally {
    rmSync(scratchDir, { force: true, recursive: true })
  }

  console.log(`Verified immutable artifact: ${tarballPath}`)
  console.log(`SHA-256: ${evidence.tarball.sha256}`)
  console.log(`SRI: ${evidence.tarball.integrity}`)
  return { evidence, tarballPath }
}

function packBoundRuntimeArtifact(artifactsDir) {
  const runtimeFingerprint = `bcn-release-v1-${randomBytes(32).toString('hex')}`
  const originals = runtimeFingerprintBuildFiles.map((path) => {
    const source = readFileSync(path, 'utf8')
    if (source.split(runtimeFingerprintToken).length !== 2) {
      throw new Error(`Release fingerprint token must occur exactly once in ${path}.`)
    }
    return { path, source }
  })

  try {
    for (const { path, source } of originals) {
      writeFileSync(path, source.replace(runtimeFingerprintToken, runtimeFingerprint))
    }
    // npm must not rerun prepack here: dist above is the one reviewed build.
    const packResult = JSON.parse(
      output('npm', ['pack', '--json', '--ignore-scripts', '--pack-destination', artifactsDir]),
    )
    if (!Array.isArray(packResult) || packResult.length !== 1) {
      throw new Error('npm pack must produce exactly one package result.')
    }
    return { packResult, runtimeFingerprint }
  } finally {
    // Keep the checkout/build output reusable even when packing fails midway.
    for (const { path, source } of originals) writeFileSync(path, source)
  }
}

/**
 * Builds and packs exactly once. The returned tarball is the only releasable
 * package input; later jobs verify or publish these bytes and never repack the
 * repository directory.
 */
function createArtifact() {
  const distDir = join(repoRoot, 'dist')
  const artifactsDir = join(repoRoot, '.release-artifacts')
  rmSync(distDir, { recursive: true, force: true })
  rmSync(artifactsDir, { recursive: true, force: true })
  mkdirSync(artifactsDir, { recursive: true })

  run('pnpm', ['run', 'prepack'])

  const { packResult, runtimeFingerprint } = packBoundRuntimeArtifact(artifactsDir)
  if (packResult[0].filename !== expectedArtifactFiles.tarball) {
    throw new Error(
      `npm pack produced unexpected artifact filename: ${String(packResult[0].filename)}.`,
    )
  }
  const tarballPath = join(artifactsDir, packResult[0].filename)
  if (!existsSync(tarballPath)) throw new Error(`Expected tarball is missing: ${tarballPath}`)

  const contentsPath = join(artifactsDir, expectedArtifactFiles.contents)
  run('node', [
    'scripts/check-package-exports.mjs',
    '--tarball',
    tarballPath,
    '--manifest',
    contentsPath,
  ])
  const contents = JSON.parse(readFileSync(contentsPath, 'utf8'))
  if (packResult[0].name !== packageJson.name || contents.version !== version) {
    throw new Error(
      `Packed identity ${String(packResult[0].name)}@${String(contents.version)} does not match ${packageJson.name}@${version}.`,
    )
  }

  const sbomPath = join(artifactsDir, expectedArtifactFiles.sbom)
  generateCandidateSbom(tarballPath, sbomPath)

  const tarballIntegrity = integrity(tarballPath)
  if (packResult[0].integrity && packResult[0].integrity !== tarballIntegrity) {
    throw new Error('npm pack integrity does not match the independently computed tarball SRI.')
  }
  const sourceCommit = output('git', ['rev-parse', 'HEAD'])
  if (!/^[0-9a-f]{40}$/u.test(sourceCommit)) throw new Error('Could not resolve source commit.')

  const evidence = {
    schemaVersion: 2,
    package: packageJson.name,
    version,
    tag,
    sourceCommit,
    packageManager: packageJson.packageManager,
    node: process.version,
    npm: output('npm', ['--version']),
    pnpm: output('pnpm', ['--version']),
    sourceTree: 'clean',
    runtimeFingerprint,
    tarball: {
      ...fileEvidence(tarballPath),
      integrity: tarballIntegrity,
    },
    contents: fileEvidence(contentsPath),
    sbom: fileEvidence(sbomPath),
  }
  const evidencePath = join(artifactsDir, expectedArtifactFiles.evidence)
  writeFileSync(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`)

  ensureCleanWorkingTree()
  console.log(`\nImmutable release candidate: ${tarballPath}`)
  console.log(`Artifact evidence: ${evidencePath}`)
  console.log(`SHA-256: ${evidence.tarball.sha256}`)
  console.log(`SRI: ${evidence.tarball.integrity}`)
  return { evidencePath, tarballPath }
}

function main() {
  if (command === 'verify') {
    verifyArtifact(verifyPath)
    return
  }
  ensureCleanWorkingTree()
  requirePreparedChangelog()
  const artifact = createArtifact()
  if (command === 'prepare') {
    run('pnpm', ['run', 'release:verify', '--artifact-manifest', artifact.evidencePath])
  }
  ensureCleanWorkingTree()
  console.log(
    `\nPrepared ${packageJson.name}@${version}. Publication is permitted only from the protected trusted-publishing workflow using this exact tarball.`,
  )
}

try {
  main()
} catch (error) {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
}
