#!/usr/bin/env node
/**
 * Table-driven vocabulary checker (internal §16.3).
 *
 * Pure Node: fs walk + JS regex, no ripgrep/shell dependency. Replaces the
 * inline `sh -c '! rg …'` package scripts, which inverted ripgrep's
 * command-not-found exit code into a vacuous pass whenever `rg` was absent.
 *
 * Rules are declared in one table. Each rule is gated by `phase`; only
 * phases listed in ACTIVE_PHASES actually run. Rules for phases not yet
 * active are reported as "scheduled" so the table stays the single source
 * of truth as later phases add rules without having to restructure this
 * file — adding a rule is one entry in RULES.
 *
 * This script enforces vocabulary/spelling only. It must not enforce
 * semantic import/export architecture; the AST gate owns that.
 */

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = fileURLToPath(new URL('..', import.meta.url))

/**
 * Phases whose rules actually execute.
 *
 * FROZEN at Phase 6 (vNext §11 "Source locks", final activation): this table
 * is the complete, permanent vocabulary lock for the 0.x cutover. There is no
 * later phase to schedule against — any further ban is a new entry in RULES
 * reusing `phase6` (or one of the already-active phases), not a new phase tag.
 */
const ACTIVE_PHASES = ['phase0', 'phase1', 'phase3', 'phase4', 'phase6']

/** Directory names never walked into, anywhere in the tree. */
const EXCLUDED_DIR_NAMES = new Set([
  'node_modules',
  '.git',
  '.nuxt',
  '.output',
  '.convex',
  '.cache',
  '.temp',
  '.tmp',
  '.data',
  '.vercel_build_output',
  '.netlify',
  '.turbo',
  '.idea',
  '.vscode',
  'dist',
  'coverage',
  'reports',
])

/** Historical design records document deleted APIs and must not define current vocabulary. */
const EXCLUDED_PATH_PREFIXES = ['docs/architecture/vnext/']

function isExcludedPath(absolutePath) {
  const repoRelativePath = relative(repoRoot, absolutePath).split('\\').join('/')
  return EXCLUDED_PATH_PREFIXES.some((prefix) => repoRelativePath.startsWith(prefix))
}

/** File extensions skipped because they are not meaningfully text/regex-searchable. */
const BINARY_EXTENSIONS = new Set([
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.webp',
  '.ico',
  '.woff',
  '.woff2',
  '.ttf',
  '.otf',
  '.eot',
  '.pdf',
  '.zip',
  '.mp4',
  '.mov',
  '.lock',
])

/**
 * @typedef {object} Rule
 * @property {string} name - short rule identifier, matches the legacy `check:no-*` script name
 * @property {string} description - human-readable summary shown on failure
 * @property {RegExp[]} patterns - line-oriented; a line matches the rule if any pattern matches it
 * @property {string[]} paths - repo-root-relative paths (files, dirs, or single-`*`-segment globs)
 * @property {'phase0'|'phase1'|'phase3'|'phase4'|'phase6'} phase - activation schedule gate, see ACTIVE_PHASES
 */

