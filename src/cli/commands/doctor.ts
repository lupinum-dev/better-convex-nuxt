import { resolve } from 'node:path'

import { spinner } from '@clack/prompts'
import { defineCommand } from 'citty'
import consola from 'consola'

import type { DoctorFinding, DoctorReport } from '../lib/findings.js'
import { summarizeFindings } from '../lib/findings.js'
import { renderDoctorReport } from '../lib/output.js'
import {
  findConvexUrlSource,
  findEnvKeySource,
  findConvexHttpSource,
  findLegacyApiUsages,
  hasBetterConvexNuxtRegistration,
  hasBetterAuthRouteRegistration,
  hasDependency,
  inspectProject,
  isAuthExplicitlyDisabled,
  usesTrustedCallerSurfaces,
} from '../lib/project.js'

export interface DoctorCommandOptions {
  cwd?: string
  json?: boolean
  verbose?: boolean
  color?: boolean
}

function createDoctorFindings(cwd: string): DoctorFinding[] {
  const project = inspectProject(cwd)
  const isNuxtApp = Boolean(project.packageJsonPath && project.nuxtConfigPath)
  const convexUrlSource = findConvexUrlSource(project)
  const authDisabled = isAuthExplicitlyDisabled(project)
  const authExpected = isNuxtApp && !authDisabled
  const siteUrlSource = findEnvKeySource(project, ['SITE_URL', 'NUXT_PUBLIC_SITE_URL'])
  const convexSiteUrlSource = findEnvKeySource(project, [
    'CONVEX_SITE_URL',
    'NUXT_PUBLIC_CONVEX_SITE_URL',
  ])
  const betterAuthSecretSource = findEnvKeySource(project, ['BETTER_AUTH_SECRET'])
  const convexHttpSource = findConvexHttpSource(project)
  const hasAuthRoutes = hasBetterAuthRouteRegistration(project)
  const trustedCallerExpected = usesTrustedCallerSurfaces(project)
  const trustedCallerKeySource = findEnvKeySource(project, ['CONVEX_TRUSTED_CALLER_KEY'])
  const legacyApiUsages = findLegacyApiUsages(project)
  const legacyUsageSummary = legacyApiUsages
    .slice(0, 3)
    .map((usage) => `${usage.id} in ${usage.path}`)
    .join('\n')

  return [
    {
      id: 'nuxt-app-root',
      category: 'core',
      title: 'Nuxt app structure',
      status: isNuxtApp ? 'pass' : 'fail',
      message: isNuxtApp
        ? `Found package.json and ${project.nuxtConfigPath?.split('/').pop()}.`
        : 'Expected package.json and a nuxt.config.* file in the target directory.',
      fixHint: isNuxtApp
        ? 'Run the CLI inside a Nuxt app root when checking consumer setup.'
        : 'Run the command in a Nuxt project root or pass --cwd <path>.',
    },
    {
      id: 'nuxt-installed',
      category: 'core',
      title: 'Nuxt dependency',
      status: hasDependency(project, 'nuxt') ? 'pass' : 'fail',
      message: hasDependency(project, 'nuxt')
        ? 'nuxt is declared in package.json.'
        : 'nuxt is not declared in dependencies or devDependencies.',
      fixHint: hasDependency(project, 'nuxt')
        ? 'Keep Nuxt installed in the consumer app.'
        : 'Add nuxt to the app package.json.',
    },
    {
      id: 'module-installed',
      category: 'core',
      title: '@lupinum/trellis dependency',
      status: hasDependency(project, '@lupinum/trellis') ? 'pass' : 'fail',
      message: hasDependency(project, '@lupinum/trellis')
        ? '@lupinum/trellis is declared in package.json.'
        : '@lupinum/trellis is not declared in dependencies or devDependencies.',
      fixHint: hasDependency(project, '@lupinum/trellis')
        ? 'Keep the module installed in the consumer app.'
        : 'Add @lupinum/trellis to the app package.json.',
    },
    {
      id: 'module-registered',
      category: 'core',
      title: 'Nuxt module registration',
      status: hasBetterConvexNuxtRegistration(project) ? 'pass' : 'fail',
      message: hasBetterConvexNuxtRegistration(project)
        ? 'nuxt.config registers @lupinum/trellis in modules.'
        : 'Could not find "@lupinum/trellis" inside the nuxt.config modules array.',
      fixHint: hasBetterConvexNuxtRegistration(project)
        ? 'Keep the module in the Nuxt modules array.'
        : 'Add "@lupinum/trellis" to modules in nuxt.config.*.',
    },
    {
      id: 'convex-installed',
      category: 'core',
      title: 'Convex dependency',
      status: hasDependency(project, 'convex') ? 'pass' : 'fail',
      message: hasDependency(project, 'convex')
        ? 'convex is declared in package.json.'
        : 'convex is not declared in dependencies or devDependencies.',
      fixHint: hasDependency(project, 'convex')
        ? 'Keep Convex installed in the consumer app.'
        : 'Add convex to the app package.json.',
    },
    {
      id: 'convex-url-configured',
      category: 'core',
      title: 'Convex URL source',
      status: convexUrlSource ? 'pass' : 'warn',
      message: convexUrlSource
        ? `Found Convex URL configuration in ${convexUrlSource}.`
        : 'No CONVEX_URL or NUXT_PUBLIC_CONVEX_URL source was found.',
      fixHint: convexUrlSource
        ? 'Keep the Convex URL available in the environment or env files.'
        : 'Add CONVEX_URL or NUXT_PUBLIC_CONVEX_URL to .env.local, .env, or the process environment.',
    },
    {
      id: 'site-url-configured',
      category: 'auth',
      title: 'SITE_URL source',
      status: authExpected ? (siteUrlSource ? 'pass' : 'warn') : 'pass',
      message: !authExpected
        ? 'Auth is explicitly disabled in nuxt.config.'
        : siteUrlSource
          ? `Found SITE_URL configuration in ${siteUrlSource.source}.`
          : 'No SITE_URL or NUXT_PUBLIC_SITE_URL source was found.',
      fixHint: !authExpected
        ? 'No action needed unless you enable auth later.'
        : siteUrlSource
          ? 'Keep SITE_URL aligned with your app origin.'
          : 'Add SITE_URL (or NUXT_PUBLIC_SITE_URL) for Better Auth callbacks and trusted-origin checks.',
    },
    {
      id: 'convex-site-url-configured',
      category: 'auth',
      title: 'Convex site URL source',
      status: authExpected ? (convexSiteUrlSource ? 'pass' : 'warn') : 'pass',
      message: !authExpected
        ? 'Auth is explicitly disabled in nuxt.config.'
        : convexSiteUrlSource
          ? `Found Convex site URL configuration in ${convexSiteUrlSource.source}.`
          : 'No CONVEX_SITE_URL or NUXT_PUBLIC_CONVEX_SITE_URL source was found.',
      fixHint: !authExpected
        ? 'No action needed unless you enable auth later.'
        : convexSiteUrlSource
          ? 'Keep convex.siteUrl pointed at your Convex HTTP Actions origin.'
          : 'Add CONVEX_SITE_URL (or NUXT_PUBLIC_CONVEX_SITE_URL) when auth token exchange cannot be auto-derived reliably.',
    },
    {
      id: 'better-auth-secret-configured',
      category: 'auth',
      title: 'BETTER_AUTH_SECRET source',
      status: authExpected ? (betterAuthSecretSource ? 'pass' : 'warn') : 'pass',
      message: !authExpected
        ? 'Auth is explicitly disabled in nuxt.config.'
        : betterAuthSecretSource
          ? `Found BETTER_AUTH_SECRET configuration in ${betterAuthSecretSource.source}.`
          : 'No BETTER_AUTH_SECRET source was found in the local environment or env files.',
      fixHint: !authExpected
        ? 'No action needed unless you enable auth later.'
        : betterAuthSecretSource
          ? 'Keep BETTER_AUTH_SECRET synced with the Convex Better Auth deployment.'
          : 'Set BETTER_AUTH_SECRET in the Convex Dashboard and your local environment when using Better Auth.',
    },
    {
      id: 'better-auth-routes-registered',
      category: 'auth',
      title: 'Better Auth route registration',
      status: authExpected ? (hasAuthRoutes ? 'pass' : 'warn') : 'pass',
      message: !authExpected
        ? 'Auth is explicitly disabled in nuxt.config.'
        : hasAuthRoutes
          ? `Found Better Auth route registration in ${convexHttpSource?.path ?? 'convex/http.ts'}.`
          : convexHttpSource
            ? `Found ${convexHttpSource.path}, but it does not appear to call authComponent.registerRoutes(...).`
            : 'Could not find convex/http.ts with Better Auth route registration.',
      fixHint: !authExpected
        ? 'No action needed unless you enable auth later.'
        : 'Register your Better Auth bridge in convex/http.ts so the Nuxt auth proxy can exchange session cookies for Convex JWTs.',
    },
    {
      id: 'trusted-caller-key-configured',
      category: 'advanced',
      title: 'Trusted caller key source',
      status: trustedCallerExpected ? (trustedCallerKeySource ? 'pass' : 'warn') : 'pass',
      message: !trustedCallerExpected
        ? 'No trusted-caller or MCP surfaces were detected in the app source.'
        : trustedCallerKeySource
          ? `Found CONVEX_TRUSTED_CALLER_KEY in ${trustedCallerKeySource.source}.`
          : 'Trusted-caller or MCP surfaces were detected, but no CONVEX_TRUSTED_CALLER_KEY source was found.',
      fixHint: !trustedCallerExpected
        ? 'No action needed unless you add MCP or trusted-caller flows later.'
        : 'Set CONVEX_TRUSTED_CALLER_KEY in the local environment and the Convex deployment that serves trusted-caller traffic.',
    },
    {
      id: 'legacy-v2-apis',
      category: 'migration',
      title: 'Removed V2 APIs',
      status: legacyApiUsages.length === 0 ? 'pass' : 'fail',
      message:
        legacyApiUsages.length === 0
          ? 'No removed V2 imports or APIs were detected.'
          : `Found removed V2 APIs:\n${legacyUsageSummary}`,
      fixHint:
        legacyApiUsages.length === 0
          ? 'Keep using the V3 auth, service, visibility, and args entrypoints.'
          : (legacyApiUsages[0]?.replacement ??
            'Replace removed V2 APIs with their V3 equivalents.'),
    },
  ]
}

