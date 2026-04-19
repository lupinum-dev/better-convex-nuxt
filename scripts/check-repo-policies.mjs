import { execSync } from 'node:child_process'
import { existsSync } from 'node:fs'

const checks = [
  {
    name: 'protocol-specific agent kinds',
    cmd: String.raw`rg -n "kind: 'mcp'|kind:\s*v\.literal\('mcp'\)|case 'mcp'|principal\.kind === 'mcp'" README.md apps/docs/content/docs examples src/cli -g '!**/node_modules/**' -g '!**/_generated/**'`,
  },
  {
    name: 'query composables in middleware',
    cmd: String.raw`rg -n "useConvexQuery\(|useConvexPaginatedQuery\(" apps/harness/middleware apps/harness/plugins -g "!**/node_modules/**"`,
    paths: ['apps/harness/middleware', 'apps/harness/plugins'],
  },
  {
    name: 'useRoute in middleware',
    cmd: String.raw`rg -n "useRoute\(" apps/harness/middleware -g "!**/node_modules/**"`,
    paths: ['apps/harness/middleware'],
  },
  {
    name: 'middleware subscribe:false docs',
    cmd: String.raw`rg -n "middleware.*subscribe:[[:space:]]*false|subscribe:[[:space:]]*false.*middleware" apps/docs/content/docs`,
  },
]

for (const check of checks) {
  if (
    'paths' in check &&
    Array.isArray(check.paths) &&
    check.paths.every((path) => !existsSync(path))
  ) {
    continue
  }

  try {
    execSync(check.cmd, { stdio: 'pipe', shell: '/bin/zsh' })
    throw new Error(`repo policy violated: ${check.name}`)
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('repo policy violated:')) {
      throw error
    }

    const status = error && typeof error === 'object' ? Reflect.get(error, 'status') : undefined
    if (status === 1) continue

    throw new Error(
      `[trellis] repo policy check failed for ${check.name}: ${
        error instanceof Error ? error.message : String(error)
      }`,
    )
  }
}
