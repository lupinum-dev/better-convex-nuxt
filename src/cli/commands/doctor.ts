import { resolve } from 'node:path'

import { spinner } from '@clack/prompts'
import { defineCommand } from 'citty'
import consola from 'consola'

import { collectModuleValidationFindings } from '../../analysis/validation.js'
import { resolvePermissionQuerySetup } from '../../module-internals/setup.js'
import {
  getIdentityForwardingKeyProductionIssue,
  minimumIdentityForwardingKeyLength,
} from '../../runtime/identity-forwarding/shared.js'
import type { DoctorFinding, DoctorReport } from '../lib/findings.js'
import { exitCodeForFindings, summarizeFindings } from '../lib/findings.js'
import { collectInventoryDoctorFindings } from '../lib/inventory-findings.js'
import {
  collectTrellisCliInventory,
  collectTrellisCliInventoryFacts,
  type TrellisCliInventory,
  type TrellisCliInventoryFacts,
} from '../lib/inventory.js'
import { renderDoctorReport } from '../lib/output.js'
import { collectPermissionInventoryFindings } from '../lib/permission-metadata.js'
import {
  findConvexUrlSource,
  findEnvKeySource,
  findConvexHttpSource,
  findConvexAuthSource,
  findConfiguredPermissionQueryPath,
  findMissingCanonicalLayoutPaths,
  hasBetterAuthBootstrapExport,
  hasBetterConvexNuxtRegistration,
  hasBetterAuthRouteRegistration,
  hasDependency,
  inspectProject,
  isAuthExplicitlyEnabled,
  usesTrellisUsersTable,
  type ProjectInspection,
} from '../lib/project.js'

function toDoctorFindingTitle(id: string): string {
  switch (id) {
    case 'isolation-valid':
      return 'Tenant classification validity'
    case 'isolation-table-coverage':
      return 'Tenant classification coverage'
    case 'destructive-safety-schema':
      return 'Destructive safety schema'
    case 'auth-enabled-consistency':
      return 'Auth enabled consistency'
    default:
      return id
  }
}

