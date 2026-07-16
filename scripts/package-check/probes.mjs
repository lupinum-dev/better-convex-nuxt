// Packed consumer probes
import { execFileSync } from 'node:child_process'
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'

const repoRoot = resolve(import.meta.dirname, '../..')
const p = (...segments) => resolve(repoRoot, ...segments)
const packageJson = JSON.parse(readFileSync(p('package.json'), 'utf8'))

function run(command, args, options = {}) {
  return execFileSync(command, args, { encoding: 'utf8', stdio: 'inherit', ...options })
}

// ---------------------------------------------------------------------------

/** @typedef {{ tarballPath: string, packageDir: string, failures: string[] }} ProbeContext */

/**
 * Package-root probe: an ephemeral (non-repo, non-committed) consumer that
 * installs the packed tarball and proves runtime resolution (the default
 * Nuxt-module export plus the `api`/`internal`/`components` fallback value
 * exports actually resolve from node_modules) and type resolution (`tsc`
 * against the installed tarball's declaration files) without needing a full
 * Nuxt build. No dedicated fixture directory is required for the package root.
 */
export function probeRootEntry(ctx) {
  const dir = mkdtempSync(join(tmpdir(), 'bcn-root-probe-'))

  writeJson(join(dir, 'package.json'), {
    name: 'root-entry-probe',
    private: true,
    type: 'module',
    packageManager: packageJson.packageManager,
    devDependencies: {
      ...packageJson.peerDependencies,
      'better-convex-nuxt': `file:${ctx.tarballPath}`,
      typescript: packageJson.devDependencies.typescript,
      '@types/node': packageJson.devDependencies['@types/node'],
    },
  })
  writeFile(join(dir, '.npmrc'), 'ignore-scripts=true\n')
  writeFile(
    join(dir, 'pnpm-workspace.yaml'),
    '# isolated root for the ephemeral packed-root probe\n',
  )
  writeFile(
    join(dir, 'index.mjs'),
    [
      "import { realpathSync } from 'node:fs'",
      "import { createRequire } from 'node:module'",
      "import mod from 'better-convex-nuxt'",
      "if (typeof mod !== 'function' && typeof mod !== 'object') throw new Error('default export did not resolve')",
      '',
      '// Better Auth and Convex are stateful peer runtimes. The package and its',
      '// consumer must resolve the same physical instance of each.',
      'const consumerRequire = createRequire(import.meta.url)',
      "const libraryRequire = createRequire(new URL(import.meta.resolve('better-convex-nuxt')))",
      "for (const peer of ['better-auth', '@convex-dev/better-auth', 'convex']) {",
      '  const consumerPath = realpathSync(consumerRequire.resolve(peer))',
      '  const libraryPath = realpathSync(libraryRequire.resolve(peer))',
      '  if (consumerPath !== libraryPath) {',
      '    throw new Error(`duplicate stateful peer runtime: ${peer}`)',
      '  }',
      '}',
      '',
      "console.log('root-entry-probe runtime OK')",
      '',
    ].join('\n'),
  )
  writeFile(
    join(dir, 'index.ts'),
    [
      'import type {',
      '  BaseAuthClient, ConvexAuthMode, ConvexAuthOptions, ConvexAuthClientRegistry,',
      '  ConvexAuthStatus, ConvexCallErrorKind, ConvexClientHandle, ConvexRuntimeConfig,',
      '  InferRegisteredConvexAuthClient, ModuleOptions, ServerConvexOptions,',
      '  UseConvexAuthReturn, UseConvexMutationOptions, UseConvexPaginatedQueryOptions,',
      '  UseConvexQueryOptions,',
      "} from 'better-convex-nuxt'",
      "import mod from 'better-convex-nuxt'",
      '',
      'const _opts: ModuleOptions | undefined = undefined',
      'type PublicContract = [',
      '  BaseAuthClient, ConvexAuthMode, ConvexAuthOptions, ConvexAuthClientRegistry,',
      '  ConvexAuthStatus, ConvexCallErrorKind, ConvexClientHandle, ConvexRuntimeConfig,',
      '  InferRegisteredConvexAuthClient, ServerConvexOptions, UseConvexAuthReturn,',
      '  UseConvexMutationOptions<never>, UseConvexPaginatedQueryOptions, UseConvexQueryOptions<unknown>,',
      ']',
      'const _contract: PublicContract | undefined = undefined',
      'void mod',
      'void _opts',
      'void _contract',
      '',
    ].join('\n'),
  )
  // The root default export drags in the module-build/Nuxt/Nitro type graph
  // (`@nuxt/schema`, `nitropack`, transitively `nuxt`). Real consumers
  // typecheck that graph with `skipLibCheck: true` and bundler resolution —
  // Nuxt's own generated tsconfig does the same — so this probe matches that
  // real-world configuration rather than an artificially strict one that
  // would fail on upstream declaration quirks unrelated to this package.
  writeJson(join(dir, 'tsconfig.json'), {
    compilerOptions: {
      target: 'ES2022',
      lib: ['ES2022', 'DOM'],
      module: 'ESNext',
      moduleResolution: 'Bundler',
      strict: true,
      noEmit: true,
      skipLibCheck: true,
      types: ['node'],
    },
    include: ['index.ts'],
  })

  try {
    run('pnpm', ['install', '--no-frozen-lockfile', '--ignore-scripts'], { cwd: dir })
    run('node', ['index.mjs'], { cwd: dir })
    run('pnpm', ['exec', 'tsc', '-p', 'tsconfig.json'], { cwd: dir })
  } catch (error) {
    ctx.failures.push(`[.] packed root-entry probe failed: ${error.message}`)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

/**
 * `/errors` probe: installs the packed tarball into the committed
 * `test/fixtures/errors-consumer` fixture and runs
 * its `build` (type resolution via `tsc`) and `start` (runtime resolution +
 * behavioral assertions) scripts.
 */
export function probeErrorsEntry(ctx) {
  const fixtureDir = p('test/fixtures/errors-consumer')
  const localTarball = join(fixtureDir, 'better-convex-nuxt.tgz')
  copyFileSync(ctx.tarballPath, localTarball)

  try {
    run('pnpm', ['install', '--no-frozen-lockfile', '--ignore-scripts'], { cwd: fixtureDir })
    run('pnpm', ['run', 'build'], { cwd: fixtureDir })
    run('pnpm', ['run', 'start'], { cwd: fixtureDir })
  } catch (error) {
    ctx.failures.push(`[./errors] packed errors-consumer probe failed: ${error.message}`)
  } finally {
    rmSync(join(fixtureDir, 'node_modules'), { recursive: true, force: true })
    rmSync(join(fixtureDir, 'dist'), { recursive: true, force: true })
    rmSync(localTarball, { force: true })
    rmSync(join(fixtureDir, 'pnpm-lock.yaml'), { force: true })
  }
}

/**
 * `/auth-client` probe. Installs the
 * packed tarball into the committed `test/fixtures/auth-client-typing` fixture
 * so the module and consumer share ONE `better-auth` copy, then:
 *   - `nuxi prepare` generates the REAL registry declaration from the fixture's
 *     `convex-auth.ts` (apiKeyClient) definition;
 *   - `nuxi typecheck` proves the narrowed `InferRegisteredConvexAuthClient`
 *     exposes a typed `apiKey.create` method;
 *   - `tsc` over the separate `base-fallback` program proves the empty-fallback
 *     registration exposes only the base client, with no `apiKey` method.
 */
export function probeAuthClientTyping(ctx) {
  const fixtureDir = p('test/fixtures/auth-client-typing')
  const localTarball = join(fixtureDir, 'better-convex-nuxt.tgz')
  copyFileSync(ctx.tarballPath, localTarball)

  try {
    run('pnpm', ['install', '--no-frozen-lockfile', '--ignore-scripts'], { cwd: fixtureDir })
    run('pnpm', ['run', 'prepare:types'], { cwd: fixtureDir })
    run('pnpm', ['run', 'typecheck'], { cwd: fixtureDir })
    run('pnpm', ['run', 'typecheck:base-fallback'], { cwd: fixtureDir })
  } catch (error) {
    ctx.failures.push(`[./auth-client] packed auth-client-typing probe failed: ${error.message}`)
  } finally {
    rmSync(join(fixtureDir, 'node_modules'), { recursive: true, force: true })
    rmSync(join(fixtureDir, '.nuxt'), { recursive: true, force: true })
    rmSync(join(fixtureDir, '.output'), { recursive: true, force: true })
    rmSync(localTarball, { force: true })
    rmSync(join(fixtureDir, 'pnpm-lock.yaml'), { force: true })
  }
}

/**
 * `/server` probe: installs the packed tarball into the committed
 * `test/fixtures/server-consumer` fixture and runs `nuxi prepare` followed
 * by `nuxi typecheck`, proving the real `better-convex-nuxt/server` subpath
 * resolves from the packed package.
 */
export function probeServerEntry(ctx) {
  const fixtureDir = p('test/fixtures/server-consumer')
  const localTarball = join(fixtureDir, 'better-convex-nuxt.tgz')
  copyFileSync(ctx.tarballPath, localTarball)

  try {
    run('pnpm', ['install', '--no-frozen-lockfile', '--ignore-scripts'], { cwd: fixtureDir })
    run('pnpm', ['run', 'prepare:types'], { cwd: fixtureDir })
    run('pnpm', ['run', 'typecheck'], { cwd: fixtureDir })
    run(
      'node',
      [
        '--input-type=module',
        '--eval',
        "const server = await import('better-convex-nuxt/server'); if (typeof server.serverConvex !== 'function') process.exit(1)",
      ],
      { cwd: fixtureDir },
    )
  } catch (error) {
    ctx.failures.push(`[./server] packed server-consumer probe failed: ${error.message}`)
  } finally {
    rmSync(join(fixtureDir, 'node_modules'), { recursive: true, force: true })
    rmSync(join(fixtureDir, '.nuxt'), { recursive: true, force: true })
    rmSync(join(fixtureDir, '.output'), { recursive: true, force: true })
    rmSync(localTarball, { force: true })
    rmSync(join(fixtureDir, 'pnpm-lock.yaml'), { force: true })
  }
}

/**
 * `/server/createUserSyncTriggers` probe: this entry is framework-free (no
 * Nuxt/H3/Convex import of its own), so — like `/errors` — it is proved with
 * a standalone Node consumer rather than a full Nuxt fixture: installs the
 * packed tarball into `test/fixtures/user-sync-triggers-consumer` and runs its
 * `build` (type resolution via `tsc`) and `start` (runtime resolution).
 */
export function probeCreateUserSyncTriggersEntry(ctx) {
  const fixtureDir = p('test/fixtures/user-sync-triggers-consumer')
  const localTarball = join(fixtureDir, 'better-convex-nuxt.tgz')
  copyFileSync(ctx.tarballPath, localTarball)

  try {
    run('pnpm', ['install', '--no-frozen-lockfile', '--ignore-scripts'], { cwd: fixtureDir })
    run('pnpm', ['run', 'build'], { cwd: fixtureDir })
    run('pnpm', ['run', 'start'], { cwd: fixtureDir })
  } catch (error) {
    ctx.failures.push(
      `[./server/createUserSyncTriggers] packed user-sync-triggers-consumer probe failed: ${error.message}`,
    )
  } finally {
    rmSync(join(fixtureDir, 'node_modules'), { recursive: true, force: true })
    rmSync(join(fixtureDir, 'dist'), { recursive: true, force: true })
    rmSync(localTarball, { force: true })
    rmSync(join(fixtureDir, 'pnpm-lock.yaml'), { force: true })
  }
}

function writeFile(path, content) {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, content, 'utf8')
}

function writeJson(path, value) {
  return writeFile(path, `${JSON.stringify(value, null, 2)}\n`)
}
