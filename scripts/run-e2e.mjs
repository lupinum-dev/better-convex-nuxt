#!/usr/bin/env node

import { spawnSync } from 'node:child_process'
import { existsSync, readdirSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'

const root = process.cwd()
const e2eRoot = resolve(root, 'test/e2e')
const includeExtended = process.argv.includes('--full')

function discover(directory, recursive) {
  if (!existsSync(directory)) return []
  return readdirSync(directory, { withFileTypes: true })
    .flatMap((entry) => {
      const path = join(directory, entry.name)
      if (entry.isDirectory()) {
        if (!recursive || entry.name === 'extended') return []
        return discover(path, true)
      }
      return entry.name.endsWith('.e2e.test.ts') ? [path] : []
    })
    .sort()
}

function run(command, args, extraEnv = {}) {
  const result = spawnSync(command, args, {
    cwd: root,
    env: { ...process.env, ...extraEnv },
    stdio: 'inherit',
  })
  if (result.error) throw result.error
  if (result.status !== 0) process.exit(result.status ?? 1)
}

// E2E imports module source as well as the playground. Prepare both generated
// type roots so this gate is reproducible after a clean checkout or a packed
// contract probe that removes the root `.nuxt` directory.
run('pnpm', ['exec', 'nuxt-module-build', 'prepare'])
run('pnpm', ['exec', 'nuxi', 'prepare', '--cwd', 'playground', '--dotenv', '.env.local'])

const files = [
  ...discover(e2eRoot, false),
  ...(includeExtended ? discover(join(e2eRoot, 'extended'), true) : []),
]
if (files.length === 0) {
  console.error('No E2E files discovered.')
  process.exit(1)
}

console.log(`Running ${files.length} E2E file(s) in isolated Vitest processes.`)
for (const file of files) {
  const display = relative(root, file)
  console.log(`\n=== ${display} ===`)
  run('pnpm', ['exec', 'vitest', 'run', '--project=e2e', display], {
    CONVEX_E2E_AUTO_START: process.env.CONVEX_E2E_AUTO_START ?? 'true',
    BCN_E2E_REQUIRE_LOCAL: 'true',
  })
}

console.log(`\nE2E isolation gate passed (${files.length} file(s)).`)
