import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'

const repoRoot = process.cwd()
const cliPath = resolve(repoRoot, 'dist/cli.mjs')

if (!existsSync(cliPath)) {
  console.error('[trellis] dist/cli.mjs is missing. Run `pnpm run build:cli` first.')
  process.exit(1)
}

const sharedEnv = {
  CONVEX_URL: 'https://doctor-check.convex.cloud',
  CONVEX_SITE_URL: 'https://doctor-check.convex.site',
  SITE_URL: 'http://localhost:3000',
  BETTER_AUTH_SECRET: 'doctor-check-better-auth-secret-32chars',
  CONVEX_TRUSTED_FORWARDING_KEY: 'doctor-check-trusted-forwarding-key-32chars',
  TRELLIS_MCP_CONFIRMATION_KEY: 'doctor-check-mcp-confirmation-key-32chars',
  MCP_RATE_LIMIT_REDIS_URL: 'redis://127.0.0.1:6379',
  TEAM_WORKSPACE_WEBHOOK_SECRET: 'doctor-check-team-webhook-secret',
  TEAM_WORKSPACE_WEBHOOK_AUTH_ID: 'user_team_workspace_webhook',
  PROJECT_BOARD_WEBHOOK_SECRET: 'doctor-check-project-board-webhook-secret',
  MCP_REFERENCE_WEBHOOK_SECRET: 'doctor-check-mcp-reference-webhook-secret',
  MCP_REFERENCE_WEBHOOK_AUTH_ID: 'user_mcp_reference_webhook',
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