function createDoctorFindings(
  project: ProjectInspection,
  inventory: TrellisCliInventory,
  inventoryFacts: TrellisCliInventoryFacts,
): DoctorFinding[] {
  const cwd = project.cwd
  const isNuxtApp = Boolean(project.packageJsonPath && project.nuxtConfigPath)
  const missingCanonicalLayoutPaths = isNuxtApp ? findMissingCanonicalLayoutPaths(project) : []
  const convexUrlSource = findConvexUrlSource(project)
  const authExpected = isNuxtApp && isAuthExplicitlyEnabled(project)
  const siteUrlSource = findEnvKeySource(project, ['SITE_URL', 'NUXT_PUBLIC_SITE_URL'])
  const convexSiteUrlSource = findEnvKeySource(project, [
    'CONVEX_SITE_URL',
    'NUXT_PUBLIC_CONVEX_SITE_URL',
  ])
  const betterAuthSecretSource = findEnvKeySource(project, ['BETTER_AUTH_SECRET'])
  const convexHttpSource = findConvexHttpSource(project)
  const hasAuthRoutes = hasBetterAuthRouteRegistration(project)
  const convexAuthSource = findConvexAuthSource(project)
  const expectsTrellisUsers = usesTrellisUsersTable(project)
  const hasAuthBootstrap = hasBetterAuthBootstrapExport(project)
  const identityForwardingExpected = inventory.forwarding.expected
  const identityForwardingKeySource = findEnvKeySource(project, ['CONVEX_IDENTITY_FORWARDING_KEY'])
  const identityForwardingKeyIssue = identityForwardingKeySource
    ? getIdentityForwardingKeyProductionIssue(identityForwardingKeySource.value, 'production')
    : null
  const usesPermissions = inventoryFacts.usesPermissions
  const configuredPermissionQueryPath = findConfiguredPermissionQueryPath(project)
  let permissionQueryResolutionError: Error | null = null

  if (configuredPermissionQueryPath) {
    try {
      resolvePermissionQuerySetup(cwd, configuredPermissionQueryPath)
    } catch (error) {
      permissionQueryResolutionError = error instanceof Error ? error : new Error(String(error))
    }
  }

  const baseFindings: DoctorFinding[] = [
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
      id: 'canonical-layout',
      category: 'core',
      title: 'Canonical Trellis layout',
      status: !isNuxtApp ? 'pass' : missingCanonicalLayoutPaths.length === 0 ? 'pass' : 'fail',
      message: !isNuxtApp
        ? 'Skipping canonical layout checks because this is not a Nuxt app root.'
        : missingCanonicalLayoutPaths.length === 0
          ? 'Found the canonical convex/, shared/features/, app/pages/, and server/ layout.'
          : `Missing canonical paths: ${missingCanonicalLayoutPaths.join(', ')}.`,
      fixHint: !isNuxtApp
        ? 'Run doctor inside a generated Trellis app root.'
        : missingCanonicalLayoutPaths.length === 0
          ? 'Keep the generated Trellis layout intact.'
          : 'Restore the missing canonical paths or recreate the app with `trellis init <name> --template public|personal|workspace|workspace-mcp`.',
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
      id: 'trellis-auth-bootstrap-exported',
      category: 'auth',
      title: 'Trellis auth bootstrap export',
      status: authExpected && expectsTrellisUsers ? (hasAuthBootstrap ? 'pass' : 'warn') : 'pass',
      message: !authExpected
        ? 'Auth is explicitly disabled in nuxt.config.'
        : !expectsTrellisUsers
          ? 'No Trellis users-table pattern was detected in the app source.'
          : hasAuthBootstrap
            ? `Found createUserIfNeeded export in ${convexAuthSource?.path ?? 'convex/auth.ts'}.`
            : convexAuthSource
              ? `Found ${convexAuthSource.path}, but it does not export createUserIfNeeded.`
              : 'Could not find convex/auth.ts with the Trellis auth bootstrap export.',
      fixHint:
        !authExpected || !expectsTrellisUsers
          ? 'No action needed unless this app resolves actors from the Trellis users table later.'
          : 'Export `createUserIfNeeded` from defineBetterAuth(...) in convex/auth.ts so the client bootstrap can create or refresh the app user row from Convex auth identity.',
    },
    {
      id: 'permissions-query-configured',
      category: 'core',
      title: 'Permissions query wiring',
      status:
        usesPermissions && !configuredPermissionQueryPath
          ? 'fail'
          : permissionQueryResolutionError
            ? 'fail'
            : 'pass',
      message:
        usesPermissions && !configuredPermissionQueryPath
          ? 'Permission composables were detected in app code, but trellis.permissions.query is not configured in nuxt.config.'
          : permissionQueryResolutionError
            ? permissionQueryResolutionError.message
            : configuredPermissionQueryPath
              ? `Configured permissions query resolves: ${configuredPermissionQueryPath}.`
              : 'No permission-context query is configured, and no permission composables were detected.',
      fixHint:
        usesPermissions && !configuredPermissionQueryPath
          ? 'Set trellis.permissions to your backend permission-context query, for example `permissions/context.getAccessContext`.'
          : permissionQueryResolutionError
            ? 'Point trellis.permissions.query at a real exported Convex query in `convex/permissions/context.ts`.'
            : configuredPermissionQueryPath
              ? 'Keep trellis.permissions.query aligned with the exported backend permission-context query.'
              : 'No action needed unless you add useAccess() or useAuthGuard() later.',
    },
    {
      id: 'identity-forwarding-key-configured',
      category: 'advanced',
      title: 'Identity forwarding key source',
      status: identityForwardingExpected ? (identityForwardingKeySource ? 'pass' : 'warn') : 'pass',
      message: !identityForwardingExpected
        ? 'No identity-forwarding or MCP surfaces were detected in the app source.'
        : identityForwardingKeySource
          ? `Found CONVEX_IDENTITY_FORWARDING_KEY in ${identityForwardingKeySource.source}.`
          : 'Trusted-forwarding or MCP surfaces were detected, but no CONVEX_IDENTITY_FORWARDING_KEY source was found.',
      fixHint: !identityForwardingExpected
        ? 'No action needed unless you add MCP or identity-forwarding flows later.'
        : 'Set CONVEX_IDENTITY_FORWARDING_KEY in the local environment and the Convex deployment that serves identity-forwarding traffic.',
    },
    {
      id: 'identity-forwarding-key-strength',
      category: 'advanced',
      title: 'Identity forwarding key quality',
      status: !identityForwardingExpected
        ? 'pass'
        : !identityForwardingKeySource
          ? 'warn'
          : identityForwardingKeyIssue
            ? 'fail'
            : 'pass',
      message: !identityForwardingExpected
        ? 'No identity-forwarding or MCP surfaces were detected in the app source.'
        : !identityForwardingKeySource
          ? 'Cannot evaluate identity-forwarding key quality because no key source was found.'
          : identityForwardingKeyIssue
            ? `${identityForwardingKeyIssue} Source: ${identityForwardingKeySource.source}.`
            : `Identity forwarding key in ${identityForwardingKeySource.source} clears the production hardening checks.`,
      fixHint: !identityForwardingExpected
        ? 'No action needed unless you add MCP or identity-forwarding flows later.'
        : `Use a long random CONVEX_IDENTITY_FORWARDING_KEY (${minimumIdentityForwardingKeyLength}+ characters) and avoid placeholder or development values.`,
    },
    ...collectInventoryDoctorFindings(inventory),
    ...collectPermissionInventoryFindings(inventory, project),
  ]
  const moduleValidationFindings = collectModuleValidationFindings({
    rootDir: cwd,
    authEnabled: authExpected,
  }).map(
    (finding): DoctorFinding => ({
      id: finding.id,
      category: 'core' as const,
      title: toDoctorFindingTitle(finding.id),
      status: 'fail' as const,
      message: finding.message,
      fixHint:
        finding.id === 'isolation-table-coverage' || finding.id === 'isolation-valid'
          ? 'Align convex/schema.ts, convex/features/*/feature.ts, and convex/functions.ts so the derived manifest tenant classification is complete and non-conflicting.'
          : finding.id === 'destructive-safety-schema'
            ? 'Restore the destructive-safety tables in convex/schema.ts, including the stored confirmation fields, audit fields, and `by_token_hash`, `by_jti`, and `by_expires_at` indexes.'
            : 'Align the project source with the canonical Trellis contract.',
    }),
  )

  return [...baseFindings, ...moduleValidationFindings]
}

