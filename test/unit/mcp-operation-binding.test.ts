import { describe, expect, it } from 'vitest'

import { assertOperationBinding, toKebabCase } from '../../src/runtime/mcp/operation-binding'

describe('mcp operation binding', () => {
  it('accepts matching execute and preview refs', () => {
    expect(() =>
      assertOperationBinding(
        'archiveBoard',
        { _path: 'boards:archiveBoard' } as never,
        { _path: 'boards:previewArchiveBoard' } as never,
      ),
    ).not.toThrow()
  })

  it('rejects mismatched execute refs', () => {
    expect(() =>
      assertOperationBinding(
        'archiveBoard',
        { _path: 'boards:deleteBoard' } as never,
        { _path: 'boards:previewArchiveBoard' } as never,
      ),
    ).toThrow(/expected execute ref "archiveBoard"/)
  })

  it('rejects mismatched preview refs', () => {
    expect(() =>
      assertOperationBinding(
        'archiveBoard',
        { _path: 'boards:archiveBoard' } as never,
        { _path: 'boards:previewDeleteBoard' } as never,
      ),
    ).toThrow(/expected preview ref "previewArchiveBoard"/)
  })

  it('rejects preview refs from a different module', () => {
    expect(() =>
      assertOperationBinding(
        'archiveBoard',
        { _path: 'boards:archiveBoard' } as never,
        { _path: 'adminBoards:previewArchiveBoard' } as never,
      ),
    ).toThrow(/requires execute and preview refs from the same module/)
  })

  it('formats default tool names from operation names', () => {
    expect(toKebabCase('archiveBoard')).toBe('archive-board')
    expect(toKebabCase('archive_board')).toBe('archive-board')
  })
})
