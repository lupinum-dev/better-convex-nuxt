#!/usr/bin/env node

import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import {
  cpSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const repositoryRoot = resolve(import.meta.dirname, '..')
const packageRoot = join(repositoryRoot, 'packages/vue')
const fixtureRoot = join(repositoryRoot, 'test/fixtures/vue-anonymous')
const scratchRoot = mkdtempSync(join(tmpdir(), 'better-convex-vue-anonymous-'))
const consumerRoot = join(scratchRoot, 'consumer')
const tarballName = 'better-convex-vue.tgz'
const forbiddenPackages = new Set([
  'better-auth',
  '@better-auth/core',
  '@better-auth/oauth-provider',
  'nuxt',
  'nitropack',
  'h3',
])
const forbiddenBundleMarkers = [
  'better-auth',
  '@better-auth/',
  'nitropack',
  'from"h3"',
  'from"nuxt"',
]

function run(command, args, cwd, options = {}) {
  return execFileSync(command, args, {
    cwd,
    encoding: 'utf8',
    stdio: 'inherit',
    ...options,
  })
}

function collectFiles(directory) {
  if (!existsSync(directory)) return []
  return readdirSync(directory).flatMap((name) => {
    const path = join(directory, name)
    return statSync(path).isDirectory() ? collectFiles(path) : [path]
  })
}

function collectDependencyNames(graph) {
  const names = new Set()
  const visit = (node) => {
    for (const section of ['dependencies', 'optionalDependencies']) {
      for (const [name, dependency] of Object.entries(node?.[section] ?? {})) {
        names.add(name)
        if (dependency && typeof dependency === 'object') visit(dependency)
      }
    }
  }
  for (const root of graph) visit(root)
  return names
}

try {
  run('pnpm', ['run', 'build'], packageRoot)
  const packOutput = execFileSync(
    'npm',
    ['pack', '--json', '--ignore-scripts', '--pack-destination', scratchRoot],
    { cwd: packageRoot, encoding: 'utf8' },
  )
  const packResult = JSON.parse(packOutput)
  if (!Array.isArray(packResult) || packResult.length !== 1 || !packResult[0]?.filename) {
    throw new Error('Vue package pack must produce exactly one tarball')
  }
  const packedTarball = join(scratchRoot, packResult[0].filename)
  const tarballBytes = readFileSync(packedTarball)
  const tarballSha256 = createHash('sha256').update(tarballBytes).digest('hex')

  cpSync(fixtureRoot, consumerRoot, { recursive: true })
  cpSync(packedTarball, join(consumerRoot, tarballName))
  run('pnpm', ['install', '--frozen-lockfile=false', '--ignore-scripts'], consumerRoot)
  run('pnpm', ['run', 'typecheck'], consumerRoot)
  run('pnpm', ['run', 'build'], consumerRoot)

  const installedManifest = JSON.parse(
    readFileSync(join(consumerRoot, 'node_modules/better-convex-vue/package.json'), 'utf8'),
  )
  if (
    installedManifest.name !== 'better-convex-vue' ||
    installedManifest.version !== '0.8.0-beta.0'
  ) {
    throw new Error('Anonymous consumer installed an unexpected Vue package identity')
  }
  const graph = JSON.parse(
    execFileSync('pnpm', ['list', '--prod', '--depth', 'Infinity', '--json'], {
      cwd: consumerRoot,
      encoding: 'utf8',
      maxBuffer: 32 * 1024 * 1024,
    }),
  )
  const dependencyNames = collectDependencyNames(graph)
  const forbiddenInstalled = [...forbiddenPackages].filter((name) => dependencyNames.has(name))
  if (forbiddenInstalled.length > 0) {
    throw new Error(`Anonymous production graph contains: ${forbiddenInstalled.join(', ')}`)
  }

  const bundleText = collectFiles(join(consumerRoot, 'dist'))
    .filter((file) => /\.(?:html|js|css)$/u.test(file))
    .map((file) => readFileSync(file, 'utf8'))
    .join('\n')
  const leakedMarkers = forbiddenBundleMarkers.filter((marker) => bundleText.includes(marker))
  if (leakedMarkers.length > 0) {
    throw new Error(
      `Anonymous production bundle contains forbidden marker(s): ${leakedMarkers.join(', ')}`,
    )
  }
  if (!bundleText.includes('better-convex-vue-anonymous')) {
    throw new Error('Anonymous production bundle is missing its positive-control marker')
  }

  console.log(`Anonymous Vue consumer passed (tarball sha256 ${tarballSha256}).`)
} finally {
  rmSync(scratchRoot, { recursive: true, force: true })
}
