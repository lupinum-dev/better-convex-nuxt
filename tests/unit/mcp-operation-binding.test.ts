import { describe, expect, it } from 'vitest'

import {
  projectOperationRef,
  trellisOperationProjectionMetadataKey,
  type TrellisOperationProjectionMetadata,
} from '../../src/runtime/functions'
import {
  assertOperationBinding,
  defineMcpToolRefDescriptor,
  getMcpToolSafety,
  projectMcpToolRef,
  toKebabCase,
} from '../../src/runtime/mcp/operation-binding'

function ref(metadata?: TrellisOperationProjectionMetadata) {
  return (
    metadata
      ? {
          [trellisOperationProjectionMetadataKey]: metadata,
        }
      : {}
  ) as never
}

describe('mcp operation binding', () => {
  it('accepts matching execute and preview refs', () => {
    expect(() =>
      assertOperationBinding(
        { id: 'boards.archive', name: 'archiveBoard', kind: 'destructive' },
        ref({ operationId: 'boards.archive', projection: 'execute' }),
        ref({ operationId: 'boards.archive', projection: 'preview' }),
      ),
    ).not.toThrow()
  })

  it('keeps Convex function refs on projected operation refs', () => {
    const operation = { id: 'boards.archive', name: 'archiveBoard', kind: 'destructive' } as const
    const execute = projectOperationRef(
      operation,
      'execute',
      {},
      {
        functionRef: 'features/boards/domain:archiveBoard',
      },
    )

    expect(execute[trellisOperationProjectionMetadataKey]).toEqual({
      operationId: 'boards.archive',
      projection: 'execute',
      functionRef: 'features/boards/domain:archiveBoard',
    })
  })

  it('infers Convex function names on projected operation refs', () => {
    const operation = { id: 'boards.archive', name: 'archiveBoard', kind: 'destructive' } as const
    const execute = projectOperationRef(operation, 'execute', {
      [Symbol.for('functionName')]: 'features/boards/domain:archiveBoard',
    })

    expect(execute[trellisOperationProjectionMetadataKey]).toEqual({
      operationId: 'boards.archive',
      projection: 'execute',
      functionRef: 'features/boards/domain:archiveBoard',
    })
  })

  it('accepts projected proxy refs that hide custom symbol reads', () => {
    function proxyRef() {
      return new Proxy(
        {},
        {
          get(target, property, receiver) {
            if (property === trellisOperationProjectionMetadataKey) return undefined
            return Reflect.get(target, property, receiver)
          },
        },
      )
    }

    const operation = { id: 'boards.archive', name: 'archiveBoard', kind: 'destructive' } as const
    const execute = projectOperationRef(operation, 'execute', proxyRef())
    const preview = projectOperationRef(operation, 'preview', proxyRef())

    expect(Object.getOwnPropertySymbols(execute)).toContain(trellisOperationProjectionMetadataKey)
    expect(execute[trellisOperationProjectionMetadataKey]).toBeUndefined()
    expect(() =>
      assertOperationBinding(operation, execute as never, preview as never),
    ).not.toThrow()
  })

  it('accepts proxy refs stamped outside the local WeakMap', () => {
    function proxyRef(metadata: TrellisOperationProjectionMetadata) {
      const value = new Proxy(
        {},
        {
          get(target, property, receiver) {
            if (property === trellisOperationProjectionMetadataKey) return undefined
            return Reflect.get(target, property, receiver)
          },
        },
      )

      Object.defineProperty(value, trellisOperationProjectionMetadataKey, {
        value: metadata,
        enumerable: false,
        configurable: true,
        writable: false,
      })

      return value
    }

    const operation = { id: 'boards.archive', name: 'archiveBoard', kind: 'destructive' } as const

    expect(() =>
      assertOperationBinding(
        operation,
        proxyRef({ operationId: operation.id, projection: 'execute' }) as never,
        proxyRef({ operationId: operation.id, projection: 'preview' }) as never,
      ),
    ).not.toThrow()
  })

  it('rejects execute refs without operation metadata', () => {
    expect(() =>
      assertOperationBinding(
        { id: 'boards.archive', name: 'archiveBoard', kind: 'destructive' },
        ref(),
        ref({ operationId: 'boards.archive', projection: 'preview' }),
      ),
    ).toThrow(/requires an execute ref projected from the same operation/)
  })

  it('rejects destructive operation bindings without preview refs', () => {
    expect(() =>
      assertOperationBinding(
        { id: 'boards.archive', name: 'archiveBoard', kind: 'destructive' },
        ref({ operationId: 'boards.archive', projection: 'execute' }),
      ),
    ).toThrow(/requires a preview ref for destructive operations/)
  })

  it('rejects mismatched execute refs', () => {
    expect(() =>
      assertOperationBinding(
        { id: 'boards.archive', name: 'archiveBoard', kind: 'destructive' },
        ref({ operationId: 'boards.delete', projection: 'execute' }),
        ref({ operationId: 'boards.archive', projection: 'preview' }),
      ),
    ).toThrow(/does not match operation id "boards.archive"/)
  })

  it('rejects preview refs with the wrong projection', () => {
    expect(() =>
      assertOperationBinding(
        { id: 'boards.archive', name: 'archiveBoard', kind: 'destructive' },
        ref({ operationId: 'boards.archive', projection: 'execute' }),
        ref({ operationId: 'boards.archive', projection: 'execute' }),
      ),
    ).toThrow(/does not match operation id "boards.archive"/)
  })

  it('formats default tool names from operation names', () => {
    expect(toKebabCase('archiveBoard')).toBe('archive-board')
    expect(toKebabCase('archive_board')).toBe('archive-board')
  })

  it('projects direct MCP tool safety from a shared descriptor', () => {
    const descriptor = defineMcpToolRefDescriptor({
      name: 'create-project',
      safety: {
        kind: 'bounded-write',
        reason: 'Creates one draft project record named by args.',
      },
    })
    const projected = projectMcpToolRef(descriptor, {})

    expect(getMcpToolSafety(projected)).toEqual(descriptor.safety)
  })
})
