#!/usr/bin/env node

import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { productionManifestContractDigest } from './package-check/production-manifest-contract.mjs'
import {
  requiredPhysicalRuntimeNames,
  requiredStatefulPeerNames,
  supportedDependencyTuple,
} from './supported-dependency-tuple.mjs'

const root = process.cwd()
const args = process.argv.slice(2)
const outputIndex = args.indexOf('--output')
const outputPath = outputIndex >= 0 ? args[outputIndex + 1] : undefined
const rootManifestIndex = args.indexOf('--root-manifest')
const rootManifestArgument = rootManifestIndex >= 0 ? args[rootManifestIndex + 1] : 'package.json'
if (!rootManifestArgument || (outputIndex >= 0 && !outputPath)) {
  throw new Error(
    'Usage: generate-sbom.mjs [--root-manifest <package.json>] --output <path> | --check',
  )
}
const rootManifestPath = resolve(root, rootManifestArgument)
const pkg = JSON.parse(readFileSync(rootManifestPath, 'utf8'))
if (typeof pkg.name !== 'string' || typeof pkg.version !== 'string') {
  throw new TypeError(`SBOM root manifest has an invalid package identity: ${rootManifestPath}`)
}

function purl(name, version) {
  const encodedName = name.startsWith('@') ? `%40${name.slice(1)}` : encodeURIComponent(name)
  return `pkg:npm/${encodedName}@${encodeURIComponent(version)}`
}

// A published package does not carry its lockfile or a resolved node_modules
// graph. Release verification therefore first proves that the extracted
// candidate's production manifest contract is exactly equal as JSON to the
// reviewed source contract, then uses that candidate as this
// SBOM's root while resolving transitive production components from the
// frozen-lock checkout. A consuming application's peer/transitive closure
// belongs in that application's own resolved SBOM.
const listed = JSON.parse(
  execFileSync('pnpm', ['list', '--prod', '--json', '--depth', 'Infinity'], {
    cwd: root,
    encoding: 'utf8',
  }),
)
const components = new Map()

function addComponent(name, version, dependencyKind) {
  const bomRef = purl(name, version)
  const existing = components.get(bomRef)
  if (existing) return existing

  const component = {
    type: 'library',
    'bom-ref': bomRef,
    name,
    version,
    purl: bomRef,
    ...(dependencyKind
      ? { properties: [{ name: 'better-convex-nuxt:dependency-kind', value: dependencyKind }] }
      : {}),
  }
  components.set(bomRef, component)
  return component
}

function collect(dependencies) {
  for (const [name, dependency] of Object.entries(dependencies ?? {})) {
    if (!dependency.version) continue
    addComponent(name, dependency.version)
    collect(dependency.dependencies)
  }
}

for (const project of listed) collect(project.dependencies)

// Better Auth and Convex are exact required peers so the consuming application
// owns one physical runtime tuple. `pnpm list --prod` correctly omits them from
// this package's dependency closure, but they remain required production
// components of the published contract and must be visible in its SBOM. Their
// transitive closure belongs to the consuming application's resolved SBOM.
for (const [name, version] of Object.entries(pkg.peerDependencies ?? {})) {
  addComponent(name, version, 'required-peer')
}
for (const name of requiredPhysicalRuntimeNames) {
  addComponent(
    name,
    supportedDependencyTuple[name],
    pkg.peerDependencies?.[name] ? 'required-peer' : 'required-runtime',
  )
}

const bom = {
  bomFormat: 'CycloneDX',
  specVersion: '1.6',
  version: 1,
  metadata: {
    timestamp: new Date().toISOString(),
    tools: {
      components: [
        {
          type: 'application',
          name: 'better-convex-nuxt-sbom-generator',
          version: pkg.version,
        },
      ],
    },
    component: {
      type: 'library',
      name: pkg.name,
      version: pkg.version,
      purl: purl(pkg.name, pkg.version),
      properties: [
        {
          name: 'better-convex-nuxt:production-manifest-contract-sha256',
          value: productionManifestContractDigest(pkg),
        },
      ],
    },
  },
  components: [...components.values()].sort((a, b) => a['bom-ref'].localeCompare(b['bom-ref'])),
}

if (bom.components.length === 0) throw new Error('SBOM contains no production dependencies.')
for (const required of [
  ...new Set([...requiredStatefulPeerNames, ...requiredPhysicalRuntimeNames, 'convex-helpers']),
]) {
  if (!bom.components.some((component) => component.name === required)) {
    throw new Error(`SBOM is missing required production component ${required}.`)
  }
}

if (args.includes('--check')) {
  console.log(`CycloneDX SBOM check passed (${bom.components.length} production components).`)
} else {
  if (!outputPath) {
    throw new Error(
      'Usage: generate-sbom.mjs [--root-manifest <package.json>] --output <path> | --check',
    )
  }
  writeFileSync(resolve(root, outputPath), `${JSON.stringify(bom, null, 2)}\n`)
  console.log(`Generated CycloneDX SBOM at ${outputPath}`)
}
