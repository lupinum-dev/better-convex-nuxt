import { jwt, organization } from 'better-auth/plugins'

import { organizationPermissionOptions } from './access-control'

export function createAgenticAuthPlugins(authIssuer: string) {
  return [
    organization({
      ...organizationPermissionOptions,
      requireEmailVerificationOnInvitation: true,
    }),
    jwt({
      disableSettingJwtHeader: true,
      jwks: {
        disablePrivateKeyEncryption: false,
        gracePeriod: 21 * 60,
        keyPairConfig: { alg: 'RS256' },
      },
      jwt: { audience: authIssuer, expirationTime: '10m', issuer: authIssuer },
    }),
  ]
}
