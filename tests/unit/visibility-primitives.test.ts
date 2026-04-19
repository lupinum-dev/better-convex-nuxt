import { describe, expect, it } from 'vitest'

import { defineCapabilities, defineRedaction } from '../../src/runtime/visibility'

describe('visibility primitives', () => {
  it('attaches explicit capabilities to a single resource and arrays', () => {
    const capabilities = defineCapabilities<{ ownerId: string; title: string }>()({
      update: (actor: { userId: string; role: string } | null, resource) =>
        !!actor && actor.userId === resource.ownerId,
      delete: (actor: { userId: string; role: string } | null, _resource) =>
        !!actor && actor.role === 'admin',
    })

    expect(
      capabilities.attach(
        { userId: 'alice', role: 'member' },
        { ownerId: 'alice', title: 'Hello' },
      ),
    ).toEqual({
      ownerId: 'alice',
      title: 'Hello',
      _can: {
        update: true,
        delete: false,
      },
    })

    expect(
      capabilities.attach({ userId: 'alice', role: 'admin' }, [
        { ownerId: 'alice', title: 'One' },
        { ownerId: 'bob', title: 'Two' },
      ]),
    ).toEqual([
      {
        ownerId: 'alice',
        title: 'One',
        _can: { update: true, delete: true },
      },
      {
        ownerId: 'bob',
        title: 'Two',
        _can: { update: false, delete: true },
      },
    ])
  })

  it('applies redaction rules to values and arrays without mutating input', () => {
    const redaction = defineRedaction<
      { title: string; internalNotes?: string; salary?: number },
      { role: string }
    >({
      rules: [
        {
          fields: ['internalNotes'],
          visibleTo: (actor) => actor.role === 'editor',
        },
        {
          fields: ['salary'],
          visibleTo: (actor) => actor.role === 'owner',
        },
      ],
    })

    const original = {
      title: 'Offer',
      internalNotes: 'private',
      salary: 120000,
    }

    expect(redaction.apply({ role: 'member' }, original)).toEqual({
      title: 'Offer',
    })
    expect(original).toEqual({
      title: 'Offer',
      internalNotes: 'private',
      salary: 120000,
    })

    expect(
      redaction.apply({ role: 'editor' }, [original, { title: 'Public', salary: 90000 }]),
    ).toEqual([
      {
        title: 'Offer',
        internalNotes: 'private',
      },
      {
        title: 'Public',
      },
    ])
  })
})
