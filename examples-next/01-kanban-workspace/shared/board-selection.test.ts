import { describe, expect, it } from 'vitest'

import type { Id } from '../convex/_generated/dataModel'
import { reconcileSelectedBoardId } from './board-selection'

const board = (id: string, archived = false) => ({ _id: id as Id<'boards'>, archived })

describe('board selection', () => {
  it('keeps an explicit active board when it still exists and is not archived', () => {
    expect(
      reconcileSelectedBoardId('board-a' as Id<'boards'>, [board('board-a'), board('board-b')]),
    ).toBe('board-a')
  })

  it('clears selection instead of falling back to the first board', () => {
    expect(
      reconcileSelectedBoardId('board-a' as Id<'boards'>, [board('board-b'), board('board-c')]),
    ).toBeNull()
  })

  it('clears selection when the chosen board becomes archived', () => {
    expect(reconcileSelectedBoardId('board-a' as Id<'boards'>, [board('board-a', true)])).toBeNull()
  })
})
