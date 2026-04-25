import { resolve } from 'node:path'

import { spinner } from '@clack/prompts'
import { defineCommand } from 'citty'
import consola from 'consola'

import { collectModuleValidationFindings } from '../../analysis/validation.js'
import { resolvePermissionQuerySetup } from '../../module-internals/setup.js'
import {
  checkBridgeDrift,
  discoverInstalledBridgeComponents,
  loadManifestFromPackage,
} from '../../runtime/bridge/index.js'
import {
  getTrustedForwardingKeyProductionIssue,
  minimumTrustedForwardingKeyLength,
} from '../../runtime/trusted-forwarding/shared.js'
import type { DoctorFinding, DoctorReport } from '../lib/findings.js'
import { summarizeFindings } from '../lib/findings.js'
import { renderDoctorReport } from '../lib/output.js'
import { collectPermissionMetadataFindings } from '../lib/permission-metadata.js'
import {
  findConvexUrlSource,
  findEnvKeySource,
  findConvexHttpSource,
  findConvexAuthSource,
  findCrossTenantEscapeInventory,
  findConfiguredPermissionQueryPath,
  findDestructiveOperationInventory,
  findDestructiveMcpToolsWithoutOperationBinding,
  findForwardedPrincipalWithoutTrustedAuth,
  findMcpRateLimitStoreSupport,
  findMissingCanonicalLayoutPaths,
  findUnsafeSurfaceInventory,
  findTrustedForwardingPublicExposure,
  hasBetterAuthTriggerExports,
  hasBetterConvexNuxtRegistration,
  hasBetterAuthRouteRegistration,
  hasDependency,
  inspectProject,
  isAuthExplicitlyDisabled,
  usesMcpRateLimit,
  usesSyncedUsersTable,
  usesPermissionSurfaces,
  usesTrustedForwardingSurfaces,
} from '../lib/project.js'

function toDoctorFindingTitle(id: string): string {
  switch (id) {
    case 'tenant-isolation-valid':
      return 'Tenant classification validity'
    case 'tenant-isolation-table-coverage':
      return 'Tenant classification coverage'
    case 'destructive-safety-schema':
      return 'Destructive safety schema'
    case 'auth-enabled-consistency':
      return 'Auth enabled consistency'
    default:
      return id
  }
}

