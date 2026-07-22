import { describe, expect, it } from 'vitest'

import { getMaintainedCandidateProfile } from '../../scripts/maintained-candidate-apps.mjs'

describe('maintained candidate-test profiles', () => {
  it('selects the exact Nuxt matrix through its reviewed descriptor', () => {
    const selected = getMaintainedCandidateProfile('nuxt')
    expect(selected.descriptor).toMatchObject({
      id: 'nuxt',
      packageName: 'better-convex-nuxt',
      profiles: { candidateTests: 'nuxt-maintained-consumers' },
    })
    expect(selected.profile).toEqual({
      kind: 'apps',
      browserRunners: ['scripts/check-nuxt-lifecycle-consumer.mjs'],
      companionPackages: ['vue'],
      npmConsumer: {
        name: 'npm-consumer-smoke',
        path: 'test/fixtures/consumer-smoke',
      },
      pnpmApps: [
        { name: 'demo', path: 'demo' },
        { name: 'agency', path: 'starters/agency' },
        { name: 'agentic-saas', path: 'starters/agentic-saas' },
        { name: 'mcp-oauth-agent', path: 'starters/mcp-oauth-agent' },
        { name: 'public', path: 'starters/public' },
        { name: 'team', path: 'starters/team' },
      ],
      tarballFilename: 'better-convex-nuxt.tgz',
    })
  })

  it('returns immutable profile data', () => {
    const selected = getMaintainedCandidateProfile('nuxt')
    expect(Object.isFrozen(selected)).toBe(true)
    expect(Object.isFrozen(selected.profile)).toBe(true)
    expect(Object.isFrozen(selected.profile.pnpmApps)).toBe(true)
    expect(Object.isFrozen(selected.profile.pnpmApps[0])).toBe(true)
    expect(Object.isFrozen(selected.profile.companionPackages)).toBe(true)
    expect(Object.isFrozen(selected.profile.browserRunners)).toBe(true)
  })

  it('selects the closed Vue runner matrix through its reviewed descriptor', () => {
    const selected = getMaintainedCandidateProfile('vue')
    expect(selected.descriptor).toMatchObject({
      id: 'vue',
      packageName: 'better-convex-vue',
      profiles: { candidateTests: 'vue-maintained-consumers' },
    })
    expect(selected.profile).toEqual({
      kind: 'runners',
      runners: [
        'scripts/check-vue-anonymous-consumer.mjs',
        'scripts/check-vue-auth-consumer.mjs',
        'scripts/check-vue-embedded-consumer.mjs',
      ],
      tarballFilename: 'better-convex-vue.tgz',
    })
    expect(Object.isFrozen(selected.profile.runners)).toBe(true)
  })

  it('selects the closed MCP exact-tarball consumer through its reviewed descriptor', () => {
    const selected = getMaintainedCandidateProfile('mcp')
    expect(selected.descriptor).toMatchObject({
      id: 'mcp',
      packageName: '@better-convex/mcp',
      profiles: { candidateTests: 'mcp-maintained-consumers' },
    })
    expect(selected.profile).toEqual({
      kind: 'runners',
      runners: [
        'scripts/check-mcp-package-consumer.mjs',
        'scripts/check-mcp-better-auth-consumer.mjs',
        'scripts/check-mcp-external-convex-consumer.mjs',
      ],
      tarballFilename: 'better-convex-mcp.tgz',
    })
  })

  it('rejects package IDs outside the certification manifest', () => {
    expect(() => getMaintainedCandidateProfile('react')).toThrow(
      'Unknown package certification descriptor: react',
    )
  })
})
