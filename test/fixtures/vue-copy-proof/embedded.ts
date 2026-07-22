import { shallowRef } from 'vue'

import {
  attachClientIdentity,
  type AttachedClientRuntime,
} from '../../../src/runtime/client-core/attached-runtime'

export const embeddedVueIdentity = shallowRef

export function attachEmbeddedRuntime(runtime: AttachedClientRuntime) {
  return attachClientIdentity(runtime)
}
