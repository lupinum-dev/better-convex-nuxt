import { readdirSync, readFileSync, statSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

const root = process.cwd()
const rootsToScan = ['src', 'docs', 'examples', 'demo', 'test', 'README.md'] as const
const allowedFiles = new Set([
  'src/cli/lib/project.ts',
  'test/unit/cli-doctor.test.ts',
  'test/unit/module-auto-imports.test.ts',
  'test/unit/v3-repo-guard.test.ts',
])

const bannedPatterns = [
  /\buseEnsureConvexUser\b/,
  /better-convex-nuxt\/schema/,
  /\bcreateAuth\s*\(\s*\{/,
  /CONVEX_SERVICE_KEY/,
  /_serviceKey\b/,
  /_serviceActor\b/,
  /\bauth:\s*'service'\b/,
  /\bwithServiceAuth\b/,
  /\bgetServiceCaller\b/,
] as const

function collectFiles(target: string): string[] {
  const absolute = resolve(root, target)
  const stats = statSync(absolute)
  if (stats.isFile()) {
    return [target]
  }

  const files: string[] = []
  const walk = (directory: string, relativePrefix: string) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name === '.output') {
        continue
      }

      if (entry.name === '.nuxt' || entry.name === '.data' || entry.name === '.convex') {
        continue
      }

      const fullPath = resolve(directory, entry.name)
      const relativePath = `${relativePrefix}/${entry.name}`.replace(/^\.\//, '')
      if (entry.isDirectory()) {
        walk(fullPath, relativePath)
        continue
      }

      if (entry.isFile()) {
        files.push(relativePath)
      }
    }
  }

  walk(absolute, target)
  return files
}

describe('v3 repo guard', () => {
  it(
    'keeps removed public API names and legacy service transport names out of the repo except for explicit legacy checks',
    { timeout: 15000 },
    () => {
      const violations: string[] = []

      for (const target of rootsToScan) {
        for (const relativePath of collectFiles(target)) {
          if (allowedFiles.has(relativePath)) {
            continue
          }

          const source = readFileSync(resolve(root, relativePath), 'utf8')
          for (const pattern of bannedPatterns) {
            if (pattern.test(source)) {
              violations.push(`${relativePath} matches ${pattern}`)
            }
          }
        }
      }

      expect(violations).toEqual([])
    },
  )
})
