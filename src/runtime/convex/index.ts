export {
  createFunctions,
  defineActorConfig,
  type CreateFunctionsOptions,
} from './create-functions'
export { definePermissions } from './define-permissions'

export type {
  Actor,
  ActorConfig,
} from '../actor/types'

export type {
  CheckPermissionFn,
  DefinedPermissionsConfig,
  InferPermission,
  InferRole,
  PermissionContext,
  Resource,
} from './define-permissions'

export type {
  ScopedReader,
  ScopedWriter,
} from '../scoping/types'
