import type { CallResult } from '../errors'
import { normalizeConvexError } from '../errors'

/**
 * The library's error surface is the single framework-free {@link ConvexCallError}
 * class (vNext §7, internal §9). This module re-exports it plus the shared
 * `CallResult` envelope and the `.safe()` adapter so existing consumers keep
 * importing from `../utils/call-result`. The old serializable interface, the
 * message-guessing normalizer, and the plain-`Error` `toError` conversion are
 * deleted: throwing paths now throw `ConvexCallError` directly and `.safe()`
 * passes the SAME normalizer, so equivalent raw failures yield an equal
 * `toJSON()` on both paths.
 */
export {
  ConvexCallError,
  normalizeConvexError,
  type ConvexCallErrorInput,
  type ConvexCallErrorKind,
  type SerializedConvexCallError,
} from '../errors'

export type { CallResult } from '../errors'

/**
 * Run a throwing call and capture any failure as the normalized
 * {@link ConvexCallError}. Because throwing paths already throw a
 * `ConvexCallError`, re-normalizing here passes that instance through unchanged,
 * guaranteeing `.safe()`/throwing equivalence.
 */
export async function toCallResult<T>(call: () => Promise<T>): Promise<CallResult<T>> {
  try {
    const data = await call()
    return { ok: true, data }
  } catch (error) {
    return { ok: false, error: normalizeConvexError(error) }
  }
}
