import type { FunctionReference } from 'convex/server'

type AdapterApi = {
  create: FunctionReference<'mutation', 'internal'>
  findOne: FunctionReference<'query', 'internal'>
  findMany: FunctionReference<'query', 'internal'>
  updateOne: FunctionReference<'mutation', 'internal'>
  updateMany: FunctionReference<'mutation', 'internal'>
  deleteOne: FunctionReference<'mutation', 'internal'>
  deleteMany: FunctionReference<'mutation', 'internal'>
}

export declare const components: {
  betterAuth: {
    adapter: AdapterApi
  }
}