function createDoctorFindings(cwd: string): DoctorFinding[] {
  const project = inspectProject(cwd)
  const isNuxtApp = Boolean(project.packageJsonPath && project.nuxtConfigPath)
  const missingCanonicalLayoutPaths = isNuxtApp ? findMissingCanonicalLayoutPaths(project) : []
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
  const convexAuthSource = findConvexAuthSource(project)
  const expectsSyncedUsers = usesSyncedUsersTable(project)
  const hasAuthTriggers = hasBetterAuthTriggerExports(project)
  const trustedForwardingExpected = usesTrustedForwardingSurfaces(project)
  const trustedForwardingKeySource = findEnvKeySource(project, ['CONVEX_TRUSTED_FORWARDING_KEY'])
  const trustedForwardingKeyIssue = trustedForwardingKeySource
    ? getTrustedForwardingKeyProductionIssue(trustedForwardingKeySource.value, 'production')
    : null
  const trustedForwardingPublicExposure = findTrustedForwardingPublicExposure(project)
  const destructiveMcpConfirmationExpected = project.sourceFiles.some((file) =>
    /tool\.fromOperation\s*\(/.test(file.text),
  )
  const unsafeSurfaceInventory = findUnsafeSurfaceInventory(project)
  const crossTenantEscapeInventory = findCrossTenantEscapeInventory(project)
  const destructiveOperationInventory = findDestructiveOperationInventory(project)
  const mcpRateLimitExpected = usesMcpRateLimit(project)
  const mcpRateLimitStoreSupport = findMcpRateLimitStoreSupport(project)
  const mcpConfirmationKeySource = findEnvKeySource(project, ['TRELLIS_MCP_CONFIRMATION_KEY'])
  const forwardedPrincipalMisuse = findForwardedPrincipalWithoutTrustedAuth(project)
  const destructiveMcpToolMisuse = findDestructiveMcpToolsWithoutOperationBinding(project)
  const usesPermissions = usesPermissionSurfaces(project)
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
          : 'Restore the missing canonical paths or recreate the app with `trellis init <name> --template public|personal|workspace|cms`.',
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
      id: 'better-auth-triggers-exported',
      category: 'auth',
      title: 'Better Auth trigger exports',
      status: authExpected && expectsSyncedUsers ? (hasAuthTriggers ? 'pass' : 'warn') : 'pass',
      message: !authExpected
        ? 'Auth is explicitly disabled in nuxt.config.'
        : !expectsSyncedUsers
          ? 'No synced users-table pattern was detected in the app source.'
          : hasAuthTriggers
            ? `Found Better Auth trigger exports in ${convexAuthSource?.path ?? 'convex/auth.ts'}.`
            : convexAuthSource
              ? `Found ${convexAuthSource.path}, but it does not export authComponent.triggersApi().`
              : 'Could not find convex/auth.ts with Better Auth trigger exports.',
      fixHint:
        !authExpected || !expectsSyncedUsers
          ? 'No action needed unless this app resolves actors from a synced users table later.'
          : 'Export `onCreate`, `onUpdate`, and `onDelete` from `authComponent.triggersApi()` in convex/auth.ts so Better Auth keeps the users table in sync.',
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
          ? 'Set trellis.permissions to your backend permission-context query, for example `permissions/context.getPermissionContext`.'
          : permissionQueryResolutionError
            ? 'Point trellis.permissions.query at a real exported Convex query in `convex/permissions/context.ts`.'
            : configuredPermissionQueryPath
              ? 'Keep trellis.permissions.query aligned with the exported backend permission-context query.'
              : 'No action needed unless you add usePermissions() or useAuthGuard() later.',
    },
    {
      id: 'trusted-forwarding-key-configured',
      category: 'advanced',
      title: 'Trusted forwarding key source',
      status: trustedForwardingExpected ? (trustedForwardingKeySource ? 'pass' : 'warn') : 'pass',
      message: !trustedForwardingExpected
        ? 'No trusted-forwarding or MCP surfaces were detected in the app source.'
        : trustedForwardingKeySource
          ? `Found CONVEX_TRUSTED_FORWARDING_KEY in ${trustedForwardingKeySource.source}.`
          : 'Trusted-forwarding or MCP surfaces were detected, but no CONVEX_TRUSTED_FORWARDING_KEY source was found.',
      fixHint: !trustedForwardingExpected
        ? 'No action needed unless you add MCP or trusted-forwarding flows later.'
        : 'Set CONVEX_TRUSTED_FORWARDING_KEY in the local environment and the Convex deployment that serves trusted-forwarding traffic.',
    },
    {
      id: 'trusted-forwarding-key-strength',
      category: 'advanced',
      title: 'Trusted forwarding key quality',
      status: !trustedForwardingExpected
        ? 'pass'
        : !trustedForwardingKeySource
          ? 'warn'
          : trustedForwardingKeyIssue
            ? 'fail'
            : 'pass',
      message: !trustedForwardingExpected
        ? 'No trusted-forwarding or MCP surfaces were detected in the app source.'
        : !trustedForwardingKeySource
          ? 'Cannot evaluate trusted-forwarding key quality because no key source was found.'
          : trustedForwardingKeyIssue
            ? `${trustedForwardingKeyIssue} Source: ${trustedForwardingKeySource.source}.`
            : `Trusted forwarding key in ${trustedForwardingKeySource.source} clears the production hardening checks.`,
      fixHint: !trustedForwardingExpected
        ? 'No action needed unless you add MCP or trusted-forwarding flows later.'
        : `Use a long random CONVEX_TRUSTED_FORWARDING_KEY (${minimumTrustedForwardingKeyLength}+ characters) and avoid placeholder or development values.`,
    },
    {
      id: 'trusted-forwarding-key-public-exposure',
      category: 'advanced',
      title: 'Trusted forwarding public exposure',
      status: trustedForwardingPublicExposure.length > 0 ? 'fail' : 'pass',
      message:
        trustedForwardingPublicExposure.length > 0
          ? `Found trusted-forwarding key exposure in public-facing code or env sources at ${trustedForwardingPublicExposure
              .map((entry) => `${entry.path.replace(`${project.cwd}/`, '')}:${entry.line}`)
              .slice(0, 3)
              .join(', ')}${trustedForwardingPublicExposure.length > 3 ? ', ...' : ''}.`
          : 'No obvious trusted-forwarding key exposure paths were found in public-facing code or env sources.',
      fixHint:
        trustedForwardingPublicExposure.length > 0
          ? 'Keep CONVEX_TRUSTED_FORWARDING_KEY server-only. Remove any NUXT_PUBLIC exposure or public runtime-config mapping.'
          : 'Keep the trusted-forwarding key confined to server-only env and runtime paths.',
    },
    {
      id: 'forwarded-principal-trusted-path',
      category: 'advanced',
      title: 'Forwarded principal path',
      status: forwardedPrincipalMisuse.length > 0 ? 'fail' : 'pass',
      message:
        forwardedPrincipalMisuse.length > 0
          ? `Found forwarded \`principal\` options outside an \`auth: 'trusted'\` call in ${forwardedPrincipalMisuse
              .map((entry) => `${entry.path.replace(`${project.cwd}/`, '')}:${entry.line}`)
              .slice(0, 3)
              .join(', ')}${forwardedPrincipalMisuse.length > 3 ? ', ...' : ''}.`
          : 'No forwarded principals were found outside verified trusted-forwarding calls.',
      fixHint:
        forwardedPrincipalMisuse.length > 0
          ? "Only pass `principal` on verified server calls that also set `auth: 'trusted'`."
          : 'Keep forwarded principals confined to verified trusted-forwarding lanes.',
    },
    {
      id: 'unsafe-surface-inventory',
      category: 'advanced',
      title: 'Unsafe surface inventory',
      status: 'pass',
      message:
        unsafeSurfaceInventory.length === 0
          ? 'No `unsafe.query(...)` or `unsafe.mutation(...)` entrypoints were detected.'
          : `Found ${unsafeSurfaceInventory.length} unsafe entrypoint${unsafeSurfaceInventory.length === 1 ? '' : 's'} in ${unsafeSurfaceInventory
              .map((entry) => `${entry.path.replace(`${project.cwd}/`, '')}:${entry.line}`)
              .slice(0, 3)
              .join(', ')}${unsafeSurfaceInventory.length > 3 ? ', ...' : ''}.`,
      fixHint:
        unsafeSurfaceInventory.length === 0
          ? 'No action needed unless you add intentional escape hatches later.'
          : 'Review each unsafe entrypoint and keep the bypass reason narrow, explicit, and tested.',
    },
    {
      id: 'cross-tenant-escape-inventory',
      category: 'advanced',
      title: 'Cross-tenant escape inventory',
      status: 'pass',
      message:
        crossTenantEscapeInventory.length === 0
          ? 'No `ctx.db.escapeTenantIsolation(...)` sites were detected.'
          : `Found ${crossTenantEscapeInventory.length} tenant-isolation escape${crossTenantEscapeInventory.length === 1 ? '' : 's'} in ${crossTenantEscapeInventory
              .map((entry) => `${entry.path.replace(`${project.cwd}/`, '')}:${entry.line}`)
              .slice(0, 3)
              .join(', ')}${crossTenantEscapeInventory.length > 3 ? ', ...' : ''}.`,
      fixHint:
        crossTenantEscapeInventory.length === 0
          ? 'No action needed unless the app adds cross-tenant workflows later.'
          : 'Review each tenant-isolation escape and keep the reason, caller boundary, and data scope explicit.',
    },
    {
      id: 'destructive-operation-inventory',
      category: 'advanced',
      title: 'Destructive operation inventory',
      status: 'pass',
      message:
        destructiveOperationInventory.length === 0
          ? 'No `kind: "destructive"` operations were detected.'
          : `Found ${destructiveOperationInventory.length} destructive operation${destructiveOperationInventory.length === 1 ? '' : 's'} in ${destructiveOperationInventory
              .map((entry) => `${entry.path.replace(`${project.cwd}/`, '')}:${entry.line}`)
              .slice(0, 3)
              .join(', ')}${destructiveOperationInventory.length > 3 ? ', ...' : ''}.`,
      fixHint:
        destructiveOperationInventory.length === 0
          ? 'No action needed unless the app adds destructive preview/confirm flows later.'
          : 'Review each destructive operation and keep preview, confirmation, and audit expectations explicit.',
    },
    {
      id: 'mcp-confirmation-key-configured',
      category: 'advanced',
      title: 'MCP confirmation key source',
      status: destructiveMcpConfirmationExpected
        ? mcpConfirmationKeySource
          ? 'pass'
          : 'warn'
        : 'pass',
      message: !destructiveMcpConfirmationExpected
        ? 'No destructive MCP tools were detected in the app source.'
        : mcpConfirmationKeySource
          ? `Found TRELLIS_MCP_CONFIRMATION_KEY in ${mcpConfirmationKeySource.source}.`
          : 'Destructive MCP tools were detected, but no TRELLIS_MCP_CONFIRMATION_KEY source was found.',
      fixHint: !destructiveMcpConfirmationExpected
        ? 'No action needed unless you add destructive MCP tools later.'
        : 'Set TRELLIS_MCP_CONFIRMATION_KEY in the local environment and the deployment serving destructive MCP traffic.',
    },
    {
      id: 'mcp-rate-limit-store',
      category: 'advanced',
      title: 'MCP rate-limit store',
      status: !mcpRateLimitExpected
        ? 'pass'
        : mcpRateLimitStoreSupport === 'supported'
          ? 'pass'
          : 'fail',
      message: !mcpRateLimitExpected
        ? 'No MCP rate-limited tools were detected in the app source.'
        : mcpRateLimitStoreSupport === 'supported'
          ? 'Found the first-party Redis MCP rate-limit store in app source.'
          : mcpRateLimitStoreSupport === 'unverified'
            ? 'Found an explicit MCP rate-limit store, but doctor cannot verify that it is a supported atomic distributed store.'
            : 'MCP rate-limited tools were detected, but no supported distributed rate-limit store was found.',
      fixHint: !mcpRateLimitExpected
        ? 'No action needed unless you add MCP rate-limited tools later.'
        : 'Use `rateLimitStore: createRedisMcpRateLimitStore(...)` for distributed MCP enforcement. The built-in fallback is process-local memory only, and custom stores remain unverified by doctor.',
    },
    {
      id: 'mcp-destructive-operation-binding',
      category: 'advanced',
      title: 'Destructive MCP operation binding',
      status: destructiveMcpToolMisuse.length > 0 ? 'fail' : 'pass',
      message:
        destructiveMcpToolMisuse.length > 0
          ? `Found destructive-looking MCP tools that do not use \`tool.fromOperation(...)\` in ${destructiveMcpToolMisuse
              .map((entry) => `${entry.path.replace(`${project.cwd}/`, '')}:${entry.line}`)
              .slice(0, 3)
              .join(', ')}${destructiveMcpToolMisuse.length > 3 ? ', ...' : ''}.`
          : 'No destructive MCP tools were found outside operation-backed bindings.',
      fixHint:
        destructiveMcpToolMisuse.length > 0
          ? 'Destructive MCP tools must bind through `tool.fromOperation(...)` so preview, confirmation, and execute stay coupled.'
          : 'Keep destructive MCP tools operation-backed.',
    },
    ...collectPermissionMetadataFindings(project),
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
        finding.id === 'tenant-isolation-table-coverage' || finding.id === 'tenant-isolation-valid'
          ? 'Align convex/schema.ts, convex/features/*/feature.ts, and convex/functions.ts so the derived manifest tenant classification is complete and non-conflicting.'
          : finding.id === 'destructive-safety-schema'
            ? 'Restore the destructive-safety tables in convex/schema.ts, including the redemption `jti` field and `by_jti` index.'
            : 'Align the project source with the canonical Trellis contract.',
    }),
  )

  return [...baseFindings, ...moduleValidationFindings]
}

