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

export type SerializablePrimitive = string | number | boolean | null

export type SerializableValue =
  | SerializablePrimitive
  | readonly SerializableValue[]
  | { [key: string]: SerializableValue }

export type ValidateSerializable<T> = T extends SerializablePrimitive
  ? T
  : T extends readonly (infer TItem)[]
    ? T extends (infer _TMutableItem)[]
      ? ValidateSerializable<TItem>[]
      : readonly ValidateSerializable<TItem>[]
    : T extends (...args: never[]) => unknown
      ? never
      : T extends symbol | bigint | undefined
        ? never
        : T extends
              | Date
              | Map<unknown, unknown>
              | Set<unknown>
              | WeakMap<object, unknown>
              | WeakSet<object>
              | Promise<unknown>
              | RegExp
          ? never
          : T extends object
            ? { [K in keyof T]: ValidateSerializable<T[K]> }
            : never
