import type { OperationPreviewEnvelope } from '@lupinum/trellis/backend'
import type { FunctionReference } from 'convex/server'

declare module '@lupinum/trellis/backend' {
  interface OperationsById {
    'entries.archive': {
      id: 'entries.archive'
      kind: 'destructive'
    }
  }

  interface OperationExecutionsById {
    'entries.archive': FunctionReference<'mutation', 'internal', { id: string }, { archived: true }>
  }

  interface OperationPreviewsById {
    'entries.archive': FunctionReference<
      'query',
      'internal',
      { id: string },
      OperationPreviewEnvelope<{ id: string }>
    >
  }
}

declare module '@lupinum/trellis/mcp' {
  interface AccessKeysByKey {
    publishEntry: true
  }

  interface ToolsByName {
    'archive-entry': {
      name: 'archive-entry'
    }
  }
}
