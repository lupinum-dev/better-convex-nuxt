import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'

const repoRoot = process.cwd()
const cliPath = resolve(repoRoot, 'dist/cli.mjs')
const initTemplateDir = resolve(repoRoot, 'dist/templates/init')

function ensureBuiltCli() {
  if (existsSync(cliPath) && existsSync(initTemplateDir)) return

  console.warn('[trellis] rebuilding CLI for maintained example doctor checks')
  execFileSync('pnpm', ['run', 'build:cli'], {
    cwd: repoRoot,
    stdio: 'inherit',
    env: process.env,
  })
}

const sharedEnv = {
  CONVEX_URL: 'https://doctor-check.convex.cloud',
  CONVEX_SITE_URL: 'https://doctor-check.convex.site',
  SITE_URL: 'http://localhost:3000',
  BETTER_AUTH_SECRET: 'doctor-check-better-auth-secret-32chars',
  CONVEX_IDENTITY_FORWARDING_KEY: 'doctor-check-identity-forwarding-key-32chars',
  MCP_RATE_LIMIT_REDIS_URL: 'redis://127.0.0.1:6379',
  TEAM_WORKSPACE_WEBHOOK_SECRET: 'doctor-check-team-webhook-secret',
  TEAM_WORKSPACE_WEBHOOK_USER_ID: 'user_team_workspace_webhook',
  PROJECT_BOARD_WEBHOOK_SECRET: 'doctor-check-project-board-webhook-secret',
  MCP_REFERENCE_WEBHOOK_SECRET: 'doctor-check-mcp-reference-webhook-secret',
  MCP_REFERENCE_WEBHOOK_USER_ID: 'user_mcp_reference_webhook',
  JWKS: '{"keys":[]}',
  DEMO_MCP_TOKEN: 'doctor-check-demo-mcp-token',
}

const maintainedExamples = [
  'examples/03-team-workspace',
  'examples/04-saas-platform',
  'examples/05-visibility-access',
  'examples/06-multi-workspace',
  'examples/07-mcp-reference',
  'examples/08-component-mini-cms',
]

for (const relativePath of maintainedExamples) {
  ensureBuiltCli()
  const cwd = resolve(repoRoot, relativePath)
  console.log(`[trellis] doctor ${relativePath}`)
  execFileSync(process.execPath, [cliPath, 'doctor', '--cwd', cwd], {
    cwd: repoRoot,
    stdio: 'inherit',
    env: {
      ...process.env,
      ...sharedEnv,
    },
  })
}
