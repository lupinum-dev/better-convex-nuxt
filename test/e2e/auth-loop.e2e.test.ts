import { fileURLToPath } from 'node:url'

import { setup, createPage } from '@nuxt/test-utils/e2e'
import { afterAll, describe, it } from 'vitest'

import { assertLocalAuthReady, ensureLocalConvex } from '../helpers/local-convex'

const playgroundCwd = fileURLToPath(new URL('../../playground', import.meta.url))

const local = await ensureLocalConvex({
  cwd: playgroundCwd,
})

await assertLocalAuthReady({
  cwd: playgroundCwd,
  env: local.env,
  origin: 'http://localhost:3000',
})

describe('Auth loop (full stack)', async () => {
  afterAll(async () => {
    await local.release()
  })

  await setup({
    rootDir: playgroundCwd,
    env: local.env,
  })

  it('navigates between the signup and signin screens', async () => {
    const page = await createPage('/')
    await page.getByRole('link', { name: /sign up|create one|register/i }).first().click()
    await page.waitForSelector('input#name, input[name="name"]', { timeout: 10_000 })

    const uniqueEmail = `e2e+${Date.now()}@example.com`

    await page.getByLabel(/name/i).fill('E2E User')
    await page.getByLabel(/email/i).fill(uniqueEmail)
    await page.getByLabel(/password/i).fill('Password123!')
    await page.getByRole('button', { name: /create account|sign up|register/i }).click()
    await page.waitForSelector('input[type="email"]', { timeout: 10_000 })

    await page.getByRole('link', { name: /sign in|log in/i }).first().click()
    await page.waitForURL(/\/(auth\/signin|login)/, { timeout: 10_000 })
    await page.waitForSelector('input[type="email"]', { timeout: 10_000 })
    await page.waitForSelector('input[type="password"]', { timeout: 10_000 })

    await page.getByRole('link', { name: /create one|sign up|register/i }).first().click()
    await page.waitForURL(/\/(auth\/signup|register)/, { timeout: 10_000 })
    await page.waitForSelector('input#name, input[name="name"]', { timeout: 10_000 })
  })
})
