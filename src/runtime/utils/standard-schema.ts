/**
 * Vendored Standard Schema v1 types from @standard-schema/spec@1.1.0
 *
 * We vendor these ~50 lines instead of depending on the package.
 * Only the StandardSchemaV1 namespace is included — StandardTypedV1
 * and StandardJSONSchemaV1 are not needed.
 */

/** The Standard Schema interface. */
export interface StandardSchemaV1<Input = unknown, Output = Input> {
  readonly '~standard': StandardSchemaV1Props<Input, Output>
}

/** The Standard Schema properties interface. */
export interface StandardSchemaV1Props<Input = unknown, Output = Input> {
  readonly version: 1
  readonly vendor: string
  readonly validate: (
    value: unknown,
  ) => StandardSchemaV1Result<Output> | Promise<StandardSchemaV1Result<Output>>
  readonly types?: StandardSchemaV1Types<Input, Output> | undefined
}

/** The Standard Schema types interface. */
export interface StandardSchemaV1Types<Input = unknown, Output = Input> {
  readonly input: Input
  readonly output: Output
}

/** The result interface of the validate function. */
export type StandardSchemaV1Result<Output> =
  | StandardSchemaV1SuccessResult<Output>
  | StandardSchemaV1FailureResult

/** The result interface if validation succeeds. */
export interface StandardSchemaV1SuccessResult<Output> {
  readonly value: Output
  readonly issues?: undefined
}

/** The result interface if validation fails. */
export interface StandardSchemaV1FailureResult {
  readonly issues: ReadonlyArray<StandardSchemaV1Issue>
}

/** The issue interface of the failure output. */
export interface StandardSchemaV1Issue {
  readonly message: string
  readonly path?: ReadonlyArray<PropertyKey | StandardSchemaV1PathSegment> | undefined
}

/** The path segment interface of the issue. */
export interface StandardSchemaV1PathSegment {
  readonly key: PropertyKey
}

/** Infers the input type of a Standard Schema. */
export type StandardSchemaV1InferInput<Schema extends StandardSchemaV1> =
  NonNullable<Schema['~standard']['types']>['input']

/** Infers the output type of a Standard Schema. */
export type StandardSchemaV1InferOutput<Schema extends StandardSchemaV1> =
  NonNullable<Schema['~standard']['types']>['output']
