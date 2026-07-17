#!/usr/bin/env node
import { execFileSync, spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import {
  copyFileSync,
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { dirname, join, relative, resolve } from 'node:path'

import { maintainedCandidateApps } from './maintained-candidate-apps.mjs'

const repoRoot = resolve(import.meta.dirname, '..')
const agencyConvexDeployKey = process.env.AGENCY_CONVEX_DEPLOY_KEY
const inheritedEnvironment = Object.fromEntries(
  [
    'COREPACK_HOME',
    'GIT_INDEX_FILE',
    'HOME',
    'HTTPS_PROXY',
    'HTTP_PROXY',
    'LANG',
    'LC_ALL',
    'NODE_EXTRA_CA_CERTS',
    'NO_PROXY',
    'PATH',
    'PNPM_HOME',
    'SSL_CERT_DIR',
    'SSL_CERT_FILE',
    'TEMP',
    'TMP',
    'TMPDIR',
    'USERPROFILE',
    'XDG_CACHE_HOME',
    'XDG_CONFIG_HOME',
    'XDG_DATA_HOME',
    'https_proxy',
    'http_proxy',
    'no_proxy',
  ].flatMap((name) => (process.env[name] === undefined ? [] : [[name, process.env[name]]])),
)
const deterministicEnvironment = {
  ...inheritedEnvironment,
  BCN_AUTH_PROXY_IP_SECRET: 'candidate-artifact-proxy-ip-secret-32-characters',
  BETTER_AUTH_SECRETS: '1:candidate-artifact-verification-secret-32-characters',
  CI: 'true',
  CONVEX_SITE_URL: 'https://candidate-artifact.convex.site',
  CONVEX_URL: 'https://candidate-artifact.convex.cloud',
  NUXT_PUBLIC_CONVEX_SITE_URL: 'https://candidate-artifact.convex.site',
  NUXT_PUBLIC_CONVEX_URL: 'https://candidate-artifact.convex.cloud',
  NUXT_TELEMETRY_DISABLED: '1',
  SITE_URL: 'http://127.0.0.1:3000',
  TZ: 'UTC',
  VITE_CONVEX_SITE_URL: 'https://candidate-artifact.convex.site',
  VITE_CONVEX_URL: 'https://candidate-artifact.convex.cloud',
}

const args = process.argv.slice(2)
if (args.length !== 0 && (args.length !== 2 || args[0] !== '--tarball')) {
  console.error('Usage: node scripts/check-candidate-apps.mjs [--tarball <path>]')
  process.exit(1)
}
const suppliedTarball = args.length === 2 ? resolve(repoRoot, args[1]) : undefined

function run(command, commandArgs, options = {}) {
  console.log(`\n> ${[command, ...commandArgs].join(' ')}`)
  return execFileSync(command, commandArgs, {
    cwd: options.cwd ?? repoRoot,
    encoding: 'utf8',
    env: options.env ?? deterministicEnvironment,
    stdio: options.capture ? 'pipe' : 'inherit',
  })
}

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'))
}

function writeJson(path, value) {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`)
}

function sha512(path) {
  return createHash('sha512').update(readFileSync(path)).digest('base64')
}

function packageFingerprint(directory) {
  const files = []

  function walk(current) {
    for (const name of readdirSync(current).sort()) {
      if (name === 'node_modules') continue
      const path = join(current, name)
      const stats = lstatSync(path)
      if (stats.isDirectory()) {
        walk(path)
      } else if (stats.isFile()) {
        files.push({
          path: relative(directory, path).split('\\').join('/'),
          sha256: createHash('sha256').update(readFileSync(path)).digest('hex'),
        })
      } else {
        throw new Error(`Unexpected non-file package entry: ${path}`)
      }
    }
  }

  walk(directory)
  return files
}

function dependencySpecifier(packageJson, name) {
  return (
    packageJson.dependencies?.[name] ??
    packageJson.devDependencies?.[name] ??
    packageJson.peerDependencies?.[name]
  )
}

function copyApp(app, destinationDir) {
  const untracked = run(
    'git',
    ['ls-files', '--others', '--exclude-standard', '-z', '--', app.path],
    { capture: true },
  )
    .split('\0')
    .filter(Boolean)
  if (untracked.length > 0) {
    throw new Error(`${app.path} has untracked release inputs: ${untracked.join(', ')}`)
  }

  const tracked = run('git', ['ls-files', '--cached', '-z', '--', app.path], {
    capture: true,
  })
    .split('\0')
    .filter(Boolean)
  if (tracked.length === 0) throw new Error(`${app.path} has no Git-tracked files`)

  for (const repositoryPath of tracked) {
    const sourcePath = join(repoRoot, repositoryPath)
    if (!existsSync(sourcePath)) continue
    const destinationPath = join(destinationDir, relative(app.path, repositoryPath))
    mkdirSync(dirname(destinationPath), { recursive: true })
    cpSync(sourcePath, destinationPath, { recursive: true })
  }

  copyFileSync(join(repoRoot, 'LICENSE'), join(destinationDir, 'LICENSE'))
}

function assertNoRepositoryOverride(app) {
  const workspacePath = join(repoRoot, app.path, 'pnpm-workspace.yaml')
  if (!existsSync(workspacePath)) return
  const workspace = readFileSync(workspacePath, 'utf8')
  if (/better-convex-nuxt\s*:\s*(?:file|link|workspace):/u.test(workspace)) {
    throw new Error(
      `${app.path}/pnpm-workspace.yaml must not override better-convex-nuxt to the repository`,
    )
  }
}

function compareGeneratedTree(sourceDir, candidateDir) {
  const source = packageFingerprint(sourceDir)
  const candidate = packageFingerprint(candidateDir)
  if (JSON.stringify(source) !== JSON.stringify(candidate)) {
    throw new Error(
      'Agency Convex codegen changed convex/_generated; regenerate and commit the live output',
    )
  }
}

function productionPublicFiles(publicDirectory) {
  if (!existsSync(publicDirectory)) {
    throw new Error('mcp-oauth-agent: production build omitted .output/public')
  }
  const files = []
  const visit = (directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true }).sort((a, b) =>
      a.name.localeCompare(b.name),
    )) {
      const path = join(directory, entry.name)
      if (entry.isDirectory()) visit(path)
      else if (entry.isFile()) files.push(relative(publicDirectory, path).split('\\').join('/'))
      else throw new Error(`mcp-oauth-agent: unexpected public build entry ${path}`)
    }
  }
  visit(publicDirectory)
  return files
}

async function availableProductionPort() {
  const server = createServer()
  await new Promise((ready, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', ready)
  })
  const address = server.address()
  if (!address || typeof address === 'string') {
    server.close()
    throw new Error('mcp-oauth-agent: could not allocate a production probe port')
  }
  await new Promise((ready, reject) => server.close((error) => (error ? reject(error) : ready())))
  return address.port
}

async function stopProductionServer(child) {
  if (child.exitCode !== null) return
  child.kill('SIGTERM')
  const stopped = await Promise.race([
    new Promise((ready) => child.once('exit', () => ready(true))),
    new Promise((ready) => setTimeout(() => ready(false), 2_000)),
  ])
  if (!stopped) {
    child.kill('SIGKILL')
    if (child.exitCode === null) {
      await new Promise((ready) => child.once('exit', ready))
    }
  }
}

async function responseStatus(url) {
  const response = await fetch(url, {
    redirect: 'manual',
    signal: AbortSignal.timeout(10_000),
  })
  await response.body?.cancel().catch(() => {})
  return response.status
}

async function waitForProductionAsset(child, url) {
  const deadline = Date.now() + 30_000
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error('mcp-oauth-agent: production server exited before source-map probe')
    }
    try {
      if ((await responseStatus(url)) === 200) return
    } catch {
      // The bounded readiness loop retries connection refusal while Nitro starts.
    }
    await new Promise((ready) => setTimeout(ready, 100))
  }
  throw new Error('mcp-oauth-agent: production asset did not become reachable')
}

async function assertProductionSourceMapsArePrivate(appDir) {
  const outputDirectory = join(appDir, '.output')
  const publicDirectory = join(outputDirectory, 'public')
  const publicFiles = productionPublicFiles(publicDirectory)
  const publicMaps = publicFiles.filter((file) => file.endsWith('.map'))
  if (publicMaps.length > 0) {
    throw new Error(
      `mcp-oauth-agent: production public output contains source maps: ${publicMaps.join(', ')}`,
    )
  }

  const publicCode = publicFiles.filter((file) => /\.(?:css|js|mjs)$/u.test(file))
  for (const file of publicCode) {
    if (/sourceMappingURL\s*=\s*data:/u.test(readFileSync(join(publicDirectory, file), 'utf8'))) {
      throw new Error(`mcp-oauth-agent: production public output embeds a source map in ${file}`)
    }
  }

  const asset = publicFiles.find((file) => file.startsWith('_nuxt/') && file.endsWith('.js'))
  if (!asset) throw new Error('mcp-oauth-agent: production build omitted a public JavaScript asset')
  const serverEntry = join(outputDirectory, 'server', 'index.mjs')
  if (!existsSync(serverEntry)) {
    throw new Error('mcp-oauth-agent: production build omitted .output/server/index.mjs')
  }

  const port = await availableProductionPort()
  const origin = `http://127.0.0.1:${port}`
  const child = spawn(process.execPath, [serverEntry], {
    cwd: appDir,
    env: {
      ...deterministicEnvironment,
      HOST: '127.0.0.1',
      NITRO_HOST: '127.0.0.1',
      NITRO_PORT: String(port),
      NODE_ENV: 'production',
      PORT: String(port),
    },
    stdio: 'ignore',
  })
  try {
    await waitForProductionAsset(child, `${origin}/${asset}`)
    const probes = [`/${asset}.map`, '/index.mjs.map']
    const statuses = []
    for (const path of probes) {
      const status = await responseStatus(`${origin}${path}`)
      if (status === 200) {
        throw new Error(`mcp-oauth-agent: production server publicly served ${path}`)
      }
      statuses.push(`${path}=${status}`)
    }
    console.log(
      `[candidate-source-maps] PASS: mcp-oauth-agent production public output has no map files or inline maps; ${statuses.join(', ')}.`,
    )
  } finally {
    await stopProductionServer(child)
  }
}

const scratchDir = mkdtempSync(join(tmpdir(), 'bcn-candidate-apps-'))

try {
  let tarballPath = suppliedTarball
  if (!tarballPath) {
    run('pnpm', ['run', 'prepack'])
    const packResult = JSON.parse(
      run('npm', ['pack', '--json', '--ignore-scripts', '--pack-destination', scratchDir], {
        capture: true,
      }),
    )
    tarballPath = join(scratchDir, packResult[0].filename)
  }

  if (!existsSync(tarballPath)) {
    throw new Error(`Candidate tarball does not exist: ${tarballPath}`)
  }

  const extractedDir = join(scratchDir, 'extracted')
  mkdirSync(extractedDir)
  run('tar', ['-xzf', tarballPath, '-C', extractedDir])
  const extractedPackageDir = join(extractedDir, 'package')
  const candidateManifest = readJson(join(extractedPackageDir, 'package.json'))
  const expectedFingerprint = packageFingerprint(extractedPackageDir)
  const tarballIntegrity = sha512(tarballPath)

  for (const app of maintainedCandidateApps) {
    assertNoRepositoryOverride(app)
    const sourceDir = join(repoRoot, app.path)
    const sourceManifest = readJson(join(sourceDir, 'package.json'))
    const sourceVersion = dependencySpecifier(sourceManifest, 'better-convex-nuxt')
    if (sourceVersion !== candidateManifest.version) {
      throw new Error(
        `${app.path}/package.json declares better-convex-nuxt@${sourceVersion ?? '<missing>'}; expected ${candidateManifest.version}`,
      )
    }
    const sourceLockPath = join(sourceDir, 'pnpm-lock.yaml')
    if (!existsSync(sourceLockPath)) {
      throw new Error(`${app.path}/pnpm-lock.yaml is missing`)
    }
    const appDir = join(scratchDir, 'apps', app.name)
    copyApp(app, appDir)
    const localTarball = join(appDir, 'better-convex-nuxt.tgz')
    copyFileSync(tarballPath, localTarball)
    if (sha512(localTarball) !== tarballIntegrity) {
      throw new Error(`${app.path}: copied candidate tarball differs from the release artifact`)
    }

    const manifestPath = join(appDir, 'package.json')
    const manifest = readJson(manifestPath)
    if (manifest.dependencies?.['better-convex-nuxt']) {
      manifest.dependencies['better-convex-nuxt'] = 'file:./better-convex-nuxt.tgz'
    } else if (manifest.devDependencies?.['better-convex-nuxt']) {
      manifest.devDependencies['better-convex-nuxt'] = 'file:./better-convex-nuxt.tgz'
    } else {
      throw new Error(`${app.path}/package.json does not declare better-convex-nuxt`)
    }
    writeJson(manifestPath, manifest)

    console.log(
      `\n=== ${app.path} against ${candidateManifest.name}@${candidateManifest.version} ===`,
    )
    // Preserve every committed transitive resolution. Only replace the module
    // package entry with the exact local tarball, then prove that resulting
    // candidate lock is internally frozen-installable.
    run('pnpm', ['install', '--lockfile-only', '--no-frozen-lockfile', '--ignore-scripts'], {
      cwd: appDir,
    })
    run('pnpm', ['install', '--frozen-lockfile', '--ignore-scripts'], { cwd: appDir })

    const lock = readFileSync(join(appDir, 'pnpm-lock.yaml'), 'utf8')
    if (!lock.includes('better-convex-nuxt.tgz')) {
      throw new Error(`${app.path}: the fresh lock does not resolve the candidate tarball`)
    }

    const installedPackageDir = join(appDir, 'node_modules', 'better-convex-nuxt')
    const installedManifest = readJson(join(installedPackageDir, 'package.json'))
    if (installedManifest.version !== candidateManifest.version) {
      throw new Error(
        `${app.path}: installed ${installedManifest.version}; expected ${candidateManifest.version}`,
      )
    }
    const installedFingerprint = packageFingerprint(installedPackageDir)
    if (JSON.stringify(installedFingerprint) !== JSON.stringify(expectedFingerprint)) {
      throw new Error(`${app.path}: installed package bytes differ from the candidate tarball`)
    }

    if (app.name === 'agency' && agencyConvexDeployKey) {
      run('pnpm', ['run', 'convex:codegen'], {
        cwd: appDir,
        env: {
          ...deterministicEnvironment,
          CONVEX_DEPLOY_KEY: agencyConvexDeployKey,
        },
      })
      compareGeneratedTree(
        join(sourceDir, 'convex', '_generated'),
        join(appDir, 'convex', '_generated'),
      )
    }

    run('pnpm', ['run', 'typecheck'], { cwd: appDir })
    if (manifest.scripts?.test) run('pnpm', ['run', 'test'], { cwd: appDir })
    run('pnpm', ['run', 'build'], {
      cwd: appDir,
      env: { ...deterministicEnvironment, NODE_ENV: 'production' },
    })
    if (app.name === 'mcp-oauth-agent') await assertProductionSourceMapsArePrivate(appDir)
  }

  if (!agencyConvexDeployKey) {
    console.log(
      '\nAgency live codegen freshness skipped: set AGENCY_CONVEX_DEPLOY_KEY to enable it.',
    )
  }
  console.log(
    `\nCandidate app matrix passed (${maintainedCandidateApps.length} clean app copies, one exact tarball).`,
  )
} finally {
  rmSync(scratchDir, { recursive: true, force: true })
}
