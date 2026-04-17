import type { Id } from '../convex/_generated/dataModel'

type BoardSummary = {
  _id: Id<'boards'>
  archived: boolean
}

export function reconcileSelectedBoardId(
  selectedBoardId: Id<'boards'> | null,
  boards: BoardSummary[] | null | undefined,
): Id<'boards'> | null {
  if (!selectedBoardId) return null
  if (!boards?.some((board) => board._id === selectedBoardId && !board.archived)) {
    return null
  }
  return selectedBoardId
}
