import type { TeamAuthClient } from '../composables/useTeamAuthClient'

type Assert<T extends true> = T
type HasKey<T, K extends PropertyKey> = K extends keyof T ? true : false

type TeamAuthClientContract = {
  organization: TeamAuthClient['organization']
  admin: TeamAuthClient['admin']
  apiKey: TeamAuthClient['apiKey']
  twoFactor: TeamAuthClient['twoFactor']
  emailOtp: TeamAuthClient['emailOtp']
  magicLink: TeamAuthClient['magicLink']
}

type TeamAuthSession = Awaited<ReturnType<TeamAuthClient['useSession']>>
type TeamAuthSessionUser = NonNullable<NonNullable<TeamAuthSession['data']['value']>['user']>

type TeamAuthAdditionalFieldsContract = {
  locale: TeamAuthSessionUser['locale']
  timezone: TeamAuthSessionUser['timezone']
  marketingOptIn: TeamAuthSessionUser['marketingOptIn']
}

type _KeepsOrganizationCreate = Assert<HasKey<TeamAuthClient['organization'], 'create'>>
type _KeepsOrganizationInviteMember = Assert<HasKey<TeamAuthClient['organization'], 'inviteMember'>>
type _KeepsOrganizationCreateTeam = Assert<HasKey<TeamAuthClient['organization'], 'createTeam'>>
type _KeepsOrganizationSetActiveTeam = Assert<HasKey<TeamAuthClient['organization'], 'setActiveTeam'>>

type _KeepsAdminListUsers = Assert<HasKey<TeamAuthClient['admin'], 'listUsers'>>
type _KeepsAdminCreateUser = Assert<HasKey<TeamAuthClient['admin'], 'createUser'>>
type _KeepsAdminSetRole = Assert<HasKey<TeamAuthClient['admin'], 'setRole'>>
type _KeepsAdminBanUser = Assert<HasKey<TeamAuthClient['admin'], 'banUser'>>
type _KeepsAdminImpersonateUser = Assert<HasKey<TeamAuthClient['admin'], 'impersonateUser'>>

type _KeepsApiKeyCreate = Assert<HasKey<TeamAuthClient['apiKey'], 'create'>>
type _KeepsApiKeyList = Assert<HasKey<TeamAuthClient['apiKey'], 'list'>>
type _KeepsApiKeyUpdate = Assert<HasKey<TeamAuthClient['apiKey'], 'update'>>
type _KeepsApiKeyDelete = Assert<HasKey<TeamAuthClient['apiKey'], 'delete'>>

type _KeepsPasskeyAdd = Assert<HasKey<TeamAuthClient['passkey'], 'addPasskey'>>
type _KeepsPasskeySignIn = Assert<HasKey<TeamAuthClient['signIn'], 'passkey'>>
type _KeepsTwoFactorEnable = Assert<HasKey<TeamAuthClient['twoFactor'], 'enable'>>
type _KeepsEmailOtpNamespace = Assert<HasKey<TeamAuthClient, 'emailOtp'>>
type _KeepsMagicLinkNamespace = Assert<HasKey<TeamAuthClient, 'magicLink'>>

export type { TeamAuthClientContract }
export type { TeamAuthAdditionalFieldsContract }
