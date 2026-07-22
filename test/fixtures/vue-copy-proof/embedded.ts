import { shallowRef } from 'vue'

import {
  attachClientIdentity,
  type AttachedClientRuntime,
} from '../../../packages/vue/src/internal/attached-runtime'

export const embeddedVueIdentity = shallowRef

export function attachEmbeddedRuntime(runtime: AttachedClientRuntime) {
  return attachClientIdentity(runtime)
}
