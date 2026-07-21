#!/usr/bin/env node

import { execFileSync } from 'node:child_process'
import path from 'node:path'

import { getPackageArtifactCoordinates } from './package-artifact-coordinates.mjs'

const root = path.resolve(import.meta.dirname, '..')
const arguments_ = process.argv.slice(2)
const releasePackageId = 'nuxt'

function fail(message) {
  throw new Error(`[release-verify] ${message}`)
}

function run(command, args, options = {}) {
  console.log(`\n> ${[command, ...args].join(' ')}`)
  execFileSync(command, args, {
    cwd: root,
    env: options.env ?? process.env,
    stdio: 'inherit',
  })
}

function main() {
  if (arguments_.length !== 2 || arguments_[0] !== '--artifact-manifest') {
    fail('usage: pnpm release:verify --artifact-manifest <artifact.json>')
  }

  const artifactCoordinates = getPackageArtifactCoordinates(releasePackageId, {
    repositoryRoot: root,
  })
  const evidencePath = path.resolve(root, arguments_[1])
  if (evidencePath !== artifactCoordinates.paths.evidence) {
    fail(
      `artifact manifest must be the reviewed ${releasePackageId} coordinate: ${artifactCoordinates.relativePaths.evidence}`,
    )
  }
  run('node', ['scripts/release.mjs', 'verify', evidencePath])
  const tarball = artifactCoordinates.paths.tarball

  console.log('\n[release-verify] Source-integrity and source-runtime behavior gates')
  // These gates intentionally exercise the checked-out source. They never pack
  // and must not be described as tests of installed candidate bytes.
  run('pnpm', ['run', 'check'])
  run('pnpm', ['run', 'check:asvs'])
  run('pnpm', ['run', 'check:sbom'])
  run('pnpm', ['run', 'test:e2e:full'], {
    env: { ...process.env, CONVEX_E2E_AUTO_START: 'true', BCN_E2E_REQUIRE_LOCAL: 'true' },
  })
  run('pnpm', ['run', 'test:dast:proxy'])
  run('pnpm', ['run', 'check:auth-advisories'])

  console.log(
    '\n[release-verify] Hybrid auth gates (source behavior plus explicit candidate input)',
  )
  run('pnpm', ['run', 'verify:auth'], {
    env: { ...process.env, BCN_RELEASE_TARBALL: tarball },
  })

  console.log('\n[release-verify] Artifact-dependent package and consumer gates')
  // These gates consume the one manifest-selected tarball and are forbidden
  // from discovering or packing a replacement candidate.
  run(
    'node',
    ['scripts/check-package-exports.mjs', '--package', releasePackageId, '--tarball', tarball],
    {
      env: { ...process.env, BCN_RELEASE_PRODUCTION_AUDIT: 'true' },
    },
  )
  run('node', ['scripts/check-auth-provenance.mjs', '--tarball', tarball])
  run('node', [
    'scripts/check-candidate-apps.mjs',
    '--package',
    releasePackageId,
    '--tarball',
    tarball,
  ])

  console.log(
    `\n[release-verify] PASS: source gates ran from the checkout; artifact-dependent gates consumed ${tarball}; no gate repacked the candidate.`,
  )
}

try {
  main()
} catch (error) {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
}
