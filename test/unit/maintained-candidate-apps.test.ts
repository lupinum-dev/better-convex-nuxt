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
      npmConsumer: {
        name: 'npm-consumer-smoke',
        path: 'test/fixtures/consumer-smoke',
      },
      pnpmApps: [
        { name: 'demo', path: 'demo' },
        { name: 'agency', path: 'starters/agency' },
        { name: 'agentic-saas', path: 'starters/agentic-saas' },
        { name: 'mcp-agent', path: 'starters/mcp-agent' },
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
  })

  it('rejects package IDs outside the certification manifest', () => {
    expect(() => getMaintainedCandidateProfile('vue')).toThrow(
      'Unknown package certification descriptor: vue',
    )
  })
})
