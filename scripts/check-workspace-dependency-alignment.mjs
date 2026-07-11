#!/usr/bin/env node
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const rootDir = process.cwd()
const rootPackage = readPackage('package.json')

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
