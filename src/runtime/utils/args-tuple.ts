import type { FunctionArgs, FunctionReference } from 'convex/server'
import type { MaybeRefOrGetter } from 'vue'

type EmptyArgs = Record<string, never>
type StrictEmptyArgs = Record<PropertyKey, never>
type TightenEmptyArgs<T> = T extends string ? T : EmptyArgs extends T ? StrictEmptyArgs : T
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
