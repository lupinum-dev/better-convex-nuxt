import type { FunctionReference, PaginationResult } from 'convex/server'

export declare const api: {
  auth: {
    viewer: FunctionReference<
      'query',
      'public',
      Record<string, never>,
      { id: string; email: string; role: 'admin' | 'member'; orgId?: string }
    >
    permissionContext: FunctionReference<
      'query',
      'public',
      Record<string, never>,
      { userId: string; role: 'admin' | 'member'; orgId?: string } | null
    >
  }
  emails: {
    send: FunctionReference<'action', 'public', { to: string; subject: string }, { ok: boolean }>
  }
  files: {
    generateUploadUrl: FunctionReference<'mutation', 'public', Record<string, never>, string>
    getUrl: FunctionReference<'query', 'public', { storageId: string }, string | null>
  }
  tasks: {
    list: FunctionReference<'query', 'public', Record<string, never>, string[]>
    listPaginated: FunctionReference<
      'query',
      'public',
      { paginationOpts: { numItems: number; cursor: string | null } },
      PaginationResult<string>
    >
    create: FunctionReference<'mutation', 'public', { text: string }, string>
    remove: FunctionReference<'mutation', 'public', { id: string }, null>
  }
}
