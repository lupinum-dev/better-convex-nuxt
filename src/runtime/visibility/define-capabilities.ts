import { can } from '../auth/index.js'

export type CapabilityResolver<TActor, TResource> = (actor: TActor, resource: TResource) => boolean

export type CapabilityMap<TActor, TResource> = Record<string, CapabilityResolver<TActor, TResource>>

type AttachedCapabilities<TResource, TMap extends Record<string, unknown>> = TResource & {
  _can: { [K in keyof TMap]: boolean }
}

export type Capabilities<TActor, TResource, TMap extends CapabilityMap<TActor, TResource>> = {
  _type: 'capabilities'
  attach: {
    (actor: TActor, value: TResource): AttachedCapabilities<TResource, TMap>
    (actor: TActor, value: TResource[]): Array<AttachedCapabilities<TResource, TMap>>
  }
}

export function defineCapabilities<TResource>() {
  return function buildCapabilities<TActor, TMap extends CapabilityMap<TActor, TResource>>(
    map: TMap,
  ): Capabilities<TActor, TResource, TMap> {
    function attachOne(actor: TActor, resource: TResource) {
      const checks = Object.fromEntries(
        Object.entries(map).map(([key, resolver]) => [key, can(actor, resolver(actor, resource))]),
      ) as { [K in keyof TMap]: boolean }

      return {
        ...(resource as Record<string, unknown>),
        _can: checks,
      } as TResource & { _can: { [K in keyof TMap]: boolean } }
    }

    function attach(actor: TActor, value: TResource): AttachedCapabilities<TResource, TMap>
    function attach(actor: TActor, value: TResource[]): Array<AttachedCapabilities<TResource, TMap>>
    function attach(actor: TActor, value: TResource | TResource[]) {
      if (Array.isArray(value)) {
        return value.map((resource) => attachOne(actor, resource))
      }

      return attachOne(actor, value)
    }

    return {
      _type: 'capabilities',
      attach,
    }
  }
}
