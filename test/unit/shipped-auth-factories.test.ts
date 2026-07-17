import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

const repoRoot = join(import.meta.dirname, '../..')
const authApps = [
  'demo',
  'playground',
  'starters/agency',
  'starters/agentic-saas',
  'starters/mcp-agent',
  'starters/team',
] as const
const passwordApps = authApps.filter((app) => app !== 'demo')
const authEnvExamples = [
  'demo/.env.example',
  'starters/agency/.env.example',
  'starters/mcp-agent/.env.example',
  'starters/team/.env.example',
] as const
const passwordForms = [
  'playground/pages/auth/signup.vue',
  'starters/agency/app/pages/agency.vue',
  'starters/agentic-saas/app/pages/index.vue',
  'starters/mcp-agent/app/components/demo/AuthSection.vue',
  'starters/team/app/components/AuthPanel.vue',
] as const
const passwordRecipeDocs = ['docs/content/docs/3.get-started/5.add-authentication.md'] as const
const genericSignInForms = [
  'playground/pages/auth/signin.vue',
  'starters/team/app/components/AuthPanel.vue',
  'starters/mcp-agent/app/composables/useMcpDemoAuth.ts',
  'starters/agentic-saas/app/pages/index.vue',
] as const

function read(path: string): string {
  return readFileSync(join(repoRoot, path), 'utf8')
}

