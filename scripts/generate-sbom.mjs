#!/usr/bin/env node

import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = process.cwd()
const pkg = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'))
const args = process.argv.slice(2)
const outputIndex = args.indexOf('--output')
const outputPath = outputIndex >= 0 ? args[outputIndex + 1] : undefined

function purl(name, version) {
  const encodedName = name.startsWith('@') ? `%40${name.slice(1)}` : encodeURIComponent(name)
  return `pkg:npm/${encodedName}@${encodeURIComponent(version)}`
}

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
    },
  },
  components: [...components.values()].sort((a, b) => a['bom-ref'].localeCompare(b['bom-ref'])),
}

if (bom.components.length === 0) throw new Error('SBOM contains no production dependencies.')
for (const required of ['better-auth', '@convex-dev/better-auth', 'convex']) {
  if (!bom.components.some((component) => component.name === required)) {
    throw new Error(`SBOM is missing required production component ${required}.`)
  }
}

if (args.includes('--check')) {
  console.log(`CycloneDX SBOM check passed (${bom.components.length} production components).`)
} else {
  if (!outputPath) throw new Error('Usage: generate-sbom.mjs --output <path> | --check')
  writeFileSync(resolve(root, outputPath), `${JSON.stringify(bom, null, 2)}\n`)
  console.log(`Generated CycloneDX SBOM at ${outputPath}`)
}
