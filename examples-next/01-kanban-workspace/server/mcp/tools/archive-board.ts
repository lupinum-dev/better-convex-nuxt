import { archiveBoard, archiveBoardOp, previewArchiveBoard } from '../../../convex/boards'

import { tool } from '../runtime'

export default tool.fromOperation(archiveBoardOp, {
  execute: archiveBoard,
  preview: previewArchiveBoard,
  capability: 'archiveBoard',
  group: 'workspace',
  meta: {
    name: 'archive-board',
    description:
      'Archive a board after a preview step. Accepts boardId directly or workspace and board names.',
  },
})
