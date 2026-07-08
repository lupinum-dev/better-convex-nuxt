import { describe, expect, it } from 'vitest'

import {
  getPayloadKeyRegistry,
  getPublicOnlyPayloadKeys,
  registerPayloadKey,
  withAuthDimension,
} from '../../src/runtime/utils/convex-cache'

describe('payload key registry', () => {
  it('keeps only keys consumed exclusively by auth:none queries', () => {
    const owner = {}

    const releasePublic = registerPayloadKey(owner, 'convex:notes:list:{}', 'none')
    const releasePrivate = registerPayloadKey(owner, 'convex:notes:get:{}', 'auto')
    const releaseMixedPublic = registerPayloadKey(owner, 'convex:notes:mixed:{}', 'none')
    const releaseMixedPrivate = registerPayloadKey(owner, 'convex:notes:mixed:{}', 'auto')

    expect(getPublicOnlyPayloadKeys(owner)).toEqual(new Set(['convex:notes:list:{}']))

    releasePrivate()
    expect(getPublicOnlyPayloadKeys(owner)).toEqual(new Set(['convex:notes:list:{}']))

    releaseMixedPrivate()
    expect(getPublicOnlyPayloadKeys(owner)).toEqual(
      new Set(['convex:notes:list:{}', 'convex:notes:mixed:{}']),
    )

    releasePublic()
    releaseMixedPublic()
    expect(getPayloadKeyRegistry(owner).size).toBe(0)
  })

  it('tracks duplicate consumers and unregisters idempotently', () => {
    const owner = {}

    const releaseA = registerPayloadKey(owner, 'convex:notes:list:{}', 'none')
    const releaseB = registerPayloadKey(owner, 'convex:notes:list:{}', 'none')

    expect(getPayloadKeyRegistry(owner).get('convex:notes:list:{}')).toEqual({
      auto: 0,
      none: 2,
    })

    releaseA()
    releaseA()
    expect(getPayloadKeyRegistry(owner).get('convex:notes:list:{}')).toEqual({
      auto: 0,
      none: 1,
    })

    releaseB()
    expect(getPayloadKeyRegistry(owner).has('convex:notes:list:{}')).toBe(false)
  })
})

describe('withAuthDimension', () => {
  it('separates auth transport modes for the same raw cache key', () => {
    const rawKey = 'convex:notes:list:{}'

    expect(withAuthDimension(rawKey, 'auto')).toBe('convex:notes:list:{}::auth-auto')
    expect(withAuthDimension(rawKey, 'none')).toBe('convex:notes:list:{}::auth-none')
  })
})
