/**
 * Vendored Standard Schema v1 types from @standard-schema/spec@1.1.0
 *
 * We vendor these ~50 lines instead of depending on the package.
 * Only the StandardSchemaV1 namespace is included — StandardTypedV1
 * and StandardJSONSchemaV1 are not needed.
 */

/** The Standard Schema interface. */
export interface StandardSchemaV1<Input = unknown, Output = Input> {
  readonly '~standard': StandardSchemaV1.Props<Input, Output>
}

export declare namespace StandardSchemaV1 {
  /** The Standard Schema properties interface. */
  interface Props<Input = unknown, Output = Input> {
    readonly version: 1
    readonly vendor: string
    readonly validate: (
      value: unknown,
    ) => Result<Output> | Promise<Result<Output>>
    readonly types?: Types<Input, Output> | undefined
  }

  /** The Standard Schema types interface. */
  interface Types<Input = unknown, Output = Input> {
    readonly input: Input
    readonly output: Output
  }

  /** The result interface of the validate function. */
  type Result<Output> = SuccessResult<Output> | FailureResult

  /** The result interface if validation succeeds. */
  interface SuccessResult<Output> {
    readonly value: Output
    readonly issues?: undefined
  }

  /** The result interface if validation fails. */
  interface FailureResult {
    readonly issues: ReadonlyArray<Issue>
  }

  /** The issue interface of the failure output. */
  interface Issue {
    readonly message: string
    readonly path?: ReadonlyArray<PropertyKey | PathSegment> | undefined
  }

  /** The path segment interface of the issue. */
  interface PathSegment {
    readonly key: PropertyKey
  }

  /** Infers the input type of a Standard Schema. */
  type InferInput<Schema extends StandardSchemaV1> =
    NonNullable<Schema['~standard']['types']>['input']

  /** Infers the output type of a Standard Schema. */
  type InferOutput<Schema extends StandardSchemaV1> =
    NonNullable<Schema['~standard']['types']>['output']
}
