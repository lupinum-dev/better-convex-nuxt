import { describe, expect, it } from 'vitest'

import { getSubjectKind, getSubjectValue, isSubjectKind } from '../../src/runtime/auth/subject'

describe('canonical subject helpers', () => {
  it('parses the canonical subject kind for supported subject shapes', () => {
    expect(getSubjectKind('user:u_1')).toBe('user')
    expect(getSubjectKind('agent:a_1')).toBe('agent')
    expect(getSubjectKind('service:sync')).toBe('service')
    expect(getSubjectKind('system:anonymous')).toBe('system')
  })

  it('extracts the canonical subject value and enforces the expected kind when provided', () => {
    expect(getSubjectValue('user:u_1')).toBe('u_1')
    expect(getSubjectValue('user:u_1', 'user')).toBe('u_1')
    expect(getSubjectValue('agent:a_1', 'agent')).toBe('a_1')
    expect(getSubjectValue('service:sync', 'user')).toBeNull()
  })

  it('rejects malformed canonical subjects', () => {
    expect(getSubjectKind('')).toBeNull()
    expect(getSubjectKind('user')).toBeNull()
    expect(getSubjectKind('user:')).toBeNull()
    expect(getSubjectKind(':abc')).toBeNull()
    expect(getSubjectKind('unknown:value')).toBeNull()
    expect(getSubjectKind('user:bad id')).toBeNull()
    expect(getSubjectValue('user:')).toBeNull()
    expect(getSubjectValue('user:bad id')).toBeNull()
  })

  it('checks subject kinds without forcing callers to re-parse manually', () => {
    expect(isSubjectKind('user:u_1', 'user')).toBe(true)
    expect(isSubjectKind('agent:a_1', 'user')).toBe(false)
    expect(isSubjectKind('user:', 'user')).toBe(false)
  })
})
