import { apiKey } from '@better-auth/api-key'
import { convexAdapter } from '@convex-dev/better-auth'
import { admin, organization } from 'better-auth/plugins'
import { describe, expect, it } from 'vitest'

describe('Better Auth plugin local schema support', () => {
  it('generates Convex component tables for Admin, Organization, and API Key plugins', async () => {
    const adapter = convexAdapter({} as never, { adapter: {} as never })({
      plugins: [admin(), organization(), apiKey()],
    })

    const generated = await adapter.createSchema?.({}, 'generatedSchema.ts')

    expect(generated?.path).toBe('generatedSchema.ts')
    expect(generated?.code).toContain('role: v.optional')
    expect(generated?.code).toContain('banned: v.optional')
    expect(generated?.code).toContain('organization: defineTable')
    expect(generated?.code).toContain('member: defineTable')
    expect(generated?.code).toContain('invitation: defineTable')
    expect(generated?.code).toContain('apikey: defineTable')
    expect(generated?.code).toContain('key: v.string()')
  })
})
