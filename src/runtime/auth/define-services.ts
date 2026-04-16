type MaybePromise<T> = T | Promise<T>

export type ServiceTenantMode = 'global' | 'derived'

export type RestrictedServiceAccess<TTableName extends string = string, TPrincipal = unknown> = {
  tables: TTableName[]
} & (
  | {
      tenant: 'global'
    }
  | {
      tenant: 'derived'
      deriveTenant: (ctx: { principal: TPrincipal; args: Record<string, unknown> }) => MaybePromise<
        string | null | undefined
      >
    }
)

export type ServiceDefinition<TTableName extends string = string, TPrincipal = unknown> =
  | {
      access: 'unrestricted'
    }
  | {
      access: RestrictedServiceAccess<TTableName, TPrincipal>
    }

export type ServiceDefinitions<TTableName extends string = string, TPrincipal = unknown> = Record<
  string,
  ServiceDefinition<TTableName, TPrincipal>
>

export function defineServices<
  TTableName extends string = string,
  TPrincipal = unknown,
  TServices extends ServiceDefinitions<TTableName, TPrincipal> = ServiceDefinitions<
    TTableName,
    TPrincipal
  >,
>(services: TServices): TServices {
  return services
}
