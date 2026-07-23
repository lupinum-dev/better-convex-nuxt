import { getPackageCertificationDescriptor } from './package-certification-manifest.mjs'

const candidateTestProfiles = Object.freeze({
  'nuxt-maintained-consumers': Object.freeze({
    kind: 'apps',
    browserRunners: Object.freeze(['scripts/check-nuxt-lifecycle-consumer.mjs']),
    companionPackages: Object.freeze(['vue']),
    npmConsumer: Object.freeze({
      name: 'npm-consumer-smoke',
      path: 'test/fixtures/consumer-smoke',
    }),
    pnpmApps: Object.freeze(
      [
        { name: 'demo', path: 'demo' },
        { name: 'agency', path: 'starters/agency' },
        { name: 'agentic-saas', path: 'starters/agentic-saas' },
        {
          name: 'mcp-oauth-agent',
          path: 'starters/mcp-oauth-agent',
          companionPackages: Object.freeze(['mcp']),
        },
        { name: 'public', path: 'starters/public' },
        { name: 'team', path: 'starters/team' },
      ].map(Object.freeze),
    ),
    tarballFilename: 'better-convex-nuxt.tgz',
  }),
  'vue-maintained-consumers': Object.freeze({
    kind: 'runners',
    runners: Object.freeze([
      'scripts/check-vue-anonymous-consumer.mjs',
      'scripts/check-vue-auth-consumer.mjs',
      'scripts/check-vue-embedded-consumer.mjs',
    ]),
    tarballFilename: 'better-convex-vue.tgz',
  }),
  'mcp-maintained-consumers': Object.freeze({
    kind: 'runners',
    runners: Object.freeze([
      'scripts/check-mcp-package-consumer.mjs',
      'scripts/check-mcp-better-auth-consumer.mjs',
      'scripts/check-mcp-external-convex-consumer.mjs',
    ]),
    tarballFilename: 'better-convex-mcp.tgz',
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
  const fields = Object.keys(fixture).sort().join(',')
  if (
    fields !== 'name,path' &&
    !(
      fields === 'companionPackages,name,path' &&
      fixture.name === 'mcp-oauth-agent' &&
      Array.isArray(fixture.companionPackages) &&
      JSON.stringify(fixture.companionPackages) === JSON.stringify(['mcp'])
    )
  ) {
    throw new Error(`Candidate-test profile has an invalid ${label} fixture contract.`)
  }
}

function assertCandidateTestProfile(profile, profileId) {
  if (profile?.kind === 'runners') {
    const reviewedRunners = {
      'vue-maintained-consumers': [
        'scripts/check-vue-anonymous-consumer.mjs',
        'scripts/check-vue-auth-consumer.mjs',
        'scripts/check-vue-embedded-consumer.mjs',
      ],
      'mcp-maintained-consumers': [
        'scripts/check-mcp-package-consumer.mjs',
        'scripts/check-mcp-better-auth-consumer.mjs',
        'scripts/check-mcp-external-convex-consumer.mjs',
      ],
    }[profileId]
    if (
      !reviewedRunners ||
      Object.keys(profile).sort().join(',') !== 'kind,runners,tarballFilename' ||
      !Array.isArray(profile.runners) ||
      JSON.stringify(profile.runners) !== JSON.stringify(reviewedRunners) ||
      typeof profile.tarballFilename !== 'string' ||
      !/^[a-z0-9-]+\.tgz$/u.test(profile.tarballFilename)
    ) {
      throw new Error(`Candidate-test profile ${profileId} is invalid.`)
    }
    return
  }
  if (
    !profile ||
    typeof profile !== 'object' ||
    profile.kind !== 'apps' ||
    Object.keys(profile).sort().join(',') !==
      'browserRunners,companionPackages,kind,npmConsumer,pnpmApps,tarballFilename' ||
    !Array.isArray(profile.browserRunners) ||
    JSON.stringify(profile.browserRunners) !==
      JSON.stringify(['scripts/check-nuxt-lifecycle-consumer.mjs']) ||
    !Array.isArray(profile.companionPackages) ||
    JSON.stringify(profile.companionPackages) !== JSON.stringify(['vue']) ||
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
