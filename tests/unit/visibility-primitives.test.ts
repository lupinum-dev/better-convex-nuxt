import { describe, expect, it } from 'vitest'

import { defineRecordAccess, defineRedaction } from '../../src/runtime/visibility'

describe('visibility primitives', () => {
  it('attaches explicit recordAccess to a single resource and arrays', () => {
    const recordAccess = defineRecordAccess<{ ownerId: string; title: string }>()({
      update: (appIdentity: { userId: string; role: string } | null, resource) =>
        !!appIdentity && appIdentity.userId === resource.ownerId,
      delete: (appIdentity: { userId: string; role: string } | null, _resource) =>
        !!appIdentity && appIdentity.role === 'admin',
    })

    expect(
      recordAccess.attach(
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
      recordAccess.attach({ userId: 'alice', role: 'admin' }, [
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
          visibleTo: (appIdentity) => appIdentity.role === 'editor',
        },
        {
          fields: ['salary'],
          visibleTo: (appIdentity) => appIdentity.role === 'owner',
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

  it('projects redacted values into explicit public return shapes', () => {
    const redaction = defineRedaction<
      { title: string; internalNotes?: string; salary?: number },
      { role: string }
    >({
      rules: [
        {
          fields: ['internalNotes', 'salary'],
          visibleTo: (appIdentity) => appIdentity.role === 'owner',
        },
      ],
    })

    const projected = redaction.project(
      { role: 'member' },
      { title: 'Offer', internalNotes: 'private', salary: 120000 },
      (safeValue) => ({
        title: safeValue.title,
        hasSalary: 'salary' in safeValue,
      }),
    )

    expect(projected).toEqual({
      title: 'Offer',
      hasSalary: false,
    })
  })
})
