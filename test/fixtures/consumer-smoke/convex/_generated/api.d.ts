import type { FunctionReference, PaginationResult } from 'convex/server'

export declare const api: {
  auth: {
    viewer: FunctionReference<
      'query',
      'public',
      {},
      { id: string; email: string; role: 'admin' | 'member'; orgId?: string }
    >
    permissionContext: FunctionReference<'query', 'public', {}, { userId: string; role: 'admin' | 'member'; orgId?: string } | null>
  }
  emails: {
    send: FunctionReference<'action', 'public', { to: string; subject: string }, { ok: boolean }>
  }
  files: {
    generateUploadUrl: FunctionReference<'mutation', 'public', {}, string>
    getUrl: FunctionReference<'query', 'public', { storageId: string }, string | null>
  }
  tasks: {
    list: FunctionReference<'query', 'public', {}, string[]>
    listPaginated: FunctionReference<
      'query',
      'public',
      { paginationOpts: { numItems: number; cursor: string | null } },
      PaginationResult<string>
    >
    listPaginatedByOwner: FunctionReference<
      'query',
      'public',
      { owner: string; paginationOpts: { numItems: number; cursor: string | null } },
      PaginationResult<string>
    >
    create: FunctionReference<'mutation', 'public', { text: string }, string>
    remove: FunctionReference<'mutation', 'public', { id: string }, null>
  }
}