export function buildDoctorReport(cwd: string): DoctorReport {
  const findings = createDoctorFindings(cwd)
  return {
    cwd,
    findings,
    summary: summarizeFindings(findings),
  }
}

export const doctorCommand = defineCommand({
  meta: {
    name: 'doctor',
    description: 'Inspect a Nuxt app for @lupinum/trellis setup issues',
  },
  args: {
    cwd: {
      type: 'string',
      description: 'Path to the Nuxt app to inspect',
      valueHint: 'path',
    },
    json: {
      type: 'boolean',
      description: 'Print the report as JSON',
      default: false,
    },
    verbose: {
      type: 'boolean',
      alias: 'v',
      description: 'Print debug details while inspecting the app',
      default: false,
    },
    color: {
      type: 'boolean',
      description: 'Enable colored output',
      default: true,
    },
  },
  async run({ args }) {
    const cwd = resolve(args.cwd || process.cwd())
    const useJson = Boolean(args.json)
    const color = Boolean(args.color)
    const logger = args.verbose ? consola.withTag('doctor') : null
    const loadingSpinner = !useJson ? spinner() : null

    if (!color) {
      process.env.NO_COLOR = '1'
    }

    logger?.debug(`Inspecting ${cwd}`)
    loadingSpinner?.start(`Inspecting ${cwd}`)

    const report = buildDoctorReport(cwd)

    loadingSpinner?.stop('Inspection complete')
    logger?.debug(`Found ${report.summary.fail} failures and ${report.summary.warn} warnings`)

    renderDoctorReport(report, {
      json: useJson,
      color,
    })

    const exitCode = report.summary.fail > 0 ? 1 : 0
    process.exitCode = exitCode
    return exitCode
  },
})
