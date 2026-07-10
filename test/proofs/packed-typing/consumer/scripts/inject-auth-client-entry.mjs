// Phase 0 prototype injector for §5.8 proof 1 / internal §23 stop condition 20.
//
// The current packed `better-convex-nuxt` (0.5.0) does NOT yet ship the Phase 3
// `/auth-client` entry. To prove the TYPING MECHANISM from a node_modules-
// resident location today, this script injects a prototype `/auth-client` entry
// into the installed packed package: a framework-free `defineConvexAuthClient`
// helper + `InferRegisteredConvexAuthClient` registry surface that imports ONLY
// better-auth types and the Convex client plugin (no Nuxt/Vue/#imports).
//
// Phase 3 replaces this injected prototype with the real published entry; the
// consumer definition, generated registry template, and assertions stay.
//
// Writes are unlink-then-write so we never mutate a store-shared hardlink inode.
import { existsSync, mkdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const consumerDir = dirname(dirname(fileURLToPath(import.meta.url)))
const pkgLink = join(consumerDir, 'node_modules', 'better-convex-nuxt')
if (!existsSync(pkgLink)) {
  console.error('[inject-auth-client-entry] better-convex-nuxt not installed yet; skipping.')
  process.exit(0)
}
const pkgDir = realpathSync(pkgLink)

const authClientDir = join(pkgDir, 'dist', 'runtime', 'auth-client')
mkdirSync(authClientDir, { recursive: true })

const dts = `import type { BetterAuthClientOptions, BetterAuthClientPlugin } from 'better-auth/client'
import type { VueAuthClient } from 'better-auth/vue'
import type { convexClient } from '@convex-dev/better-auth/client/plugins'

type AuthClientPlugins = readonly BetterAuthClientPlugin[]

export type ConvexAuthClientDefinitionOptions<Plugins extends AuthClientPlugins> = Omit<
  BetterAuthClientOptions,
  'baseURL' | 'basePath' | 'plugins' | 'fetchOptions'
> & {
  plugins?: Plugins
}

export interface ConvexAuthClientDefinition<Plugins extends AuthClientPlugins> {
  readonly options: ConvexAuthClientDefinitionOptions<Plugins>
}

export declare function defineConvexAuthClient<const Plugins extends AuthClientPlugins = []>(
  options?: ConvexAuthClientDefinitionOptions<Plugins>,
): ConvexAuthClientDefinition<Plugins>

/** Augmentable registry; the generated type template adds \`definition\`. */
export interface ConvexAuthClientRegistry {}

type ConvexPlugin = ReturnType<typeof convexClient>
// better-auth's \`plugins\` option is a MUTABLE array; the definition holds a
// readonly tuple, so strip readonly when spreading into resolved options.
type MutablePlugins<P extends readonly unknown[]> = { -readonly [I in keyof P]: P[I] }
type PluginsOf<D> = D extends ConvexAuthClientDefinition<infer P> ? P : []

type ResolvedOptions<Plugins extends AuthClientPlugins> = Omit<
  BetterAuthClientOptions,
  'baseURL' | 'plugins'
> & {
  baseURL: string
  plugins: [ConvexPlugin, ...MutablePlugins<Plugins>]
}

// Do NOT re-intersect the full \`BetterAuthClientOptions\`: its broad optional
// \`plugins?: BetterAuthClientPlugin[]\` collapses plugin-method inference to
// \`any\`. \`ResolvedOptions\` already carries base options via the \`Omit\`.
export type BaseAuthClient = VueAuthClient<ResolvedOptions<[]>>

export type InferRegisteredConvexAuthClient = ConvexAuthClientRegistry extends {
  definition: infer D
}
  ? VueAuthClient<ResolvedOptions<PluginsOf<D>>>
  : BaseAuthClient
`

const mjs = `// Framework-free definition identity function (vNext §8). Captures type
// information only; never instantiates a client.
export function defineConvexAuthClient(options = {}) {
  return Object.freeze({ options: Object.freeze(options) })
}
`

// index.d.ts uses .d.ts (not .d.mts); the export map points types here.
for (const [name, content] of [
  ['index.d.ts', dts],
  ['index.mjs', mjs],
]) {
  const target = join(authClientDir, name)
  if (existsSync(target)) rmSync(target)
  writeFileSync(target, content)
}

// Add the `./auth-client` export + typesVersions to the installed package.json.
const pkgJsonPath = join(pkgDir, 'package.json')
const pkgJson = JSON.parse(await import('node:fs').then((m) => m.readFileSync(pkgJsonPath, 'utf8')))
pkgJson.exports = pkgJson.exports ?? {}
pkgJson.exports['./auth-client'] = {
  types: './dist/runtime/auth-client/index.d.ts',
  import: './dist/runtime/auth-client/index.mjs',
}
pkgJson.typesVersions = pkgJson.typesVersions ?? {}
pkgJson.typesVersions['*'] = pkgJson.typesVersions['*'] ?? {}
pkgJson.typesVersions['*']['auth-client'] = ['./dist/runtime/auth-client/index.d.ts']
rmSync(pkgJsonPath)
writeFileSync(pkgJsonPath, JSON.stringify(pkgJson, null, 2) + '\n')

console.error(
  '[inject-auth-client-entry] injected better-convex-nuxt/auth-client at',
  authClientDir,
)
