type VisibleTo<TActor, TValue> = (appIdentity: TActor, value: TValue) => boolean

export type RedactionRule<TActor, TValue> = {
  fields: string[]
  visibleTo: VisibleTo<TActor, TValue>
}

export type Redaction<TActor, TValue> = {
  _type: 'redaction'
  rules: ReadonlyArray<RedactionRule<TActor, TValue>>
  apply: {
    (appIdentity: TActor, value: TValue): TValue
    (appIdentity: TActor, value: TValue[]): TValue[]
  }
  project: {
    <TOutput>(appIdentity: TActor, value: TValue, projector: (value: TValue) => TOutput): TOutput
    <TOutput>(
      appIdentity: TActor,
      value: TValue[],
      projector: (value: TValue) => TOutput,
    ): TOutput[]
  }
}

function redactOne<TActor, TValue extends Record<string, unknown>>(
  appIdentity: TActor,
  value: TValue,
  rules: ReadonlyArray<RedactionRule<TActor, TValue>>,
): TValue {
  const result = { ...value }

  for (const rule of rules) {
    if (rule.visibleTo(appIdentity, value)) continue
    for (const field of rule.fields) {
      Reflect.deleteProperty(result, field)
    }
  }

  return result
}

export function defineRedaction<TValue extends Record<string, unknown>, TActor>(options: {
  rules: ReadonlyArray<RedactionRule<TActor, TValue>>
}): Redaction<TActor, TValue> {
  function apply(appIdentity: TActor, value: TValue): TValue
  function apply(appIdentity: TActor, value: TValue[]): TValue[]
  function apply(appIdentity: TActor, value: TValue | TValue[]) {
    if (Array.isArray(value)) {
      return value.map((entry) => redactOne(appIdentity, entry, options.rules))
    }

    return redactOne(appIdentity, value, options.rules)
  }

  function project<TOutput>(
    appIdentity: TActor,
    value: TValue,
    projector: (value: TValue) => TOutput,
  ): TOutput
  function project<TOutput>(
    appIdentity: TActor,
    value: TValue[],
    projector: (value: TValue) => TOutput,
  ): TOutput[]
  function project<TOutput>(
    appIdentity: TActor,
    value: TValue | TValue[],
    projector: (value: TValue) => TOutput,
  ) {
    if (Array.isArray(value)) {
      return apply(appIdentity, value).map((entry) => projector(entry))
    }

    return projector(apply(appIdentity, value))
  }

  return {
    _type: 'redaction',
    rules: options.rules,
    apply,
    project,
  }
}
