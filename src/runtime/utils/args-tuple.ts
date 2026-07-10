import type { FunctionReference } from 'convex/server'
import type { MaybeRefOrGetter } from 'vue'

type StrictEmptyArgs = Record<PropertyKey, never>
/**
 * Tighten *only* an exactly-empty args object (`{}`, i.e. no declared keys) to
 * `Record<PropertyKey, never>` so callers cannot smuggle arbitrary properties
 * into a no-arg function. All-optional args objects like `{ limit?: number }`
 * have declared keys (`keyof` is not `never`) and are left untouched, so they
 * stay callable with `{ limit: 5 }`.
 *
 * The `T extends unknown` wrapper forces distribution over union args (from a
 * top-level `v.union(...)` validator) so each member is judged by its own
 * keys — without it, `keyof (A | B)` is the key *intersection*, which is
 * `never` for disjoint members and would wrongly collapse the whole union to
 * the empty-args type.
 */
type EmptyArgs = Record<string, never>
type TightenEmptyArgs<T> = T extends unknown ? (keyof T extends never ? StrictEmptyArgs : T) : never
type TightenEmptyArgsParam<T> =
  T extends MaybeRefOrGetter<infer Value> ? MaybeRefOrGetter<TightenEmptyArgs<Value>> : T

/**
 * The client `(args, options)` call shape (vNext §5.5, decision 9). The args
 * slot is ALWAYS required and positional — even a no-argument Convex function
 * must be called with `{}`. A truly empty args object is tightened to
 * `Record<PropertyKey, never>` so an options-shaped object can never occupy the
 * args slot; all-optional and union-optional args are left callable.
 *
 * `ArgsObject` is retained for call-site symmetry (paginated composables strip
 * `paginationOpts` before passing it) but no longer selects optionality — the
 * args slot is unconditionally required. `ArgsParam` is what the caller passes
 * (often `MaybeRefOrGetter`); `Options` is the trailing options object.
 */
export type ConvexQueryRest<_ArgsObject, ArgsParam, Options> = [
  args: TightenEmptyArgsParam<ArgsParam>,
  options?: Options,
]

/**
 * The server-caller `(args, options)` call shape. Unlike the client contract,
 * the server trio (internal until Phase 4) keeps the Convex `OptionalRestArgs`
 * rule: functions satisfiable by `{}` keep args optional; everything else makes
 * args required. This preserves the pre-cutover server ergonomics.
 */
export type ServerConvexRest<ArgsObject, ArgsParam, Options> = EmptyArgs extends ArgsObject
  ? [args?: TightenEmptyArgsParam<ArgsParam>, options?: Options]
  : [args: ArgsParam, options?: Options]

/**
 * The always-required `args` field for object-config composables
 * (`defineSharedConvexQuery`). A no-argument query must still declare `args: {}`.
 */
export type SharedQueryArgsField<_Query extends FunctionReference<'query'>, Args> = {
  args: MaybeRefOrGetter<TightenEmptyArgs<Args>>
}