const productionRequiredFindingIds = new Set([
  'identity-forwarding-key-configured',
  'identity-forwarding-key-strength',
  'mcp-rate-limit-store',
  'operation-tool-agreement',
])

function applyProductionProfile(findings: DoctorFinding[]): DoctorFinding[] {
  return findings.map((finding) => {
    if (finding.status !== 'warn' || !productionRequiredFindingIds.has(finding.id)) {
      return finding
    }

    return {
      ...finding,
      status: 'fail',
      message: `${finding.message} Production doctor treats this warning as a failure.`,
    }
  })
}

export async function buildDoctorReport(
  cwd: string,
  options: { production?: boolean } = {},
): Promise<DoctorReport> {
  const project = inspectProject(cwd)
  const inventoryFacts = collectTrellisCliInventoryFacts(project)
  const inventory = collectTrellisCliInventory(project, inventoryFacts)
  const baseFindings = createDoctorFindings(project, inventory, inventoryFacts)
  const findings = options.production ? applyProductionProfile(baseFindings) : baseFindings
  return {
    cwd,
    inventory,
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
    production: {
      type: 'boolean',
      description: 'Treat deploy-time safety warnings as failures',
      default: false,
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

    const report = await buildDoctorReport(cwd, { production: Boolean(args.production) })

    loadingSpinner?.stop('Inspection complete')
    logger?.debug(`Found ${report.summary.fail} failures and ${report.summary.warn} warnings`)

    renderDoctorReport(report, {
      json: useJson,
      color,
    })

    const exitCode = exitCodeForFindings(report.summary)
    process.exitCode = exitCode
    return exitCode
  },
})
