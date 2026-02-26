import { setup, $fetch } from '@nuxt/test-utils/e2e'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

describe('SSR smoke', async () => {
  await setup({
    rootDir: fileURLToPath(new URL('../fixtures/basic', import.meta.url)),
  })

  it('renders the index page', async () => {
    const html = await $fetch('/')
    expect(html).toContain('<div>basic</div>')
  })
})

