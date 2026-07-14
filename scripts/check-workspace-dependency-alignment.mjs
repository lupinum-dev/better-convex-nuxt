#!/usr/bin/env node
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const rootDir = process.cwd()
const rootPackage = readPackage('package.json')
const distributedAppManifests = [
  'demo/package.json',
  ...readdirSync(resolve(rootDir, 'starters'), { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => `starters/${entry.name}/package.json`),
]

const alignedDependencies = ['@convex-dev/better-auth', 'better-auth', 'convex', 'nuxt', 'vue-tsc']

const rootSpecifiers = new Map(
  alignedDependencies.flatMap((name) => {
    const specifier = dependencySpecifier(rootPackage, name)
    return specifier ? [[name, specifier]] : []
  }),
)

const manifestPaths = [
  'demo/package.json',
  'playground/package.json',
  ...readdirSync(resolve(rootDir, 'starters'), { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => `starters/${entry.name}/package.json`),
  ...packageManifestsIn('test/fixtures'),
  ...packageManifestsIn('test/proofs', 'consumer'),
].filter((path) => existsSync(resolve(rootDir, path)))

const failures = []

for (const manifestPath of manifestPaths) {
  const packageJson = readPackage(manifestPath)
  for (const [name, expected] of rootSpecifiers) {
    const actual = dependencySpecifier(packageJson, name)
    if (actual && normalizeSpecifier(actual) !== normalizeSpecifier(expected)) {
      failures.push(`${manifestPath} declares ${name}@${actual}; expected ${expected}`)
    }
  }
}

for (const manifestPath of distributedAppManifests) {
  const appDir = manifestPath.slice(0, -'/package.json'.length)
  const packageJson = readPackage(manifestPath)
  const expected = rootSpecifiers.get('better-convex-nuxt') ?? rootPackage.version
  const actual = dependencySpecifier(packageJson, 'better-convex-nuxt')
  if (actual !== expected) {
    failures.push(`${manifestPath} declares better-convex-nuxt@${actual}; expected ${expected}`)
  }

  const workspacePath = resolve(rootDir, appDir, 'pnpm-workspace.yaml')
  if (existsSync(workspacePath)) {
    const workspace = readFileSync(workspacePath, 'utf8')
    if (/better-convex-nuxt\s*:\s*(?:file|link|workspace):/u.test(workspace)) {
      failures.push(`${appDir}/pnpm-workspace.yaml overrides better-convex-nuxt locally`)
    }
  }

  const lockPath = resolve(rootDir, appDir, 'pnpm-lock.yaml')
  if (!existsSync(lockPath)) {
    failures.push(`${appDir}/pnpm-lock.yaml is missing`)
    continue
  }
  const lock = readFileSync(lockPath, 'utf8')
  if (/\/private\/|\/Users\/|\/home\/|[A-Z]:\\\\Users\\\\/u.test(lock)) {
    failures.push(`${appDir}/pnpm-lock.yaml contains a source-machine absolute path`)
  }
  if (/better-convex-nuxt@(?:file|link):/u.test(lock)) {
    failures.push(`${appDir}/pnpm-lock.yaml resolves better-convex-nuxt from a local path`)
  }
  const lockedSpecifier = lock.match(
    /\n {6}better-convex-nuxt:\n {8}specifier: ['"]?([^'"\n]+)['"]?/u,
  )?.[1]
  if (lockedSpecifier !== actual) {
    failures.push(
      `${appDir}/pnpm-lock.yaml records better-convex-nuxt@${lockedSpecifier ?? '<missing>'}; manifest declares ${actual}`,
    )
  }
  if (!lock.includes(`\n  better-convex-nuxt@${actual}:`)) {
    failures.push(`${appDir}/pnpm-lock.yaml has no registry package entry for ${actual}`)
  }
}

if (existsSync(resolve(rootDir, 'test/fixtures/consumer-smoke/pnpm-lock.yaml'))) {
  failures.push(
    'test/fixtures/consumer-smoke/pnpm-lock.yaml must stay ephemeral; its packed-tarball path is run-specific',
  )
}

if (failures.length > 0) {
  console.error(`Workspace dependency alignment failed with ${failures.length} issue(s):`)
  for (const failure of failures) {
    console.error(`- ${failure}`)
  }
  process.exitCode = 1
} else {
  console.log(
    `Workspace dependency alignment passed (${manifestPaths.length} manifest(s) checked).`,
  )
}

function readPackage(path) {
  return JSON.parse(readFileSync(resolve(rootDir, path), 'utf8'))
}

function dependencySpecifier(packageJson, name) {
  return (
    packageJson.dependencies?.[name] ??
    packageJson.devDependencies?.[name] ??
    packageJson.peerDependencies?.[name]
  )
}

function normalizeSpecifier(specifier) {
  return specifier.replace(/^[~^]/, '')
}

function packageManifestsIn(parent, child) {
  return readdirSync(resolve(rootDir, parent), { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => [parent, entry.name, child, 'package.json'].filter(Boolean).join('/'))
}
