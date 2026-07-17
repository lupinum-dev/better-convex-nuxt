import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

const root = resolve(import.meta.dirname, '../..')

function read(path: string) {
  return readFileSync(resolve(root, path), 'utf8')
}

describe('trusted prerelease workflow', () => {
  const workflow = read('.github/workflows/publish-prerelease.yml')
  const ciWorkflow = read('.github/workflows/ci.yml')
  const cloudGate = read('scripts/run-auth-cloud-staging.mjs')
  const releaseVerify = read('scripts/verify-release.mjs')

  it('builds one artifact and passes the same bytes through verification and publication', () => {
    expect(workflow.match(/pnpm release:artifact/g)).toHaveLength(1)
    expect(workflow).toContain('name: release-candidate')
    expect(workflow).toContain('pnpm release:verify --artifact-manifest')
    expect(workflow.match(/node scripts\/release\.mjs verify/g)).toHaveLength(1)
    expect(workflow).toContain('cmp --silent')
    expect(workflow).toContain('`${pkg.name}-${pkg.version}.tgz`')
    expect(workflow).not.toContain('value.tarball.file')
    expect(read('scripts/verify-release.mjs')).toContain(
      "['run', 'check:candidate-apps', '--tarball', tarball]",
    )
    expect(releaseVerify).toContain('Source-integrity and source-runtime behavior gates')
    expect(releaseVerify).toContain('Artifact-dependent package and consumer gates')
    expect(releaseVerify).toContain('source gates ran from the checkout')
    expect(releaseVerify).not.toContain('every release suite')
    expect(workflow).not.toContain('npm publish .')
  })

  it('uses exact release tooling and commit-pinned artifact actions', () => {
    expect(workflow).toContain("RELEASE_NODE_VERSION: '22.14.0'")
    expect(workflow).toContain("RELEASE_NPM_VERSION: '11.5.1'")
    expect(workflow.match(/corepack@0\.34\.5 && corepack enable/g)).toHaveLength(4)
    expect(workflow).toContain('actions/upload-artifact@043fb46d1a93c77aae656e7c1c64a875d1fc6a0a')
    expect(workflow).toContain('actions/download-artifact@3e5f45b2cfb9172054b4087a40e8e0b5a5461e7c')
    expect(workflow).not.toMatch(/uses:\s+\S+@v\d/u)
  })

  it('gives the full release graph its verified 120-minute CI budget', () => {
    const releaseGate = ciWorkflow.slice(ciWorkflow.indexOf('  release-gate:'))
    expect(releaseGate).toContain('timeout-minutes: 120')
    expect(releaseGate).toContain('run: pnpm release:prepare')
  })

  it('gates the artifact verification chain on release-ref secret and CodeQL scans', () => {
    expect(workflow).toContain('release-security:')
    expect(workflow).toContain('needs: [build-artifact, release-security]')
    expect(workflow).toContain(
      'trufflesecurity/trufflehog@27b0417c16317ca9a472a9a8092acce143b49c55',
    )
    expect(workflow).toContain('github/codeql-action/init@99df26d4f13ea111d4ec1a7dddef6063f76b97e9')
    expect(workflow).toContain(
      'github/codeql-action/analyze@99df26d4f13ea111d4ec1a7dddef6063f76b97e9',
    )
    expect(workflow.match(/security-events: write/g)).toHaveLength(1)
  })

  it('limits OIDC publication authority to the protected publish job', () => {
    const publishJob = workflow.slice(workflow.indexOf('  publish:'))
    expect(workflow.match(/id-token: write/g)).toHaveLength(1)
    expect(workflow).toContain('environment: npm-release')
    expect(workflow).toContain('npm publish "${{ steps.artifact.outputs.tarball }}"')
    expect(workflow).toContain("NPM_CONFIG_PROVENANCE: 'true'")
    expect(workflow).not.toContain('NODE_AUTH_TOKEN')
    expect(workflow).not.toContain('NPM_TOKEN')
    expect(workflow).not.toContain('npm-token')
    expect(publishJob.indexOf('pnpm install --frozen-lockfile')).toBeLessThan(
      publishJob.indexOf('node scripts/release.mjs verify'),
    )
  })

  it('blocks publication on the protected named cloud-staging report', () => {
    expect(workflow).toContain('bcn-auth-staging:')
    expect(workflow).toContain('environment: bcn-auth-staging')
    expect(workflow).toContain('group: bcn-auth-staging')
    expect(workflow).toContain('needs: [verify-artifact, bcn-auth-staging]')
    expect(workflow).toContain('pnpm test:auth-cloud-staging')
    expect(workflow).not.toContain('pnpm test:auth-cloud-staging --\n')
    expect(workflow).toContain(
      'CONVEX_DEPLOY_KEY: ${{ secrets.BCN_AUTH_STAGING_CONVEX_DEPLOY_KEY }}',
    )
    expect(workflow).toContain('BCN_AUTH_STAGING_TEAM: ${{ vars.BCN_AUTH_STAGING_TEAM }}')
    expect(workflow.match(/BCN_AUTH_STAGING_CONVEX_DEPLOY_KEY/g)).toHaveLength(1)
    expect(workflow.match(/^\s+BCN_AUTH_STAGING_EMAIL:/gmu)).toHaveLength(1)
    expect(workflow.match(/^\s+BCN_AUTH_STAGING_INGRESS_LEASE:/gmu)).toHaveLength(1)
    expect(workflow.match(/^\s+BCN_AUTH_STAGING_PASSWORD:/gmu)).toHaveLength(1)
    expect(workflow).toContain(
      'Install and deploy the exact candidate, then run protected cloud-staging races',
    )
    expect(workflow).toContain('name: bcn-auth-staging-report')
    expect(workflow).toContain('path: .release-artifacts/bcn-auth-staging.report.json')
    expect(cloudGate).toContain("fixturePackage.dependencies['better-convex-nuxt'] =")
    expect(cloudGate).toContain('artifact.tarballPath')
    expect(cloudGate).toContain("'deploy',")
    expect(cloudGate).toContain('normalizeCloudPrewriteProof(prewriteProof, expectedProof)')
    expect(cloudGate).toContain('closedIngressProved: true')
    expect(cloudGate).toContain('acceptedByConvex: true')
    expect(cloudGate).toContain('authProxyFingerprintMatched: true')
    expect(cloudGate).toContain('mcpProxyFingerprintMatched: true')
    expect(cloudGate).toContain("'AUTH_CLOUD_STAGING_POST_CLEANUP_STATE_NOT_EMPTY'")
    expect(cloudGate).toContain('await client.mutation(releaseProofFunctions.cleanup, {})')
    expect(cloudGate).not.toContain('process.env.BCN_RELEASE_')
    expect(workflow).not.toContain('BCN_RELEASE_ARTIFACT_SHA256')
    expect(workflow).not.toContain('preview-create')
    expect(workflow).not.toContain('continue-on-error: true')
    expect(workflow).not.toContain('if: always()')
  })

  it('blocks unnamed governance and stable versions', () => {
    expect(workflow).toContain('BCN_SECURITY_OWNER')
    expect(workflow).toContain('BCN_SECURITY_DEPUTY')
    expect(workflow).toContain('BCN_SECURITY_NOTIFICATION_TESTED_AT')
    expect(workflow).toContain('pnpm check:security-governance --prerelease')
    expect(read('scripts/check-security-governance.mjs')).toContain("!packageVersion.includes('-')")
  })

  it('passes script options directly under the pinned pnpm CLI', () => {
    const sources = [
      workflow,
      read('.github/workflows/ci.yml'),
      read('.github/workflows/security-extended.yml'),
      read('package.json'),
      read('scripts/release.mjs'),
      read('scripts/verify-release.mjs'),
      read('RELEASING.md'),
      read('test/TESTING.md'),
    ].join('\n')

    expect(sources).not.toMatch(/pnpm [^\n]* -- --[\w-]+/u)
    expect(sources).not.toMatch(/pnpm [^\n]* --\n\s+--[\w-]+/u)
  })

  it('keeps workstation instructions non-publishing', () => {
    const instructions = read('RELEASING.md')
    expect(instructions).toContain('must never publish')
    expect(instructions).toMatch(/Require two-factor authentication and disallow\s+tokens/u)
    expect(instructions).not.toMatch(/^npm publish /mu)
    expect(instructions).not.toMatch(/^pnpm publish /mu)
    expect(instructions).not.toMatch(/^npm dist-tag /mu)
  })
})
