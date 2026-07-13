import { describe, expect, it } from 'vitest'

import { isSameOrigin } from '../../src/runtime/server/api/auth/security'

describe('auth proxy origin boundary', () => {
  it('accepts only one exact serialized origin', () => {
    expect(isSameOrigin('https://app.example.com', 'https://app.example.com')).toBe(true)
    expect(isSameOrigin('http://app.example.com', 'https://app.example.com')).toBe(false)
    expect(isSameOrigin('https://app.example.com:444', 'https://app.example.com')).toBe(false)
    expect(isSameOrigin('https://app.example.com/path', 'https://app.example.com')).toBe(false)
    expect(isSameOrigin('not-an-origin', 'https://app.example.com')).toBe(false)
  })
})
