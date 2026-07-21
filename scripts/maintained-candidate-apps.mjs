import { getPackageCertificationDescriptor } from './package-certification-manifest.mjs'

const candidateTestProfiles = Object.freeze({
  'nuxt-maintained-consumers': Object.freeze({
    npmConsumer: Object.freeze({
      name: 'npm-consumer-smoke',
      path: 'test/fixtures/consumer-smoke',
    }),
    pnpmApps: Object.freeze(
      [
        { name: 'demo', path: 'demo' },
        { name: 'agency', path: 'starters/agency' },
        { name: 'agentic-saas', path: 'starters/agentic-saas' },
        { name: 'mcp-agent', path: 'starters/mcp-agent' },
        { name: 'mcp-oauth-agent', path: 'starters/mcp-oauth-agent' },
        { name: 'public', path: 'starters/public' },
        { name: 'team', path: 'starters/team' },
      ].map(Object.freeze),
    ),
    tarballFilename: 'better-convex-nuxt.tgz',
  }),
})

function assertFixture(fixture, label) {
  if (
    !fixture ||
    typeof fixture !== 'object' ||
    typeof fixture.name !== 'string' ||
    !/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(fixture.name) ||
    typeof fixture.path !== 'string' ||
    !/^(?:demo|starters\/[a-z0-9-]+|test\/fixtures\/[a-z0-9-]+)$/u.test(fixture.path)
  ) {
    throw new Error(`Candidate-test profile has an invalid ${label} fixture.`)
  }
}

function assertCandidateTestProfile(profile, profileId) {
  if (
    !profile ||
    typeof profile !== 'object' ||
    !Array.isArray(profile.pnpmApps) ||
    profile.pnpmApps.length === 0 ||
    typeof profile.tarballFilename !== 'string' ||
    !/^[a-z0-9-]+\.tgz$/u.test(profile.tarballFilename)
  ) {
    throw new Error(`Candidate-test profile ${profileId} is invalid.`)
  }
  assertFixture(profile.npmConsumer, 'npm consumer')
  for (const app of profile.pnpmApps) assertFixture(app, 'pnpm app')
  const fixtures = [profile.npmConsumer, ...profile.pnpmApps]
  if (
    new Set(fixtures.map((fixture) => fixture.name)).size !== fixtures.length ||
    new Set(fixtures.map((fixture) => fixture.path)).size !== fixtures.length
  ) {
    throw new Error(`Candidate-test profile ${profileId} has duplicate fixtures.`)
  }
}

export function getMaintainedCandidateProfile(packageId) {
  const descriptor = getPackageCertificationDescriptor(packageId)
  const profileId = descriptor.profiles.candidateTests
  const profile = candidateTestProfiles[profileId]
  if (!profile) {
    throw new Error(`Package ${descriptor.id} has no reviewed candidate-test profile.`)
  }
  assertCandidateTestProfile(profile, profileId)
  return Object.freeze({ descriptor, profile })
}
