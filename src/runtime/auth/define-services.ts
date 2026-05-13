type MaybePromise<T> = T | Promise<T>

export type ServiceTenantMode = 'global' | 'derived'

export type RestrictedServiceAccess<TTableName extends string = string, TCaller = unknown> = {
  tables: TTableName[]
} & (
  | {
      tenant: 'global'
    }
  | {
      tenant: 'derived'
      deriveTenant: (ctx: {
        caller: TCaller
        args: Record<string, unknown>
      }) => MaybePromise<string | null | undefined>
    }
)

export type ServiceDefinition<TTableName extends string = string, TCaller = unknown> =
  | {
      access: 'unrestricted'
    }
  | {
      access: RestrictedServiceAccess<TTableName, TCaller>
    }

export type ServiceDefinitions<TTableName extends string = string, TCaller = unknown> = Record<
  string,
  ServiceDefinition<TTableName, TCaller>
>

export function defineServices<
  TTableName extends string = string,
  TCaller = unknown,
  TServices extends ServiceDefinitions<TTableName, TCaller> = ServiceDefinitions<
    TTableName,
    TCaller
  >,
>(services: TServices): TServices {
  return services
}
