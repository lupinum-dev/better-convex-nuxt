import { describe, expect, it } from 'vitest'

import { signClientIp, verifySignedClientIp } from '../../src/runtime/shared/client-ip'

const PROXY_IP_SECRET = 'proxy-ip-edge-secret-with-32-bytes'

describe('Convex-runtime proxy IP cryptography', () => {
  it('signs and verifies with the edge Web Crypto implementation', async () => {
    const signature = await signClientIp('2001:db8::1', PROXY_IP_SECRET)

    expect(signature).toMatch(/^[\w-]{43}$/)
    await expect(verifySignedClientIp('2001:db8::1', signature, PROXY_IP_SECRET)).resolves.toBe(
      '2001:db8::1',
    )
    await expect(
      verifySignedClientIp('2001:db8::2', signature, PROXY_IP_SECRET),
    ).resolves.toBeNull()
  })
})
