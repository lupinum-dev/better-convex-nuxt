import { archiveBoard, archiveBoardOp, previewArchiveBoard } from '~/convex/boards'
import { tool } from '../runtime'

export default tool.fromOperation(archiveBoardOp, {
  execute: archiveBoard,
  preview: previewArchiveBoard,
  capability: 'archiveBoard',
  group: 'workspace',
  meta: {
    description: 'Archive the current workspace board after a preview step.',
  },
})
