import { previewOperationRef, transportExecuteOperationRef } from '@lupinum/trellis/backend'

import { api } from '../../../convex/_generated/api'
import { publishPageDescriptor } from '../../../shared/features/pages/contract'
import { tool } from '../../lib/mcp-runtime'

export default tool.operation(publishPageDescriptor, {
  execute: transportExecuteOperationRef(
    publishPageDescriptor,
    api.features.pages.domain.publishAction,
  ),
  preview: previewOperationRef(publishPageDescriptor, api.features.pages.domain.previewPublish),
  executeOperation: 'action',
  confirmationMode: 'transport',
  group: 'pages',
  meta: {
    name: 'publish-page',
    description: 'Publish the selected draft page to the public site.',
  },
})
