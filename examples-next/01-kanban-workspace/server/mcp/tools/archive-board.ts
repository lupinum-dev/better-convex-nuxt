import { api } from '#trellis/api'

import { archiveBoardOp } from '~/convex/boards'
import { tool } from '../runtime'

export default tool.fromOperation(archiveBoardOp, {
  execute: api.boards.archiveBoard,
  preview: api.boards.previewArchiveBoard,
  capability: 'archiveBoard',
  group: 'workspace',
  meta: {
    description: 'Archive the current workspace board after a preview step.',
  },
})
