import {
  getConvexRuntimeConfig,
  toPublicConvexRuntimeConfig,
  type ConvexRuntimeConfig,
} from '../utils/runtime-config'

export type { ConvexRuntimeConfig } from '../utils/runtime-config'

/**
 * Read the normalized public runtime configuration .
 *
 * Returns the read-only result of the same normalizer used internally. It has no
 * setter and creates no second configuration source. The build-only `auth.client`
 * path and the internal-only `auth.debug` channels are never exposed;
 * `config.auth === false` is the only disabled-auth signal.
 *
 * @example
 * ```ts
 * const config = useConvexConfig()
 * if (config.auth !== false) {
 *   console.log(config.auth.proxy.maxRequestBodyBytes)
 * }
 * ```
 */
export function useConvexConfig(): ConvexRuntimeConfig {
  return toPublicConvexRuntimeConfig(getConvexRuntimeConfig())
}