async function collectBridgeFindings(cwd: string): Promise<DoctorFinding[]> {
  const installed = await discoverInstalledBridgeComponents(cwd)
  if (installed.length === 0) return []

  const findings: DoctorFinding[] = []
  for (const entry of installed) {
    try {
      const manifest = await loadManifestFromPackage(entry.packageName, cwd)
      const violations = await checkBridgeDrift(manifest, cwd)
      const id = `bridge-${entry.packageName.replace(/[^a-zA-Z0-9]+/g, '-')}`
      if (violations.length === 0) {
        findings.push({
          id,
          category: 'core',
          title: `${entry.packageName} bridge`,
          status: 'pass',
          message: `Bridge files for ${entry.packageName}@${manifest.version} are up to date.`,
          fixHint: `Keep the bridge in sync with \`pnpm exec trellis bridge generate ${entry.packageName}\` after upgrades.`,
        })
        continue
      }
      const summary = violations
        .slice(0, 3)
        .map((v) => `${v.relativePath} ${v.reason === 'missing' ? 'is missing' : 'is out of date'}`)
        .join('; ')
      const more = violations.length > 3 ? `, and ${violations.length - 3} more` : ''
      findings.push({
        id,
        category: 'core',
        title: `${entry.packageName} bridge`,
        status: 'fail',
        message: `Bridge for ${entry.packageName}@${manifest.version} has ${violations.length} issue(s): ${summary}${more}.`,
        fixHint: `Run \`pnpm exec trellis bridge generate ${entry.packageName}\` and commit the result.`,
      })
    } catch (error) {
      findings.push({
        id: `bridge-${entry.packageName.replace(/[^a-zA-Z0-9]+/g, '-')}`,
        category: 'core',
        title: `${entry.packageName} bridge`,
        status: 'fail',
        message: `Could not evaluate bridge for ${entry.packageName}: ${
          error instanceof Error ? error.message : String(error)
        }`,
        fixHint: `Verify ${entry.packageName} ships a valid \`./convex/manifest\` export and reinstall with \`pnpm install\`.`,
      })
    }
  }
  return findings
}

export async function buildDoctorReport(cwd: string): Promise<DoctorReport> {
  const baseFindings = createDoctorFindings(cwd)
  const bridgeFindings = await collectBridgeFindings(cwd)
  const findings = [...baseFindings, ...bridgeFindings]
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

    const report = await buildDoctorReport(cwd)

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
