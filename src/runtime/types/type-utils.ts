type AnyFunction = (...args: never[]) => unknown

export type NoInfer<T> = [T][T extends unknown ? 0 : never]

export type Expand<T> = T extends object
  ? T extends infer O
    ? O extends AnyFunction
      ? O
      : { [K in keyof O]: O[K] }
    : never
  : T

type IsNonEmptyObject<T> = T extends object ? (keyof T extends never ? false : true) : false

export type Assign<TLeft, TRight> = TLeft extends unknown
  ? TRight extends unknown
    ? IsNonEmptyObject<TLeft> extends false
      ? TRight
      : IsNonEmptyObject<TRight> extends false
        ? TLeft
        : keyof TLeft & keyof TRight extends never
          ? TLeft & TRight
          : Omit<TLeft, keyof TRight> & TRight
    : never
  : never

export type UnionToIntersection<T> = (T extends unknown ? (arg: T) => unknown : never) extends (
  arg: infer TIntersected,
) => unknown
  ? TIntersected
  : never

export type IsUnknown<T> = unknown extends T ? ([keyof T] extends [never] ? true : false) : false

export type AwaitedValue<T> = T extends Promise<infer U> ? AwaitedValue<U> : T

export type FallbackIfUnknownOrNever<T, TFallback> = [T] extends [never]
  ? TFallback
  : IsUnknown<T> extends true
    ? TFallback
    : T
