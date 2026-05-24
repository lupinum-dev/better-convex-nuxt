import { describe, expect, it } from 'vitest'

import {
  createSubject,
  getSubjectKind,
  getSubjectValue,
  isSubjectKind,
  subject,
} from '../../src/runtime/auth/subject'

describe('canonical subject helpers', () => {
  it('parses the canonical subject kind for supported subject shapes', () => {
    expect(getSubjectKind('user:u_1')).toBe('user')
    expect(getSubjectKind('auth:issuer|u_1')).toBe('auth')
    expect(getSubjectKind('agent:a_1')).toBe('agent')
    expect(getSubjectKind('service:sync')).toBe('service')
    expect(getSubjectKind('system:anonymous')).toBe('system')
  })

  it('extracts the canonical subject value and enforces the expected kind when provided', () => {
    expect(getSubjectValue('user:u_1')).toBe('u_1')
    expect(getSubjectValue('auth:issuer|u_1', 'auth')).toBe('issuer|u_1')
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

  it('builds canonical subjects for each supported kind', () => {
    expect(subject.user('u_1')).toBe('user:u_1')
    expect(subject.auth('issuer|u_1')).toBe('auth:issuer|u_1')
    expect(subject.agent('a_1')).toBe('agent:a_1')
    expect(subject.service('sync')).toBe('service:sync')
    expect(subject.webhook('incoming')).toBe('webhook:incoming')
    expect(subject.system('scheduler')).toBe('system:scheduler')
    expect(subject.anonymous()).toBe('system:anonymous')
    expect(createSubject('user', 'u_2')).toBe('user:u_2')
  })

  it('rejects invalid canonical subject construction', () => {
    expect(() => subject.user('')).toThrow(/invalid canonical subject/i)
    expect(() => subject.agent('bad id')).toThrow(/invalid canonical subject/i)
    expect(() => createSubject('service', '   ')).toThrow(/invalid canonical subject/i)
  })
})