describe('shipped Better Auth factory invariants', () => {
  it.each(authApps)('%s fails closed on runtime secret and unsafe application origins', (app) => {
    const auth = read(`${app}/convex/auth.ts`)

    expect(auth).toContain("requireAuthOrigin('SITE_URL')")
    expect(auth).toContain("requireAuthOrigin('CONVEX_SITE_URL')")
    expect(auth).toContain("throw new Error('BETTER_AUTH_SECRETS is required')")
    expect(auth).not.toContain('BETTER_AUTH_SECRET ??')
    expect(auth).not.toContain('secret: process.env')
    expect(auth).toContain('trustedOrigins: [siteUrl]')
    expect(auth).toContain("ipAddressHeaders: ['x-bcn-verified-client-ip']")
    expect(auth).toContain("throw new Error('AUTH_CONFIG_INVALID')")
  })

  it('keeps Better Auth secrets out of Nuxt env examples and clears legacy schema aliases', () => {
    const schemaCli = read('src/runtime/cli/auth-schema.ts')

    for (const path of authEnvExamples) {
      expect(read(path)).not.toMatch(/^BETTER_AUTH_SECRETS=/mu)
    }
    expect(schemaCli).toContain("'AUTH_SECRET'")
    expect(schemaCli).toContain("'BETTER_AUTH_SECRET'")
    expect(schemaCli).toContain("'BETTER_AUTH_SECRETS'")
  })

  it.each(authApps)('%s registers only the lazy Better Auth HTTP ceremony', (app) => {
    const http = read(`${app}/convex/http.ts`)

    expect(http).toContain('authComponent.registerRoutes(http, createAuth)')
    expect(http).not.toContain('registerRoutesLazy')
  })

  it.each(passwordApps)('%s enforces the supported 15-character password floor', (app) => {
    const auth = read(`${app}/convex/auth.ts`)
    expect(auth).toContain('minPasswordLength: 15')
    expect(auth).toContain('autoSignIn: false')
  })

  it.each(passwordForms)('%s matches the backend password floor', (form) => {
    expect(read(form)).toContain('minlength="15"')
    expect(read(form)).not.toContain('minlength="8"')
  })

  it('does not prefill reusable passwords in maintained starter UI', () => {
    const agentic = read('starters/agentic-saas/app/pages/index.vue')
    const mcp = read('starters/mcp-agent/app/composables/useMcpDemoAuth.ts')

    expect(agentic).toContain("const ownerPassword = ref('')")
    expect(mcp).toContain("const password = ref('')")
    expect(agentic).not.toContain("const ownerPassword = ref('Password")
    expect(mcp).not.toContain("const password = ref('Password")
  })

  it.each(passwordRecipeDocs)('%s keeps copyable password factories hardened', (path) => {
    const source = read(path)
    const factoryCount = source.match(/emailAndPassword:\s*\{/g)?.length ?? 0

    expect(factoryCount).toBeGreaterThan(0)
    expect(source.match(/minPasswordLength:\s*15/g)).toHaveLength(factoryCount)
    expect(source.match(/autoSignIn:\s*false/g)).toHaveLength(factoryCount)
    expect(source.match(/secret\.length < 32/g)).toHaveLength(factoryCount)
    expect(source).not.toContain('estimatedEntropy')
    expect(source.match(/at least 32 random characters/g)).toHaveLength(factoryCount)
  })

  it('keeps canonical signup recipes on the explicit sign-in ceremony', () => {
    const guide = read('docs/content/docs/3.get-started/5.add-authentication.md')
    const operationsGuide = read(
      'docs/content/docs/4.build/3.authentication/4.sign-in-and-sign-out.md',
    )

    expect(guide).toContain('autoSignIn: false')
    expect(guide).toContain('Account created. Sign in next.')
    expect(guide).not.toContain('await refresh()')
    expect(operationsGuide).toContain(
      'email verification and `autoSignIn` determine the next product step',
    )
  })

  it('does not expose Better Auth account-state errors in maintained sign-in UI', () => {
    const genericMessage =
      'Sign in could not be completed. Check your credentials and verify your email if required.'
    const guide = read('docs/content/docs/3.get-started/5.add-authentication.md')
    const operationsGuide = read(
      'docs/content/docs/4.build/3.authentication/4.sign-in-and-sign-out.md',
    )

    for (const path of genericSignInForms) {
      expect(read(path)).toContain(genericMessage)
    }
    expect(guide).toContain("'Sign in failed'")
    expect(guide).not.toContain('result.error.message')
    expect(operationsGuide).toContain('Sign in could not be completed')
    expect(operationsGuide).not.toContain('result.error.message')
    expect(operationsGuide).not.toContain("console.error('Sign in failed:', error.message)")
    expect(read('playground/pages/auth/signin.vue')).not.toContain('result.error.message')
    expect(read('starters/team/app/components/AuthPanel.vue')).not.toContain('result.error.message')
    expect(read('starters/mcp-agent/app/composables/useMcpDemoAuth.ts')).not.toContain(
      'result.error.message',
    )
    expect(read('starters/agentic-saas/app/pages/index.vue')).not.toContain(
      "new Error(error.message || 'Sign in failed')",
    )
  })

  it('documents password blocklist and distributed abuse-control ownership', () => {
    const security = read('SECURITY.md')

    expect(security).toContain('breached/common-password blocklist')
    expect(security).toContain('process-local defense in depth')
    expect(security).toContain('trusted-ingress per-account and per-IP limiter')
  })

  it('keeps route components on the app-lifetime session observer', () => {
    const authStateGuide = read(
      'docs/content/docs/4.build/3.authentication/3.auth-state-and-user.md',
    )

    expect(authStateGuide).toContain('do not mount `client.useSession()` in route components')
    expect(authStateGuide).not.toContain('typed `client.useSession()` fields')
  })

  it('keeps plugin guidance from becoming a second auth-factory source', () => {
    const pluginGuide = read('docs/content/docs/4.build/3.authentication/7.better-auth-plugins.md')

    expect(pluginGuide).toContain("Use the repository's `starters/team/convex/betterAuth`")
    expect(pluginGuide).not.toContain('export function createAuthOptions')
  })

  it('keeps schema-changing plugin docs on the maintained factory source', () => {
    const setupGuide = read('docs/content/docs/4.build/3.authentication/2.better-auth-setup.md')
    const pluginGuide = read('docs/content/docs/4.build/3.authentication/7.better-auth-plugins.md')

    expect(setupGuide).toContain('complete minimal versions are in [Add authentication]')
    expect(pluginGuide).not.toContain('export function createAuthOptions')
    expect(pluginGuide).not.toContain('createAuth({} as never)')
  })

  it('does not trust wildcard origins in the runnable playground', () => {
    const auth = read('playground/convex/auth.ts')

    expect(auth).toContain('trustedOrigins: [siteUrl]')
    expect(auth).not.toContain('http://localhost:*')
    expect(auth).not.toContain('http://127.0.0.1:*')
  })

  it('keeps schema-only placeholders out of the MCP request factory', () => {
    const auth = read('starters/mcp-agent/convex/auth.ts')

    expect(auth).not.toContain('localSecret')
    expect(auth).not.toContain('createAuthOptions')
    expect(auth).not.toMatch(/BETTER_AUTH_SECRET\s*\?\?/)
  })

  it('pins the conservative demo OAuth storage and account-linking policy', () => {
    const auth = read('demo/convex/auth.ts')

    expect(auth).toContain("throw new Error('GITHUB_CLIENT_ID is required')")
    expect(auth).toContain("throw new Error('GITHUB_CLIENT_SECRET is required')")
    expect(auth).toContain('encryptOAuthTokens: true')
    expect(auth).toContain('disableImplicitLinking: true')
    expect(auth).toContain('trustedProviders: []')
    expect(auth).toContain('allowDifferentEmails: false')
    expect(auth).toContain('allowUnlinkingAll: false')
  })

  it('keeps the agency identity-to-domain-user path rebuildable and usable', () => {
    const auth = read('starters/agency/convex/auth.ts')
    const page = read('starters/agency/app/pages/agency.vue')

    // Agency users are stable domain actors referenced by tenant and audit
    // records, not disposable display projections. Assert the required
    // lifecycle behavior without coupling this guard to the generic helper.
    expect(auth).toContain('syncAgencyUserActor(ctx, user as BetterAuthUserDocLike, true)')
    expect(auth).toContain('syncAgencyUserActor(ctx, user as BetterAuthUserDocLike, false)')
    expect(auth).toContain('syncAgencyUserActor(ctx, { id: String(user.id) }, false)')
    expect(auth).toContain('rebuildUserProjectionBatch = internalMutation')
    expect(page).toContain('useConvexAuth()')
    expect(page).toContain('await signUp.email')
    expect(page).toContain('await signIn.email')
    expect(page).not.toContain('await refresh()')
  })

  it('escapes dynamic Team transactional-email HTML at the delivery boundary', () => {
    const auth = read('starters/team/convex/auth.ts')
    const delivery = read('starters/team/convex/lib/authEmail.ts')

    expect(auth).toContain('escapeEmailHtml(inviterName)')
    expect(auth).toContain('escapeEmailHtml(data.organization.name)')
    expect(auth).toContain('escapeEmailHtml(link)')
    expect(auth).toContain('escapeEmailHtml(data.url)')
    expect(delivery).toMatch(/value\.replace\(\s*\/\[&<>"'\]\/g/)
    expect(delivery).not.toContain("process.env.ALLOW_TEST_RESET === 'true'")
  })
})
