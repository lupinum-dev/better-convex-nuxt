import { describe, expect, it } from 'vitest'

import {
  trellisOperationProjectionMetadataKey,
  type TrellisOperationProjectionMetadata,
} from '../../src/runtime/functions'
import { assertOperationBinding, toKebabCase } from '../../src/runtime/mcp/operation-binding'

function ref(metadata?: TrellisOperationProjectionMetadata) {
  return (
    metadata
      ? {
          [trellisOperationProjectionMetadataKey]: metadata,
        }
      : {}
  ) as never
}

function apiRef(path: string) {
  return {
    [Symbol.for('functionName')]: path,
  } as never
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

  it('accepts generated API refs without operation projection metadata', () => {
    expect(() =>
      assertOperationBinding(
        { id: 'boards.archive', name: 'archiveBoard', kind: 'destructive' },
        apiRef('boards:archive'),
        apiRef('boards:previewArchive'),
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
    ).toThrow(
      /requires an execute ref projected from the same operation or a generated API reference/,
    )
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
})
