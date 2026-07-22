#!/usr/bin/env node

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { relative, resolve, sep } from 'node:path'
import { pathToFileURL } from 'node:url'

const removedPaths = ['src/runtime/client-core', 'src/runtime/auth/client-engine.ts']
const forbiddenMarkers = [
  'packages/vue/src/',
  'better-convex-vue/internal',
  'src/runtime/client-core',
  'attachClientIdentity',
  'createBetterConvexBrowserRuntime',
  'createCallableController',
  'createClientOwner',
  'createPaginationController',
  'createQueryController',
]

function textFiles(directory) {
  if (!existsSync(directory)) return []
  const files = []
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = resolve(directory, entry.name)
    if (entry.isDirectory()) files.push(...textFiles(path))
    else if (entry.isFile() && statSync(path).size <= 5_000_000) files.push(path)
  }
  return files
}

export function findNuxtClientEngineViolations(root, options = {}) {
  const violations = []
  for (const path of removedPaths) {
    if (existsSync(resolve(root, path))) violations.push(`removed path exists: ${path}`)
  }

  const scanRoots = [{ label: 'source', path: resolve(root, 'src/runtime') }]
  if (options.dist) scanRoots.push({ label: 'dist', path: resolve(root, 'dist') })

  for (const scanRoot of scanRoots) {
    if (!existsSync(scanRoot.path)) {
      violations.push(`${scanRoot.label} root is missing: ${relative(root, scanRoot.path)}`)
      continue
    }
    for (const file of textFiles(scanRoot.path)) {
      let contents
      try {
        contents = readFileSync(file, 'utf8')
      } catch {
        continue
      }
      const repositoryPath = relative(root, file).split(sep).join('/')
      for (const marker of forbiddenMarkers) {
        if (contents.includes(marker)) violations.push(`${repositoryPath}: forbidden ${marker}`)
      }
    }
  }
  return violations
}

export function runNuxtClientEngineCheck(root, options = {}) {
  const violations = findNuxtClientEngineViolations(root, options)
  if (violations.length > 0) {
    throw new Error(
      `Nuxt client-engine absence check failed (${violations.length} violation(s)):\n${violations.map((value) => `- ${value}`).join('\n')}`,
    )
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const args = process.argv.slice(2)
  if (
    args.some((argument) => argument !== '--dist') ||
    args.filter((v) => v === '--dist').length > 1
  ) {
    throw new Error('Usage: check-no-nuxt-client-engine.mjs [--dist]')
  }
  runNuxtClientEngineCheck(process.cwd(), { dist: args.includes('--dist') })
  console.log(
    `Nuxt client-engine absence check passed${args.includes('--dist') ? ' for source and dist' : ''}.`,
  )
}
