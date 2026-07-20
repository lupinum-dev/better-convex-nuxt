import type { betterAuth } from 'better-auth'
import type { FunctionReference, GenericDataModel, GenericMutationCtx } from 'convex/server'

import type { AuthCtx } from './context'
import type { SigningKeyCandidate, SigningKeyRotationMetadata } from './jwks-rotation'

export type AuthFunctions = {
  onCreate?: FunctionReference<'mutation', 'internal'>
  onUpdate?: FunctionReference<'mutation', 'internal'>
  onDelete?: FunctionReference<'mutation', 'internal'>
}

type AuthTriggerDocument = Record<string, unknown>

export type AuthComponentTriggers<DataModel extends GenericDataModel = GenericDataModel> = Partial<
  Record<
    string,
    {
      onCreate?: (ctx: GenericMutationCtx<DataModel>, doc: AuthTriggerDocument) => Promise<void>
      onUpdate?: (
        ctx: GenericMutationCtx<DataModel>,
        newDoc: AuthTriggerDocument,
        oldDoc: AuthTriggerDocument,
      ) => Promise<void>
      onDelete?: (ctx: GenericMutationCtx<DataModel>, doc: AuthTriggerDocument) => Promise<void>
    }
  >
>

export type CreateAuth<
  DataModel extends GenericDataModel = GenericDataModel,
  Auth = ReturnType<typeof betterAuth>,
> = (ctx: AuthCtx<DataModel>) => Auth | Promise<Auth>

export interface AuthAdapterComponentApi {
  adapter: {
    count: FunctionReference<'query', 'internal'>
    create: FunctionReference<'mutation', 'internal'>
    deleteMany: FunctionReference<'mutation', 'internal'>
    deleteOne: FunctionReference<'mutation', 'internal'>
    findMany: FunctionReference<'query', 'internal'>
    findOne: FunctionReference<'query', 'internal'>
    incrementOne: FunctionReference<'mutation', 'internal'>
    rotateSigningKey: FunctionReference<
      'mutation',
      'internal',
      { next: SigningKeyCandidate },
      SigningKeyRotationMetadata
    >
    consumeOne: FunctionReference<'mutation', 'internal'>
    updateMany: FunctionReference<'mutation', 'internal'>
    updateOne: FunctionReference<'mutation', 'internal'>
  }
}
