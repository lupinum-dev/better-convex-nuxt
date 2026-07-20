import { execFileSync, spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { buildContentManifest } from '../../scripts/package-check/tarball.mjs'

const root = resolve(import.meta.dirname, '../..')
const temporaryDirectories: string[] = []
let productionSbom: string | undefined

function sha256(bytes: Buffer | string) {
  return createHash('sha256').update(bytes).digest('hex')
}

function sri(bytes: Buffer | string) {
  return `sha512-${createHash('sha512').update(bytes).digest('base64')}`
}

function canonicalProductionSbom() {
  if (productionSbom) return productionSbom
  const directory = mkdtempSync(join(tmpdir(), 'bcn-release-test-sbom-'))
  const path = join(directory, 'expected.sbom.cdx.json')
  try {
    execFileSync(process.execPath, ['scripts/generate-sbom.mjs', '--output', path], {
      cwd: root,
      stdio: 'ignore',
    })
    productionSbom = readFileSync(path, 'utf8')
    return productionSbom
  } finally {
    rmSync(directory, { force: true, recursive: true })
  }
}

function createArtifactFixture() {
  const directory = mkdtempSync(join(tmpdir(), 'bcn-release-evidence-'))
  temporaryDirectories.push(directory)
  const packageJson = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
  const sourceCommit = execFileSync('git', ['rev-parse', 'HEAD'], {
    cwd: root,
    encoding: 'utf8',
  }).trim()
  const npm = execFileSync('npm', ['--version'], { encoding: 'utf8' }).trim()
  const pnpm = execFileSync('pnpm', ['--version'], { encoding: 'utf8' }).trim()
  const runtimeFingerprint = `bcn-release-v1-${'a'.repeat(64)}`
  const tarballName = `${packageJson.name}-${packageJson.version}.tgz`
  const contentsName = `v${packageJson.version}.contents.json`
  const sbomName = `v${packageJson.version}.sbom.cdx.json`
  const packedPackage = join(directory, 'packed', 'package')
  mkdirSync(join(packedPackage, 'dist', 'runtime', 'shared'), { recursive: true })
  writeFileSync(
    join(packedPackage, 'dist', 'module.mjs'),
    "import { getPackedRuntimeFingerprint } from '../dist/runtime/shared/release-fingerprint.js'\ngetPackedRuntimeFingerprint()\n",
  )
  writeFileSync(
    join(packedPackage, 'dist', 'runtime', 'shared', 'release-fingerprint.js'),
    `const value = '${runtimeFingerprint}'\n`,
  )
  writeFileSync(join(packedPackage, 'package.json'), `${JSON.stringify(packageJson)}\n`)
  execFileSync(
    'tar',
    ['czf', join(directory, tarballName), '-C', join(directory, 'packed'), 'package'],
    { encoding: 'utf8' },
  )
  const tarball = readFileSync(join(directory, tarballName))
  const extractedRoot = join(directory, 'extracted')
  mkdirSync(extractedRoot)
  execFileSync('tar', ['xf', join(directory, tarballName), '-C', extractedRoot])
  const contents = `${JSON.stringify(buildContentManifest(join(extractedRoot, 'package')), null, 2)}\n`
  const sbom = canonicalProductionSbom()
  writeFileSync(join(directory, contentsName), contents)
  writeFileSync(join(directory, sbomName), sbom)

  const evidence = {
    schemaVersion: 2,
    package: packageJson.name,
    version: packageJson.version,
    tag: `v${packageJson.version}`,
    sourceCommit,
    packageManager: packageJson.packageManager,
    node: process.version,
    npm,
    pnpm,
    sourceTree: 'clean',
    runtimeFingerprint,
    tarball: {
      file: tarballName,
      bytes: tarball.length,
      sha256: sha256(tarball),
      integrity: sri(tarball),
    },
    contents: {
      file: contentsName,
      bytes: Buffer.byteLength(contents),
      sha256: sha256(contents),
    },
    sbom: {
      file: sbomName,
      bytes: Buffer.byteLength(sbom),
      sha256: sha256(sbom),
    },
  }
  const evidencePath = join(directory, `v${packageJson.version}.artifact.json`)
  writeFileSync(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`)
  return { directory, evidence, evidencePath, packedPackage, tarballName }
}

function replaceBoundSidecar(
  fixture: ReturnType<typeof createArtifactFixture>,
  key: 'contents' | 'sbom',
  contents: string,
) {
  writeFileSync(join(fixture.directory, fixture.evidence[key].file), contents)
  fixture.evidence[key].bytes = Buffer.byteLength(contents)
  fixture.evidence[key].sha256 = sha256(contents)
  writeFileSync(fixture.evidencePath, `${JSON.stringify(fixture.evidence, null, 2)}\n`)
}

function replacePackedManifest(
  fixture: ReturnType<typeof createArtifactFixture>,
  mutate: (manifest: Record<string, unknown>) => void,
) {
  const manifestPath = join(fixture.packedPackage, 'package.json')
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as Record<string, unknown>
  mutate(manifest)
  writeFileSync(manifestPath, `${JSON.stringify(manifest)}\n`)

  const tarballPath = join(fixture.directory, fixture.tarballName)
  execFileSync('tar', ['czf', tarballPath, '-C', join(fixture.directory, 'packed'), 'package'], {
    encoding: 'utf8',
  })
  const tarball = readFileSync(tarballPath)
  fixture.evidence.tarball.bytes = tarball.length
  fixture.evidence.tarball.sha256 = sha256(tarball)
  fixture.evidence.tarball.integrity = sri(tarball)

  const contents = `${JSON.stringify(buildContentManifest(fixture.packedPackage), null, 2)}\n`
  writeFileSync(join(fixture.directory, fixture.evidence.contents.file), contents)
  fixture.evidence.contents.bytes = Buffer.byteLength(contents)
  fixture.evidence.contents.sha256 = sha256(contents)
  writeFileSync(fixture.evidencePath, `${JSON.stringify(fixture.evidence, null, 2)}\n`)
}

function productionContractDigest(sbom: Record<string, unknown>) {
  const metadata = sbom.metadata as Record<string, unknown>
  const component = metadata.component as Record<string, unknown>
  const properties = component.properties as Array<{ name: string; value: string }>
  return properties.find(
    ({ name }) => name === 'better-convex-nuxt:production-manifest-contract-sha256',
  )?.value
}

function verify(path: string) {
  return spawnSync('node', ['scripts/release.mjs', 'verify', path], {
    cwd: root,
    encoding: 'utf8',
  })
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true })
  }
})

describe('immutable release artifact evidence', () => {
  it('accepts matching tarball, content manifest, SBOM, package, and source commit', () => {
    const fixture = createArtifactFixture()
    const contents = JSON.parse(
      readFileSync(join(fixture.directory, fixture.evidence.contents.file), 'utf8'),
    )
    expect(contents.files.map((file: { path: string }) => file.path)).toEqual([
      'dist/module.mjs',
      'dist/runtime/shared/release-fingerprint.js',
      'package.json',
    ])
    const result = verify(fixture.evidencePath)
    expect(result.status, result.stderr).toBe(0)
    expect(result.stdout).toContain('Verified immutable artifact')
    const sbom = JSON.parse(
      readFileSync(join(fixture.directory, fixture.evidence.sbom.file), 'utf8'),
    ) as Record<string, unknown>
    expect(productionContractDigest(sbom)).toMatch(/^[0-9a-f]{64}$/u)
  }, 120_000)

  it('roots the SBOM contract digest in the explicitly supplied package manifest', () => {
    const fixture = createArtifactFixture()
    const original = JSON.parse(
      readFileSync(join(fixture.directory, fixture.evidence.sbom.file), 'utf8'),
    ) as Record<string, unknown>
    const manifestPath = join(fixture.packedPackage, 'package.json')
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as Record<string, unknown>
    manifest.optionalDependencies = { 'forged-candidate-only-package': '1.0.0' }
    writeFileSync(manifestPath, `${JSON.stringify(manifest)}\n`)
    const outputPath = join(fixture.directory, 'candidate-rooted.sbom.cdx.json')
    execFileSync(
      process.execPath,
      ['scripts/generate-sbom.mjs', '--root-manifest', manifestPath, '--output', outputPath],
      { cwd: root, stdio: 'ignore' },
    )
    const candidate = JSON.parse(readFileSync(outputPath, 'utf8')) as Record<string, unknown>
    expect(productionContractDigest(candidate)).toMatch(/^[0-9a-f]{64}$/u)
    expect(productionContractDigest(candidate)).not.toBe(productionContractDigest(original))
  }, 120_000)

  it('rejects a rehashed tarball whose packed production contract differs from source', () => {
    const fixture = createArtifactFixture()
    replacePackedManifest(fixture, (manifest) => {
      manifest.dependencies = {
        ...(manifest.dependencies as Record<string, unknown>),
        defu: '0.0.0-forged',
      }
      manifest.peerDependencies = {
        ...(manifest.peerDependencies as Record<string, unknown>),
        convex: '0.0.0-forged',
      }
      manifest.optionalDependencies = { 'forged-candidate-only-package': '1.0.0' }
      manifest.engines = { node: '>=0' }
      manifest.packageManager = 'pnpm@0.0.0'
    })
    const result = verify(fixture.evidencePath)
    expect(result.status, result.stderr).toBe(1)
    expect(result.stderr).toContain(
      'Packed production manifest contract does not exactly match the reviewed source manifest',
    )
  }, 120_000)

  it('rejects a rehashed tarball whose packed package identity differs from source', () => {
    const fixture = createArtifactFixture()
    replacePackedManifest(fixture, (manifest) => {
      manifest.name = 'forged-package-name'
    })
    const result = verify(fixture.evidencePath)
    expect(result.status).toBe(1)
    expect(result.stderr).toContain('Packed package identity forged-package-name@')
  }, 120_000)

  it('rejects changed tarball bytes', () => {
    const fixture = createArtifactFixture()
    writeFileSync(join(fixture.directory, fixture.tarballName), 'different bytes')
    const result = verify(fixture.evidencePath)
    expect(result.status).toBe(1)
    expect(result.stderr).toContain('tarball bytes do not match')
  }, 120_000)

  it('rejects changed sidecars and a forged tarball integrity value', () => {
    const contentsFixture = createArtifactFixture()
    writeFileSync(join(contentsFixture.directory, contentsFixture.evidence.contents.file), '{}\n')
    expect(verify(contentsFixture.evidencePath).stderr).toContain(
      'content manifest bytes do not match',
    )

    const sbomFixture = createArtifactFixture()
    writeFileSync(join(sbomFixture.directory, sbomFixture.evidence.sbom.file), '{}\n')
    expect(verify(sbomFixture.evidencePath).stderr).toContain('SBOM bytes do not match')

    const integrityFixture = createArtifactFixture()
    integrityFixture.evidence.tarball.integrity = `sha512-${Buffer.alloc(64).toString('base64')}`
    writeFileSync(
      integrityFixture.evidencePath,
      `${JSON.stringify(integrityFixture.evidence, null, 2)}\n`,
    )
    expect(verify(integrityFixture.evidencePath).stderr).toContain('tarball SRI does not match')
  }, 120_000)

  it('rejects a bound content manifest that does not describe the tarball', () => {
    const fixture = createArtifactFixture()
    const contents = JSON.parse(
      readFileSync(join(fixture.directory, fixture.evidence.contents.file), 'utf8'),
    )
    contents.files = contents.files.slice(1)
    replaceBoundSidecar(fixture, 'contents', `${JSON.stringify(contents, null, 2)}\n`)
    expect(verify(fixture.evidencePath).stderr).toContain(
      'content manifest does not exactly match the tarball contents',
    )
  }, 120_000)

  it('rejects a bound SBOM that differs from the production dependency contract', () => {
    const fixture = createArtifactFixture()
    const sbom = JSON.parse(
      readFileSync(join(fixture.directory, fixture.evidence.sbom.file), 'utf8'),
    )
    expect(sbom.components.length).toBeGreaterThan(0)
    sbom.components[0].version = '0.0.0-forged'
    replaceBoundSidecar(fixture, 'sbom', `${JSON.stringify(sbom, null, 2)}\n`)
    expect(verify(fixture.evidencePath).stderr).toContain(
      'SBOM does not match the canonical production dependency contract',
    )
  }, 120_000)

  it('rejects traversal and a source-commit mismatch', () => {
    const fixture = createArtifactFixture()
    fixture.evidence.tarball.file = '../outside.tgz'
    writeFileSync(fixture.evidencePath, `${JSON.stringify(fixture.evidence)}\n`)
    expect(verify(fixture.evidencePath).stderr).toContain('tarball evidence is malformed')

    const second = createArtifactFixture()
    second.evidence.sourceCommit = '0'.repeat(40)
    writeFileSync(second.evidencePath, `${JSON.stringify(second.evidence)}\n`)
    expect(verify(second.evidencePath).stderr).toContain('identity does not match')
  }, 120_000)

  it('rejects control characters and arbitrary suffixes in evidence filenames', () => {
    const injected = createArtifactFixture()
    injected.evidence.tarball.file = `${injected.tarballName}\noutput=.`
    writeFileSync(injected.evidencePath, `${JSON.stringify(injected.evidence)}\n`)
    expect(verify(injected.evidencePath).stderr).toContain('tarball evidence is malformed')

    const suffixed = createArtifactFixture()
    suffixed.evidence.contents.file = `${suffixed.evidence.contents.file}.old`
    writeFileSync(suffixed.evidencePath, `${JSON.stringify(suffixed.evidence)}\n`)
    expect(verify(suffixed.evidencePath).stderr).toContain('content manifest evidence is malformed')
  }, 120_000)

  it('rejects missing or malformed build-generated runtime fingerprints', () => {
    const missing = createArtifactFixture()
    delete (missing.evidence as { runtimeFingerprint?: string }).runtimeFingerprint
    writeFileSync(missing.evidencePath, `${JSON.stringify(missing.evidence)}\n`)
    expect(verify(missing.evidencePath).stderr).toContain('identity does not match')

    const forged = createArtifactFixture()
    forged.evidence.runtimeFingerprint = `bcn-release-v1-${'g'.repeat(64)}`
    writeFileSync(forged.evidencePath, `${JSON.stringify(forged.evidence)}\n`)
    expect(verify(forged.evidencePath).stderr).toContain('identity does not match')

    const mismatched = createArtifactFixture()
    mismatched.evidence.runtimeFingerprint = `bcn-release-v1-${'b'.repeat(64)}`
    writeFileSync(mismatched.evidencePath, `${JSON.stringify(mismatched.evidence)}\n`)
    expect(verify(mismatched.evidencePath).stderr).toContain('runtime fingerprint is not bound')
  }, 120_000)
})
