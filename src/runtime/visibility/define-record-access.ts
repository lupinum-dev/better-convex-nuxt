import { can } from '../auth/index.js'

export type RecordAccessResolver<TActor, TResource> = (
  appIdentity: TActor,
  resource: TResource,
) => boolean

export type RecordAccessMap<TActor, TResource> = Record<
  string,
  RecordAccessResolver<TActor, TResource>
>

type AttachedRecordAccess<TResource, TMap extends Record<string, unknown>> = TResource & {
  _can: { [K in keyof TMap]: boolean }
}

export type RecordAccess<TActor, TResource, TMap extends RecordAccessMap<TActor, TResource>> = {
  _type: 'recordAccess'
  attach: {
    (appIdentity: TActor, value: TResource): AttachedRecordAccess<TResource, TMap>
    (appIdentity: TActor, value: TResource[]): Array<AttachedRecordAccess<TResource, TMap>>
  }
}

export function defineRecordAccess<TResource>() {
  return function buildCapabilities<TActor, TMap extends RecordAccessMap<TActor, TResource>>(
    map: TMap,
  ): RecordAccess<TActor, TResource, TMap> {
    function attachOne(appIdentity: TActor, resource: TResource) {
      const checks = Object.fromEntries(
        Object.entries(map).map(([key, resolver]) => [
          key,
          can(appIdentity, resolver(appIdentity, resource)),
        ]),
      ) as { [K in keyof TMap]: boolean }

      return {
        ...(resource as Record<string, unknown>),
        _can: checks,
      } as TResource & { _can: { [K in keyof TMap]: boolean } }
    }

    function attach(appIdentity: TActor, value: TResource): AttachedRecordAccess<TResource, TMap>
    function attach(
      appIdentity: TActor,
      value: TResource[],
    ): Array<AttachedRecordAccess<TResource, TMap>>
    function attach(appIdentity: TActor, value: TResource | TResource[]) {
      if (Array.isArray(value)) {
        return value.map((resource) => attachOne(appIdentity, resource))
      }

      return attachOne(appIdentity, value)
    }

    return {
      _type: 'recordAccess',
      attach,
    }
  }
}