/** @type {Rule[]} */
const RULES = [
  {
    name: 'no-legacy-query-api',
    description: 'Forbid legacy lazy/with-default query composable spellings.',
    patterns: [
      /useConvexQueryLazy|useConvexPaginatedQueryLazy|with-default|useConvex(?:Query|PaginatedQuery)[^\n]*default\b/,
    ],
    paths: ['src', 'playground', 'docs', 'test', 'starters'],
    phase: 'phase0',
  },
  {
    name: 'no-legacy-call-api',
    description: 'Forbid legacy `.execute(Safe)?(...)` and destructured `execute` call API.',
    patterns: [/\.execute(?:Safe)?\s*\(|const \{[^}]*\bexecute\b/],
    paths: ['src', 'playground', 'docs/content', 'starters'],
    phase: 'phase0',
  },
  {
    name: 'no-legacy-generated-api-imports',
    description: 'Forbid importing the raw Convex `_generated/api` module from app-facing code.',
    patterns: [/from ['"](?:~~|~)\/convex\/_generated\/api['"]/],
    paths: [
      'README.md',
      'docs/content',
      'starters/*/app',
      'playground/pages',
      'playground/components',
      'playground/composables',
      'playground/middleware',
      'playground/server',
      'src/runtime/composables',
    ],
    phase: 'phase0',
  },
  {
    name: 'no-stale-doc-imports',
    description: 'Forbid stale composable import path and a retired code-comment phrase.',
    patterns: [/better-convex-nuxt\/composables|getQueryKey is intentionally/],
    paths: ['README.md', 'docs/content', 'starters', 'playground', 'test/fixtures'],
    phase: 'phase0',
  },
  {
    name: 'no-query-composables-in-middleware',
    description: 'Forbid query composables inside route middleware/plugins.',
    patterns: [/useConvexQuery\(|useConvexPaginatedQuery\(/],
    paths: ['playground/middleware', 'playground/plugins'],
    phase: 'phase0',
  },
  {
    name: 'no-use-route-in-middleware',
    description:
      'Forbid `useRoute()` inside route middleware (middleware already receives the route).',
    patterns: [/useRoute\(/],
    paths: ['playground/middleware'],
    phase: 'phase0',
  },
  {
    name: 'no-middleware-query-docs',
    description:
      'Forbid documenting `subscribe: false` alongside middleware usage in the same vicinity.',
    patterns: [/middleware[^\n]{0,120}subscribe:\s*false|subscribe:\s*false[^\n]{0,120}middleware/],
    paths: ['docs/content/docs'],
    phase: 'phase0',
  },
  {
    name: 'no-app-owned-org-docs',
    description:
      'Forbid documenting application-owned org/role tables; Convex vNext owns authoritative org data.',
    patterns: [
      /organizations: defineTable|role: roleValidator|users\.role|users\.organizationId|Authoritative permissions\/business data|authoritative roles\/org membership|store\/query them in Convex tables/,
    ],
    paths: ['docs/content', 'demo/convex'],
    phase: 'phase0',
  },

  // Phase 1/4/6 rules are added here as scheduled entries and flipped on by
  // extending ACTIVE_PHASES — no other structural change is needed.
  {
    name: 'no-auto-auth-mode',
    description:
      'Forbid the deleted `auto` auth-mode spelling; the mode grammar is required/optional/none.',
    patterns: [
      // `auth: 'auto'` / `auth?: 'auto'` property values (client, server, storage-url options).
      /\bauth\??\s*:\s*['"]auto['"]/,
      // Union type literals that still enumerate 'auto' as a member.
      /['"]auto['"]\s*\|\s*['"](?:required|optional|none)['"]|['"](?:required|optional|none)['"]\s*\|\s*['"]auto['"]/,
    ],
    paths: ['src', 'playground', 'docs/content', 'starters', 'test'],
    phase: 'phase1',
  },
  {
    name: 'no-nullable-skip-sentinel',
    description:
      "Forbid `null` as a query skip value in app-facing code; 'skip' is the only skip sentinel. " +
      '(Required @ts-expect-error negative-space contracts proving this deliberately live in ' +
      'test/unit and test/fixtures, so those paths are out of scope for this rule.)',
    patterns: [
      /use(?:Convex(?:Paginated)?Query|ConvexUser)\([^,()]*,\s*null\s*[,)]/,
      /defineSharedConvexQuery\(\s*\{[^}]*args:\s*null\b/,
    ],
    paths: ['src', 'playground', 'docs/content', 'starters'],
    phase: 'phase1',
  },
  {
    name: 'no-get-query-key',
    description:
      'Forbid the deleted public `getQueryKey` export/auto-import/usage. ' +
      '(The required @ts-expect-error negative-space contract proving this lives in ' +
      'test/fixtures/consumer-smoke, so `test` is out of scope for this rule.)',
    patterns: [/\bgetQueryKey\s*\(|import\s*\{[^}]*\bgetQueryKey\b[^}]*\}/],
    paths: ['src', 'playground', 'docs/content', 'starters'],
    phase: 'phase1',
  },
  {
    name: 'no-use-convex-call',
    description:
      'Forbid the deleted `useConvexCall` composable; use `useConvex()` instead. ' +
      '(The required @ts-expect-error negative-space contract proving this lives in ' +
      'test/fixtures/consumer-smoke, so `test` is out of scope for this rule.)',
    patterns: [/\buseConvexCall\s*\(|import\s*\{[^}]*\buseConvexCall\b[^}]*\}/],
    paths: ['src', 'playground', 'docs/content', 'starters'],
    phase: 'phase1',
  },
  {
    name: 'no-create-permissions',
    description:
      'Forbid the deleted `createPermissions` factory/module option. ' +
      '(The required @ts-expect-error negative-space contract proving this lives in ' +
      'test/fixtures/consumer-smoke, so `test` is out of scope for this rule.)',
    patterns: [
      /\bcreatePermissions\s*[(<]|import\s*\{[^}]*\bcreatePermissions\b[^}]*\}|\bpermissions\s*:\s*true\b/,
    ],
    paths: ['src', 'playground', 'docs/content', 'starters'],
    phase: 'phase1',
  },
  {
    name: 'no-package-owned-use-permissions',
    description:
      'Forbid the package re-introducing `usePermissions`/`usePermissionRedirect` as its own export; ' +
      'app-owned composables of that name (built on `useConvexQuery`) are the supported pattern and are ' +
      'intentionally out of this rule’s scope.',
    patterns: [
      /export\s*\{[^}]*\busePermissions\b[^}]*\}|export\s+function\s+usePermissions\b|export\s+const\s+\{\s*usePermissions\b/,
    ],
    paths: ['src'],
    phase: 'phase1',
  },
  {
    name: 'no-skip-auth-routes',
    description:
      'Forbid the deleted `skipAuthRoutes` config input and `skipConvexAuth` page meta. ' +
      '(The required @ts-expect-error negative-space contract proving this lives in ' +
      'test/unit/auth-config.test.ts, so `test` is out of scope for this rule.)',
    patterns: [/\bskipAuthRoutes\b|\bskipConvexAuth\b/],
    paths: ['src', 'playground', 'docs/content', 'starters'],
    phase: 'phase1',
  },
  {
    name: 'no-auth-unauthorized-option',
    description:
      'Forbid the deleted `auth.unauthorized` config option and its recovery pipeline. ' +
      '(The required @ts-expect-error negative-space contract proving this lives in ' +
      'test/unit/auth-config.test.ts, so `test` is out of scope for this rule.)',
    patterns: [/\bunauthorized\s*:\s*\{|auth\.unauthorized\b/],
    paths: ['src', 'playground', 'docs/content', 'starters'],
    phase: 'phase1',
  },
  {
    name: 'no-auth-enabled-flag',
    description:
      'Forbid the deleted nested `auth: { enabled: ... }` input; use `auth: false | {...}`. ' +
      '(The required @ts-expect-error negative-space contract proving this lives in ' +
      'test/unit/auth-config.test.ts, so `test` is out of scope for this rule.)',
    patterns: [/auth\s*:\s*\{\s*enabled\s*:/],
    paths: ['src', 'playground', 'docs/content', 'starters'],
    phase: 'phase1',
  },
  {
    name: 'no-create-better-convex-auth-client',
    description:
      'Forbid the deleted `createBetterConvexAuthClient` factory and its ' +
      '`resolveBetterConvexAuthBaseURL` helper; the single typed-client surface is ' +
      '`defineConvexAuthClient` from `better-convex-nuxt/auth-client` (vNext §8). ' +
      '(The packed-root negative-space contract proving these names never re-enter ' +
      'the package export surface lives in scripts/check-package-exports.mjs ' +
      'forbiddenNames, so `test` is out of scope for this rule.)',
    patterns: [/\bcreateBetterConvexAuthClient\b|\bresolveBetterConvexAuthBaseURL\b/],
    paths: ['src', 'playground', 'docs/content', 'starters'],
    phase: 'phase3',
  },
  {
    name: 'no-server-convex-trio',
    description:
      'Forbid the deleted server call trio `serverConvexQuery`/`serverConvexMutation`/`serverConvexAction`; ' +
      'the single server call API is the `serverConvex(event)` caller (vNext §9). ' +
      '(Phase 6 rewrote `docs/content` onto the caller API, so docs are now in scope too. The ' +
      'negative-space export assertions proving the trio no longer resolves live in ' +
      'test/unit/server-index-exports.test.ts, so `test` stays out of scope here.)',
    patterns: [/\bserverConvex(?:Query|Mutation|Action)\b/],
    paths: ['src', 'playground', 'starters', 'docs/content'],
    phase: 'phase4',
  },

  // ---- Phase 6 rules (vNext §11 "Source locks", final activation) ----------

  {
    name: 'no-legacy-auth-engine-api',
    description:
      'Forbid the deleted `refreshAuth`/`awaitAuthReady` composable-surface spellings; ' +
      '`useConvexAuth()` exposes `refresh()` (advanced raw-client/claim-change flows only) and ' +
      'settlement is internal (vNext §8). signIn/signUp synchronize Convex automatically, so app ' +
      'code should rarely need `refresh()` at all.',
    patterns: [/\brefreshAuth\b/, /\bawaitAuthReady\b/],
    paths: [
      'src',
      'README.md',
      'docs/content',
      'starters',
      'playground',
      'test/TESTING.md',
      'test/browser',
      'test/e2e',
      'test/fixtures',
      'test/helpers',
      'test/nuxt',
      'test/unit',
    ],
    phase: 'phase6',
  },
  {
    name: 'no-defaults-auth-escape-hatch',
    description:
      'Forbid the internal `defaults.auth` merge-defaults escape hatch surfacing in app-facing ' +
      'code/docs; module options set `auth: false | {...}` directly — there is no separate ' +
      'defaults object to reach into. (The historical prototype proving the merge behavior lives ' +
      'in test/proofs/packed-typing/defu-merge-proof.mjs, so `test` is out of scope for this rule.)',
    patterns: [/\bdefaults\.auth\b/],
    paths: ['src', 'README.md', 'docs/content', 'starters', 'playground'],
    phase: 'phase6',
  },
  {
    name: 'no-permissions-module-option',
    description:
      'Forbid the deleted `permissions` module option in either boolean state (`permissions: true` ' +
      'and `permissions: false` are both retired spellings); permission rules stay ' +
      'application/Convex policy, not a module toggle.',
    patterns: [/\bpermissions\s*:\s*(?:true|false)\b/],
    paths: ['src', 'README.md', 'docs/content', 'starters', 'playground'],
    phase: 'phase6',
  },
  {
    name: 'no-legacy-auth-dotted-flags',
    description:
      'Forbid the deleted dotted config-path spellings `auth.enabled`, `auth.cache.enabled`, and ' +
      '`auth.unauthorized.enabled`; the auth input is `auth: false | {...}` with no nested ' +
      '`enabled` flag anywhere in its shape (vNext §11).',
    patterns: [/\bauth\.unauthorized\.enabled\b/, /\bauth\.cache\.enabled\b/, /\bauth\.enabled\b/],
    paths: ['src', 'README.md', 'docs/content', 'starters', 'playground'],
    phase: 'phase6',
  },
  {
    name: 'no-legacy-auth-client-type-names',
    description:
      'Forbid the deleted `BetterConvexAuthClientOptions`/`BetterConvexAuthClientPluginList` type ' +
      'names; the current typed-client surface exports `ConvexAuthClientDefinitionOptions` and ' +
      '`AuthClientPlugins` from `better-convex-nuxt/auth-client` (vNext §8).',
    patterns: [/\bBetterConvexAuthClientOptions\b|\bBetterConvexAuthClientPluginList\b/],
    paths: ['src', 'README.md', 'docs/content', 'starters', 'playground'],
    phase: 'phase6',
  },
  {
    name: 'no-omitted-query-args',
    description:
      'Forbid app-facing examples that omit the args slot on a query composable call; the final ' +
      "API always takes an explicit args object or the `'skip'` sentinel, even for a no-argument " +
      'query (decision 9). (The required @ts-expect-error negative-space contracts proving the ' +
      'omitted form fails to typecheck live in test/fixtures/consumer-smoke, so `test` is out of ' +
      'scope for this rule.)',
    patterns: [
      /\buseConvexQuery\(\s*[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*\s*\)/,
      /\buseConvexPaginatedQuery\(\s*[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*\s*\)/,
    ],
    paths: ['src', 'docs/content', 'starters', 'playground'],
    phase: 'phase6',
  },
  {
    name: 'no-review-finding-markers',
    description:
      'Forbid temporary review finding identifiers in maintained code, tests, fixtures, and docs.',
    patterns: [/\bF-\d+\b/],
    paths: ['src', 'build.config.ts', 'playground', 'docs', 'test', 'starters', 'README.md'],
    phase: 'phase6',
  },
]

class ConfigError extends Error {}

function globSegmentToRegExp(segment) {
  const escaped = segment
    .split('*')
    .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('.*')
  return new RegExp(`^${escaped}$`)
}

/** Expand a repo-relative path pattern (optionally containing one `*` segment) to absolute paths that exist. */
function expandPathPattern(pattern) {
  const segments = pattern.split('/')
  const hasGlob = segments.some((segment) => segment.includes('*'))

  if (!hasGlob) {
    const fullPath = join(repoRoot, pattern)
    if (!existsSync(fullPath)) {
      throw new ConfigError(`path does not exist: ${pattern}`)
    }
    return [fullPath]
  }

  let currentLevel = [repoRoot]
  for (const segment of segments) {
    const nextLevel = []
    const isGlobSegment = segment.includes('*')
    for (const base of currentLevel) {
      if (!existsSync(base)) continue
      if (!isGlobSegment) {
        const next = join(base, segment)
        if (existsSync(next)) nextLevel.push(next)
        continue
      }
      const regex = globSegmentToRegExp(segment)
      for (const entry of readdirSync(base, { withFileTypes: true })) {
        if (entry.isDirectory() && regex.test(entry.name)) {
          nextLevel.push(join(base, entry.name))
        }
      }
    }
    currentLevel = nextLevel
  }

  if (currentLevel.length === 0) {
    throw new ConfigError(`glob path pattern matched nothing (misconfigured?): ${pattern}`)
  }
  return currentLevel
}

/** Recursively collect every scannable file under a resolved path (file or directory). */
function collectFiles(absolutePath) {
  const stat = statSync(absolutePath)
  if (stat.isFile()) {
    return [absolutePath]
  }
  if (!stat.isDirectory()) {
    return []
  }

  const files = []
  const stack = [absolutePath]
  while (stack.length > 0) {
    const dir = stack.pop()
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        if (EXCLUDED_DIR_NAMES.has(entry.name)) continue
        const childDirectory = join(dir, entry.name)
        if (isExcludedPath(childDirectory + '/')) continue
        stack.push(childDirectory)
        continue
      }
      if (!entry.isFile()) continue
      const dotIndex = entry.name.lastIndexOf('.')
      const ext = dotIndex === -1 ? '' : entry.name.slice(dotIndex).toLowerCase()
      if (BINARY_EXTENSIONS.has(ext)) continue
      files.push(join(dir, entry.name))
    }
  }
  return files
}

function runRule(rule) {
  /** @type {{ file: string, line: number, text: string }[]} */
  const violations = []

  const resolvedPaths = rule.paths.flatMap(expandPathPattern)
  const files = new Set(resolvedPaths.flatMap(collectFiles))

  for (const absoluteFile of files) {
    let content
    try {
      content = readFileSync(absoluteFile, 'utf8')
    } catch {
      // Unreadable (e.g. broken symlink) — skip rather than fail the whole run.
      continue
    }

    const lines = content.split(/\r?\n/)
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]
      if (rule.patterns.some((pattern) => pattern.test(line))) {
        violations.push({
          file: relative(repoRoot, absoluteFile),
          line: i + 1,
          text: line.trim(),
        })
      }
    }
  }

  return violations
}

function main() {
  const activeRules = RULES.filter((rule) => ACTIVE_PHASES.includes(rule.phase))
  const scheduledRules = RULES.filter((rule) => !ACTIVE_PHASES.includes(rule.phase))

  /** @type {{ rule: Rule, violations: { file: string, line: number, text: string }[] }[]} */
  const results = []

  for (const rule of activeRules) {
    try {
      const violations = runRule(rule)
      results.push({ rule, violations })
    } catch (error) {
      if (error instanceof ConfigError) {
        console.error(
          `✗ vocabulary checker misconfigured for rule "${rule.name}": ${error.message}`,
        )
        process.exit(1)
      }
      throw error
    }
  }

  const failing = results.filter((result) => result.violations.length > 0)

  if (failing.length > 0) {
    for (const { rule, violations } of failing) {
      console.error(`\n✗ ${rule.name}: ${rule.description}`)
      for (const violation of violations) {
        console.error(`  ${violation.file}:${violation.line}: ${violation.text}`)
      }
    }
    console.error(
      `\nvocabulary check failed: ${failing.length} rule(s), ${failing.reduce((sum, r) => sum + r.violations.length, 0)} match(es) total.`,
    )
    process.exit(1)
  }

  console.log(`✓ vocabulary check passed (${activeRules.length} active rule(s)).`)
  if (scheduledRules.length > 0) {
    console.log(
      `  scheduled (inactive): ${scheduledRules.map((r) => `${r.name} [${r.phase}]`).join(', ')}`,
    )
  }
}

export { ACTIVE_PHASES, expandPathPattern, RULES }

const isMainModule = process.argv[1] && import.meta.url === `file://${process.argv[1]}`
if (isMainModule) {
  main()
}
