import type { FunctionArgs, FunctionReference } from 'convex/server'
import type { MaybeRefOrGetter } from 'vue'

type EmptyArgs = Record<string, never>
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
type TightenEmptyArgs<T> = T extends unknown ? (keyof T extends never ? StrictEmptyArgs : T) : never
type TightenEmptyArgsParam<T> =
  T extends MaybeRefOrGetter<infer Value> ? MaybeRefOrGetter<TightenEmptyArgs<Value>> : T

/**
 * Mirrors convex's OptionalRestArgs rule for our `(args, options)` call shape:
 * functions whose args are satisfiable by `{}` keep args optional; everything
 * else makes args required at the type level. Runtime behavior is unchanged.
 *
 * `ArgsObject` is the concrete Convex args object that drives the optionality
 * decision — `FunctionArgs<Query>` for standard queries/mutations/actions, or
 * the `paginationOpts`-stripped args object for paginated queries. `ArgsParam`
 * is what the caller actually passes (often wrapped in `MaybeRefOrGetter`), and
 * `Options` is the trailing options object type.
 */
export type ConvexQueryRest<ArgsObject, ArgsParam, Options> = EmptyArgs extends ArgsObject
  ? [args?: TightenEmptyArgsParam<ArgsParam>, options?: Options]
  : [args: ArgsParam, options?: Options]

/**
 * Conditionally-required `args` field for object-config composables
 * (`defineSharedConvexQuery`). Same "satisfiable by `{}`" optionality rule as
 * {@link ConvexQueryRest}, expressed as an object member instead of a tuple.
 */
export type SharedQueryArgsField<Query extends FunctionReference<'query'>, Args> =
  EmptyArgs extends FunctionArgs<Query>
    ? { args?: MaybeRefOrGetter<Args> }
    : { args: MaybeRefOrGetter<Args> }
