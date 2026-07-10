import type { FunctionReference } from 'convex/server'

export declare const api: {
  tasks: {
    list: FunctionReference<'query', 'public', {}, string[]>
  }
}
