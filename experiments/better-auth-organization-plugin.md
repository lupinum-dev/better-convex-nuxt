# Better Auth Organization Plugin Experiment

## Purpose

Find how far the team starter can push Better Auth Organization as the canonical B2B team model while Convex app tables stay focused on product data.

The experiment answers:

- Can Better Auth own organizations, members, teams, invitations, roles, and org metadata?
- Can an AI agent inspect the real Convex component tables quickly?
- Can we avoid duplicate app-owned organization and membership tables?
- Where are the limits or sharp edges?

## Current Setup

Starter:

```bash
/Users/matthias/Git/convex/better-convex-nuxt/starters/team
```

Local deployment:

```bash
http://127.0.0.1:3210
```

Run backend:

```bash
pnpm convex:dev
```

Run one-shot deploy/typecheck:

```bash
pnpm convex:local:once
```

Reset local deployment:

```bash
pnpm experiment:hard-reset
```

## Verified Feedback Commands

### Agent Feedback Smoke Suite

```bash
pnpm feedback:agent
```

Runs the current plugin-owned feedback path:

- Better Auth Organization happy path.
- Organization lifecycle mutations.
- Better Auth product authorization through Convex functions.
- Email OTP passwordless and email verification.
- Magic-link passwordless.
- Final read-only table inspection with `convex data`.

This is the default agent smoke test. It intentionally avoids the legacy app-owned organization and membership path.

### Full Proven Plugin Suite

```bash
pnpm feedback:better-auth-all
```

Runs every currently proven Better Auth plugin feedback script:

- Organization happy path.
- Typed Nuxt client surface.
- Organization lifecycle mutations.
- Organization limits.
- Product authorization.
- Dynamic roles.
- Admin user management.
- TOTP two-factor.
- Email OTP.
- Magic link.
- Organization API keys.
- API-key product route authorization.
- API-key lifecycle after organization deletion.
- User-owned API key lifecycle.
- OIDC provider dynamic client registration and authorization-code flow.
- Device authorization approval and denial flows.
- Passkey server/runtime boundary.
- SCIM partial runtime.
- Stripe organization subscription runtime.
- Generic OAuth and OAuth proxy expected-limit probes.
- OAuth/MCP product-route and token-lifecycle probes.
- Enterprise/platform package surface.
- Final read-only table inspection.

Use this before broad research or roadmap claims. It starts local Convex when needed and stops only the server it started. Use `pnpm feedback:agent` for faster daily agent inspectability checks.

Verified locally on 2026-06-22. Expected logs include negative authorization failures; the command is green only when it reaches `better-auth full feedback suite passed`. Port-owning probes such as `feedback:better-auth-api-key-warning-limit`, `feedback:better-auth-passkey-browser`, and `feedback:starter-ui-cutover` remain separate because they start isolated servers and require free ports.

### Passkey Server Runtime Boundary

```bash
pnpm feedback:better-auth-passkey-surface
```

Confirms the correct package is `@better-auth/passkey`, not `better-auth/plugins/passkey`.

Current evidence:

- `@better-auth/passkey` and `@better-auth/passkey/client` resolve locally at version `1.6.20`.
- The local Better Auth Convex component schema generates a `passkey` table.
- Convex accepts the generated component schema and reset/import includes `passkey`.
- Authenticated `GET /api/auth/passkey/generate-register-options` returns WebAuthn registration options with `rp.id: "localhost"` and `rp.name: "Better Convex Nuxt Team"`.
- `GET /api/auth/passkey/generate-authenticate-options` returns an authentication challenge.
- `GET /api/auth/passkey/list-user-passkeys` returns an empty list before browser WebAuthn verification.
- Challenge rows are stored in Better Auth `verification`; no app-owned passkey table exists.

Current limit: this is not a full starter UI proof because it does not add user-facing Nuxt passkey controls.

### Passkey Browser WebAuthn Boundary

```bash
pnpm feedback:better-auth-passkey-browser
```

This starts local Convex and a minimal localhost origin with a same-origin `/api/auth/*` proxy, then drives Chromium through a virtual WebAuthn authenticator.

Current evidence:

- Browser `navigator.credentials.create()` completes against Better Auth registration options.
- `POST /api/auth/passkey/verify-registration` creates a Better Auth `passkey` row.
- `GET /api/auth/passkey/list-user-passkeys` returns the stored credential.
- Browser sign-out followed by `navigator.credentials.get()` and `POST /api/auth/passkey/verify-authentication` creates a new Better Auth session.
- The `passkey.userId` and `session.userId` point at the canonical Better Auth `user` id.
- WebAuthn challenge rows in Better Auth `verification` are consumed after successful verification.
- The final hard reset deletes `passkey`, `session`, `user`, and app `users` rows.

Current limit: the probe uses Chrome's virtual authenticator, not a real hardware/platform authenticator, and it does not add product UI for passkey management.

### Enterprise and Platform Package Surface

```bash
pnpm feedback:better-auth-enterprise-surface
```

Current package-surface result:

- `better-auth/plugins/oidc-provider` is exported.
- `better-auth/plugins/device-authorization` is exported.
- `better-auth/plugins/generic-oauth` is exported.
- `mcp()` and `oAuthProxy()` are available from the aggregate `better-auth/plugins` export.
- `better-auth/plugins/mcp` is not directly exported as a server plugin subpath.
- `better-auth/plugins/sso`, `better-auth/plugins/scim`, `better-auth/plugins/saml`, `@better-auth/sso`, and `@better-auth/saml` are not available in this starter install.
- `@better-auth/scim` is installed separately and exports `scim()`.
- The installed `better-auth@1.6.20` package has no local `dist/plugins/sso`, `dist/plugins/scim`, `dist/plugins/saml`, or `dist/plugins/enterprise` implementation directory.
- `@better-auth/oauth-provider` is not installed; the local package surface points to `oidcProvider()` instead.

This is a package-surface probe only. Generic OAuth, OIDC provider, device authorization, MCP, and SCIM now have separate runtime spikes below.

### Generic OAuth Runtime

```bash
pnpm feedback:better-auth-generic-oauth
```

Proves the `genericOAuth()` plugin can run through the local Convex Better Auth component for a deterministic custom-provider sign-in flow:

- The plugin is enabled only behind `BETTER_AUTH_GENERIC_OAUTH_EXPERIMENT=true` and `ALLOW_TEST_RESET=true`.
- `POST /api/auth/sign-in/oauth2` creates an authorization URL for `local-generic-oauth`.
- The OAuth state is stored in Better Auth `verification`.
- `GET /api/auth/oauth2/callback/local-generic-oauth` accepts a provider code, calls the configured `getToken` and `getUserInfo` hooks, creates a Better Auth `user`, writes a Better Auth `account` row with provider id, account id, access token, refresh token, scopes, and expiries, creates a Better Auth `session`, and writes the app `users` projection.
- The state row is consumed after callback.
- Replaying the consumed state redirects with `state_mismatch`.

Current limit:

- This is a provider-contract proof, not a real Google/Okta/GitHub login proof.
- Nuxt callback/error UI, account-linking policy, and provider-specific scopes are not proven.

### OAuth Proxy Generic OAuth Limit

```bash
pnpm feedback:better-auth-oauth-proxy
```

Proves an important current incompatibility between `oAuthProxy()` and `genericOAuth()`:

- The probe enables both `BETTER_AUTH_GENERIC_OAUTH_EXPERIMENT=true` and `BETTER_AUTH_OAUTH_PROXY_EXPERIMENT=true`.
- `POST /api/auth/sign-in/social` with the local generic provider runs the proxy sign-in hook.
- The proxy rewrites the stored Better Auth state callback URL to `/api/auth/oauth-proxy-callback?callbackURL=...`.
- The provider URL contains encrypted proxy state, not the raw Better Auth `verification.identifier`.
- Generic OAuth still generates `redirect_uri=http://localhost:3000/api/auth/oauth2/callback/local-generic-oauth`.
- Calling `/api/auth/oauth2/callback/local-generic-oauth` with the encrypted proxy state redirects with `state_mismatch`.
- No Better Auth `user`, `account`, or `session` rows are created, and no app `users` projection is written.

Current limit:

- The installed `oAuthProxy()` plugin has its decrypting callback hook on core `/callback/:id`, while Generic OAuth callbacks use `/oauth2/callback/:providerId`.
- Do not recommend `oAuthProxy()` for Generic OAuth preview deployments until upstream handles Generic OAuth callbacks or a separate built-in social-provider spike proves the intended proxy path.

### SCIM Partial Runtime

```bash
pnpm feedback:better-auth-scim
```

Proves the current SCIM boundary:

- `@better-auth/scim@1.6.20` installs and adds a local component `scimProvider` table.
- `scim()` is enabled only behind `BETTER_AUTH_SCIM_EXPERIMENT=true`.
- `scimProvider.scimToken` is stored hashed, not as the returned bearer token.
- Personal SCIM token generation is rejected by config; org-scoped token generation requires the owner role.
- SCIM metadata endpoints and GET/POST `/scim/v2/Users` work through the Convex auth route.
- SCIM user provisioning creates Better Auth `user`, `account`, and `member` rows, plus the app `users` projection.
- App-owned `memberships` table is not present.

Current limit:

- PUT/PATCH/DELETE SCIM user routes return 404 before Better Auth handles them because `@convex-dev/better-auth` currently registers only GET and POST under `/api/auth/*`.
- Full SCIM IdP lifecycle is not ready until route-method support is added and update/deprovision behavior is verified.

### OIDC Provider Runtime

```bash
pnpm feedback:better-auth-oidc-provider
```

Proves the deprecated local `oidcProvider()` surface can run in the Convex component runtime for an authorization-code provider flow:

- The local component schema includes `oauthApplication`, `oauthAccessToken`, and `oauthConsent`.
- The plugin is enabled only for local experiments through `ALLOW_TEST_RESET=true`.
- Discovery is exposed through the Convex-prefixed route `/api/auth/convex/.well-known/openid-configuration`.
- OAuth runtime endpoints work through `/api/auth/oauth2/*`.
- Dynamic client registration writes component `oauthApplication`.
- `storeClientSecret: "hashed"` keeps the returned raw client secret out of the component table.
- Authorization redirects to the configured consent page and stores the pending code in Better Auth `verification`.
- Accepting consent writes component `oauthConsent`.
- Token exchange writes component `oauthAccessToken`.
- `/oauth2/userinfo` resolves the Better Auth user from the access token.
- App-owned organization and membership mirrors are not present.

Current limits:

- `oidcProvider()` is deprecated in the installed package; Better Auth points to `@better-auth/oauth-provider`, which is not installed in this starter.
- Discovery reports `http://localhost:3000/api/auth/oauth2/*` endpoints from `SITE_URL`, while the local feedback script calls the Convex site directly at `127.0.0.1:3211`. The production Nuxt proxy/routing story still needs a UI/client integration check.
- This spike does not prove device authorization, MCP protected-resource metadata, or product-route authorization from OIDC access tokens. Product-route authorization from OIDC/MCP access tokens and token lifecycle behavior are covered by separate spikes below.

### Device Authorization Runtime

```bash
pnpm feedback:better-auth-device-authorization
```

Proves the `deviceAuthorization()` plugin can run in the Convex component runtime for device-code login flows:

- The local component schema includes `deviceCode`.
- The local schema wrapper adds indexes for `deviceCode`, `deviceCode_status`, `userCode`, `expiresAt`, and `status`.
- The plugin is enabled only for local experiments through `ALLOW_TEST_RESET=true`.
- The installed plugin parser requires an explicit `schema: {}` option even though the type surface presents schema as optional.
- Invalid client ids are rejected by `validateClient`.
- `/device/code` writes a pending component `deviceCode` row.
- `/device/token` returns `authorization_pending` before approval.
- A signed-in user can claim the user code through `/device`.
- `/device/approve` marks the row approved.
- Exchanging the approved device code creates a Better Auth `session` and consumes the `deviceCode` row.
- `/device/deny` marks a claimed row denied; the next token request returns `access_denied` and consumes the row.
- App-owned organization and membership mirrors are not present.

Current limits:

- The current spike does not prove a Nuxt device verification page, polling UX, or QR/display UX.
- Device authorization is an API/platform feature, not a default team-management feature. Keep it recipe-gated until a product actually needs CLI/TV/device login.

### Device-Issued Session Product Authorization

```bash
pnpm feedback:better-auth-device-product-authz
```

Proves a session minted by `deviceAuthorization()` participates in the same Convex product authorization model as a normal Better Auth session:

- A member accepts a Better Auth organization invitation.
- The member claims and approves a device code.
- Exchanging the approved device code creates a Better Auth `session`; the device `access_token` is the session token.
- Passing that token into the experiment-only Convex product authorization path can create a product row while the member role has `project.create`.
- After the owner downgrades the member to `viewer`, the same device-issued token can still read but cannot create product rows.
- After the owner removes the member, the same device-issued token cannot read or create product rows.
- The consumed `deviceCode` row is gone, while the Better Auth session remains.
- App-owned organization and membership mirrors are not present.

Current limit:

- This proves backend authorization from the device-issued session token. It still does not prove the Nuxt verification UI, polling UX, QR/display UX, or a polished device-login product flow.

### MCP Runtime

```bash
pnpm feedback:better-auth-mcp-runtime
```

Proves the aggregate-exported `mcp()` plugin can run in the Convex component runtime when isolated from `oidcProvider()`:

- The local script sets `BETTER_AUTH_PLATFORM_EXPERIMENT=mcp` for the local deployment and removes it at exit.
- Default local mode keeps `oidcProvider()` enabled, because `mcp()` and `oidcProvider()` both register `POST /oauth2/consent` and Better Auth logs endpoint conflicts if they are enabled together.
- MCP OAuth discovery works at `/api/auth/.well-known/oauth-authorization-server`.
- MCP protected-resource metadata works at `/api/auth/.well-known/oauth-protected-resource`.
- Dynamic MCP client registration writes component `oauthApplication`.
- Authorization redirects to the configured consent page and stores the pending code in Better Auth `verification`.
- Accepting consent writes component `oauthConsent`.
- `/mcp/token` exchanges the authorization code and writes component `oauthAccessToken`.
- `/mcp/get-session` validates the MCP access token and returns the token row.
- App-owned organization and membership mirrors are not present.

Current limits:

- The installed `mcp()` plugin advertises `/mcp/userinfo` and `/mcp/jwks` in metadata, but does not implement those endpoints; the verifier currently expects 404 for both.
- Dynamic MCP client secrets are stored as raw plaintext in `oauthApplication.clientSecret`; unlike the OIDC spike, there is no proven `storeClientSecret: "hashed"` behavior for MCP registration.
- MCP and deprecated OIDC provider cannot be treated as simultaneously enabled recipes unless Better Auth exposes separate consent paths or a replacement provider removes the conflict.
- Product-route authorization from MCP access tokens is covered by the separate OAuth product route spike below.

### OAuth Token Product Route Runtime

```bash
pnpm feedback:better-auth-oauth-product-route
```

Proves OIDC and MCP bearer access tokens can protect a Convex HTTP product route without adding an app-owned auth mirror:

- The local OIDC and MCP provider configs allow an experiment-only `project:create` scope.
- The HTTP route `/api/oauth-projects` reads the bearer token from `Authorization: Bearer ...`.
- The route validates the token against Better Auth component `oauthAccessToken` by indexed `accessToken`.
- The route rejects expired, missing, invalid, and missing-scope tokens.
- The route checks Better Auth component `member` for organization membership.
- A valid OIDC access token with `project:create` can create a product row.
- A valid MCP access token with `project:create` can create a product row.
- Created product rows use actor ids shaped as `oauth:<oauthAccessTokenId>`.
- Audit events are written as `projects.createFromOAuthToken`.
- App-owned organization and membership mirrors are not present.

Current limits:

- This is a concrete recipe route, not a built-in Better Auth API that evaluates organization permissions from OAuth access tokens.
- The route currently enforces `project:create` scope plus membership; it does not evaluate dynamic Better Auth role permissions for OAuth tokens.

### OAuth Token Lifecycle Runtime

```bash
pnpm feedback:better-auth-oauth-token-lifecycle
```

Proves the current OIDC and MCP access-token lifecycle behavior in the installed Better Auth package:

- OIDC and MCP authorization-code flows return `refresh_token` when `offline_access` is requested.
- OIDC `POST /api/auth/oauth2/token` supports `grant_type=refresh_token`.
- MCP `POST /api/auth/mcp/token` supports `grant_type=refresh_token`.
- Refresh grants create new access and refresh token strings.
- New OIDC access tokens work with `/oauth2/userinfo`.
- New MCP access tokens work with `/mcp/get-session`.
- The original access tokens remain valid after refresh.
- The original refresh tokens remain reusable after refresh and can mint additional token rows.
- The component `oauthAccessToken` table keeps the original row and adds new rows; the verifier expects three rows after initial issue, first refresh, and original-refresh reuse.
- OIDC `/oauth2/introspect` and `/oauth2/revoke` return 404.
- MCP `/mcp/introspect` and `/mcp/revoke` return 404.
- App-owned organization and membership mirrors are not present.

Current limits:

- This is not strict refresh-token rotation. Treat refresh tokens as reusable bearer secrets until Better Auth changes this behavior or we add a recipe-level invalidation layer.
- There is no built-in OAuth revocation or introspection endpoint in the currently installed OIDC/MCP plugin surfaces.
- Public API routes must validate against component `oauthAccessToken` rows directly and must rely on expiry, scope, and product-domain membership checks. Do not design around token introspection or revocation endpoints that are not present.

### OAuth Client Credentials Limit

```bash
pnpm feedback:better-auth-oauth-client-credentials-limit
```

Proves the current OIDC and MCP surfaces are not machine-to-machine OAuth providers:

- OIDC discovery does not advertise `client_credentials`.
- MCP discovery does not advertise `client_credentials`.
- OIDC dynamic client registration accepts and persists a client with `grant_types: ["client_credentials"]`.
- MCP dynamic client registration accepts and persists a client with `grant_types: ["client_credentials"]`.
- OIDC `POST /api/auth/oauth2/token` with `grant_type=client_credentials` returns `400` with `invalid_request` and `code is required`.
- MCP `POST /api/auth/mcp/token` with `grant_type=client_credentials` returns `400` with `invalid_request` and `code is required`.
- No component `oauthAccessToken` rows are created.
- App-owned organization and membership mirrors are not present.

Current limit:

- Dynamic client registration accepts more grant metadata than the token endpoint implements. Do not use OIDC/MCP for service-to-service auth in this starter. Use Better Auth API keys for service integrations unless a replacement OAuth Provider proves a real client-credentials flow.

### API Key Lifecycle Runtime

```bash
pnpm feedback:better-auth-api-key-lifecycle
```

Proves an important product-boundary invariant for organization-owned API keys:

- Better Auth API keys can remain valid after the referenced Better Auth organization is deleted.
- Better Auth organization deletion removes component `organization` and `member` rows, but does not remove component `apikey` rows.
- `auth.api.verifyApiKey()` still returns `valid: true` for a surviving key after organization deletion.
- The Convex product route must not treat API-key validity plus `referenceId` as sufficient authorization.
- `/api/projects` now checks that the referenced Better Auth `organization` row still exists before creating product rows.
- The surviving key is rejected for the deleted organization with `API key organization does not exist`.
- Only the pre-delete product row and audit event remain.
- App-owned organization and membership mirrors are not present.

Current limit:

- This raw deletion path does not revoke or clean up orphaned API keys automatically. It proves the product-route guard. Use the safe-delete probe below for the current route-level cleanup recipe.

### API Key Safe Organization Delete Runtime

```bash
pnpm feedback:better-auth-api-key-safe-org-delete
```

Proves the current safe-delete boundary:

- Better Auth server-side `auth.api.listApiKeys()` / `auth.api.deleteApiKey()` for org-scoped keys currently fails inside Convex with `dynamic module import unsupported`.
- Better Auth HTTP/client API-key routes can list and delete known org-scoped configurations: `org-keys`, `org-project-writer`, and `org-project-reader`.
- After route-level deletion, raw keys for all three configurations return `INVALID_API_KEY`.
- Better Auth organization deletion then removes component `organization` and `member` rows.
- Component `apikey` rows are gone; no app-owned API-key mirror is introduced.
- Product history remains only as app `projects` and `auditEvents` rows.

Current production guidance:

- Do not expose destructive organization deletion as a raw call to `/api/auth/organization/delete` in product UI while org-scoped API keys exist.
- Use an explicit route/client cleanup flow before deletion, keep `/api/projects` checking organization existence, or keep organization deletion disabled until upstream/server-side cleanup is safe in the Convex runtime.

### Organization Delete Product Access Runtime

```bash
pnpm feedback:better-auth-org-delete-product-access
```

Proves the raw Better Auth organization deletion boundary for product access and team state:

- Owner and member can create product rows before deletion.
- Better Auth `/organization/delete` removes the component `organization`, `member`, and `invitation` rows.
- Current raw deletion leaves the default organization `team`, the explicit `team`, and related `teamMember` rows.
- The deleting owner's session clears `activeOrganizationId`, but can retain stale `activeTeamId`.
- A non-deleting member session can retain stale `activeOrganizationId` and stale `activeTeamId`.
- Stale owner/member sessions cannot list or create org/team product rows after deletion because Convex product authorization re-checks Better Auth membership at request time.
- Product history remains as app `projects` and `auditEvents` rows.

Current production guidance:

- Do not expose raw `/api/auth/organization/delete` as the product deletion flow.
- Keep destructive organization deletion disabled, or implement one verified cleanup route that removes or revokes teams, team members, API keys, and stale session state before or with organization deletion.
- Do not add app-owned organization/team mirrors to compensate for orphaned Better Auth rows; fix the deletion recipe at the Better Auth boundary.

### Organization Safe Delete Teams Limit Runtime

```bash
pnpm feedback:better-auth-org-safe-delete-teams-limit
```

Proves how far public Better Auth routes can clean team state before organization deletion:

- `set-active-team` can clear the deleting owner's active team with `teamId: null`.
- `remove-team` can delete non-last teams, including the default owner team, once it is no longer active.
- `remove-team` deletes the removed team's `teamMember` rows.
- With the starter's default `organization({ teams: { enabled: true } })` settings, `remove-team` rejects the final team with `UNABLE_TO_REMOVE_LAST_TEAM`.
- Raw organization deletion after best-effort route cleanup still leaves that final `team` and its `teamMember` row.
- The deleting owner's session can end with no active org/team, but a non-deleting member session can still retain stale active org/team ids.
- Stale member product reads/writes are denied because Convex product authorization re-checks Better Auth membership.

Current production guidance:

- Public Better Auth routes are not enough for a complete organization delete recipe in the team starter.
- Do not add an app-owned cleanup mirror. Either keep destructive organization deletion disabled or add one explicit server-side deletion primitive that directly verifies all Better Auth component cleanup.

### Organization Allow Remove All Teams Runtime

```bash
pnpm feedback:better-auth-org-allow-remove-all-teams
```

Proves Better Auth can own complete team storage cleanup when the team option is enabled:

- The probe temporarily sets `BETTER_AUTH_ALLOW_REMOVE_ALL_TEAMS_EXPERIMENT=true`.
- `convex/auth.ts` maps that flag to `organization({ teams: { allowRemovingAllTeams: true } })`.
- Public `set-active-team` clears the deleting owner's active team.
- Public `remove-team` deletes the default team and the final remaining explicit team.
- `remove-team` deletes all related `teamMember` rows.
- Raw organization deletion after team cleanup leaves no component `organization`, `member`, `invitation`, `team`, or `teamMember` rows for the deleted organization.
- The deleting owner's session has no active org/team after cleanup.
- A non-deleting member session can still retain stale active org/team ids.
- Stale member product reads/writes are denied because Convex product authorization re-checks Better Auth membership.

Current production guidance:

- For destructive org deletion, prefer this Better Auth option over direct component table writes for team cleanup.
- This still needs API-key cleanup and stale-session handling before the product can expose a complete delete-org flow.
- Keep the option env-gated until we decide whether teamless organizations during deletion are acceptable product behavior.

### Plugin-Owned Happy Path

```bash
pnpm feedback:better-auth-org
```

Proves the Better Auth plugin-owned path:

- Better Auth creates component `organization`.
- Better Auth creates owner and invitee component `member` rows.
- Better Auth creates component `team` and `teamMember` rows.
- Better Auth creates and accepts component `invitation`.
- Extra plugin-owned fields persist:
  - `organization.plan`
  - `organization.region`
  - `team.color`
  - `invitation.note`
- App `users` projection is still written.
- App `organizations` and `memberships` stay empty.

### Better Auth User Additional Fields

```bash
pnpm feedback:better-auth-user-additional-fields
```

Proves Better Auth core user fields can carry auth/session profile data without creating a second app-owned auth record:

- Better Auth stores `locale`, `timezone`, and `marketingOptIn` in the component `user` row.
- `get-session` returns those fields on `session.user`.
- The typed Nuxt client uses `inferAdditionalFields<AppAuth>()` so those fields are covered by `pnpm typecheck`.
- The app `users` projection remains limited to rebuildable display fields and does not mirror `locale`, `timezone`, or `marketingOptIn`.

Current boundary:

- Use Better Auth additional fields for auth/session profile data.
- Use Convex product tables for product/business invariants.
- Do not put organization membership, product permissions, or billing state into Better Auth user additional fields.

### Better Auth Member Additional Fields

```bash
pnpm feedback:better-auth-member-additional-fields
```

Proves Better Auth Organization can own lightweight member profile fields through the server-side add-member path:

- `member.additionalFields` stores `title`, `department`, and `billable` in the component `member` row.
- Public HTTP `/organization/add-member` is not exposed in this setup and returns 404.
- A guarded Convex mutation can call Better Auth server-side `auth.api.addMember` with those fields when adding an existing user to an organization.
- The server-side call can create a team-scoped membership.
- The app `memberships` table remains empty.

Current boundary:

- `/organization/update-member-role` updates role only.
- Extra member profile fields sent to `update-member-role` are ignored, and the original member profile fields are preserved.
- Use this for membership-scoped profile data that is set at member creation time. Use product/profile tables for mutable workflows until a Better Auth member-profile update endpoint is proven.

### Plugin-Owned Lifecycle Mutations

```bash
pnpm feedback:better-auth-org-lifecycle
```

Proves the Better Auth plugin-owned path under update/removal pressure:

- Better Auth updates organization `name`, `slug`, and additional fields `plan` and `region`.
- Better Auth updates team `name` and additional field `color`.
- Better Auth accepts a team-scoped invitation and creates `member` plus `teamMember`.
- A member can create product rows while their Better Auth role includes `project.create`.
- After owner downgrades that member to `viewer`, the member's existing session can still read but cannot create product rows.
- After owner removes that member, the member's existing session cannot read or create product rows.
- Removing the member deletes the component `member` row and the related component `teamMember` row.
- Removing an unused team deletes the component `team` row.
- The removed member's session row can remain, but it is harmless because Convex product authorization re-checks Better Auth membership and permissions at request time.
- App `organizations` and `memberships` stay empty.

### Plugin Limits

```bash
pnpm feedback:better-auth-org-limits
```

Proves important B2B invariants:

- Duplicate organization slugs fail.
- Outsiders cannot list members or set active organization.
- Default `member` role cannot update organization, create teams, or invite users.
- `hasPermission` returns `success: false` for missing member permissions.
- Owner can promote a member to `admin`.
- `admin` can update organization and create teams.
- `admin` cannot remove the only owner.
- Owner can promote another member to `owner`.
- Original owner can then leave.
- Former owner cannot list members after leaving.
- App-owned `organizations` and `memberships` tables are not present.

### Team-Scoped Product Boundary

```bash
pnpm feedback:better-auth-org-teams
```

Proves Better Auth teams can be used as an app product boundary without app-owned team mirrors:

- Better Auth creates a default owner team when the organization is created.
- Better Auth creates additional `team` rows with custom fields such as `color`.
- Team-scoped invitation acceptance creates a `teamMember` row.
- Org-only invitation acceptance creates a `member` row without a `teamMember` row.
- Convex product mutation `productAuthExperiments:createTeamProject` writes `projects.teamId` only after checking both Better Auth org project permission and Better Auth team membership.
- `productAuthExperiments:listTeamProjects` filters with `projects.by_org_team` and rejects callers that are not members of that team.
- An org member with `project.create` but no matching `teamMember` row is rejected for the team-scoped write.
- A member of one team is rejected when reading another team's projects.
- An outsider is rejected by Better Auth organization membership before team membership is checked.
- App-owned organization, membership, and team mirrors are not present.

Current boundary:

- Better Auth owns team membership state, but team-scoped product authorization is a Convex recipe that reads component `team` and `teamMember` rows. It is not a built-in `auth.api.hasPermission()` team-scope primitive.
- Product rows may reference Better Auth `teamId` as a foreign id string, the same way they reference Better Auth `organizationId`.
- Keep teams opt-in until product UX and data shape need a team boundary distinct from the organization.

### Product Authorization

```bash
pnpm feedback:better-auth-product-authz
```

Proves Convex product mutations can authorize against Better Auth state:

- Better Auth roles include a product permission resource:
  - `project.create`
  - `project.read`
  - `project.update`
  - `project.delete`
- Owner can create a Convex product row.
- Member can create a Convex product row.
- Viewer can read product rows.
- Viewer cannot create product rows.
- Outsider cannot read or create product rows.
- Product rows store Better Auth organization/user ids as strings.
- Product audit rows store Better Auth organization/user ids as strings.
- App `organizations`, `memberships`, and legacy `projects` stay empty.

The CLI feedback script passes a Better Auth session token into an experiment-only Convex argument because `convex run --identity` cannot provide the real Better Auth `sessionId` claim that the production Convex JWT carries. The intended production path is still `authComponent.getHeaders(ctx)` from the authenticated Convex request.

### Session Lifecycle Product Authorization

```bash
pnpm feedback:better-auth-session-lifecycle
```

Proves Better Auth session invalidation is visible to Convex product authorization:

- One user signs up, then signs in from a second cookie jar.
- Both Better Auth session tokens can authorize Convex product writes before revocation.
- `/api/auth/list-sessions` returns both active session rows.
- The local schema wrapper adds `session.userId_expiresAt`, matching Better Auth's active-session listing query.
- `/api/auth/revoke-session` from the primary session deletes the secondary session.
- The revoked secondary token fails Convex product authorization with `Unauthenticated`.
- The primary token still authorizes after revoking the other session.
- `/api/auth/sign-out` deletes the primary session.
- The signed-out primary token fails Convex product authorization with `Unauthenticated`.
- `/api/auth/get-session` returns `null` for the signed-out cookie jar.
- Component `session` is empty after revocation plus sign-out.
- Better Auth `user`, `organization`, and `member` rows remain intact.
- Product rows and audit events remain in Convex product tables.
- App-owned organization and membership mirrors are not present.

Decision:

- Better Auth `session` rows can remain the source of truth for session validity.
- Product authorization should keep resolving the current session through Better Auth APIs at request time; do not cache session validity in app tables.
- This is backend authorization evidence. Full Nuxt SSR/hydration sign-out behavior still needs a browser-backed UI check after the client cutover.

### Dynamic Organization Roles

```bash
pnpm feedback:better-auth-dynamic-roles
```

Proves Better Auth dynamic access control can remain the canonical runtime role source:

- Enabling `dynamicAccessControl` generates component table `organizationRole`.
- The local schema wrapper adds `organizationRole.organizationId_role`.
- Owner can create a dynamic role with `project.read`.
- Better Auth rejects invalid permission resources.
- A member without `ac.create` cannot create roles.
- Owner can assign a dynamic role to a member through `/organization/update-member-role`.
- Convex product authorization immediately respects the dynamic role.
- Updating the dynamic role from `project.read` to `project.read/create` immediately changes product authorization.
- Better Auth blocks deleting a role assigned to members.
- Dynamic role permissions are stored in the component table as JSON text, because the Convex adapter has no native JSON field support.
- App-owned organization and membership mirrors are not present.

### Organization API Keys

```bash
pnpm feedback:better-auth-api-keys
```

Proves the separate `@better-auth/api-key` package can run with the local Convex component:

- `better-auth/plugins` does not export `apiKey` in the installed `better-auth@1.6.20`.
- The matching plugin is a separate package, `@better-auth/api-key@1.6.20`.
- Adding the package and enabling `apiKey([{ configId: 'org-keys', references: 'organization' }])` generates component table `apikey`.
- The local schema wrapper needs explicit indexes for `apikey.key`, `apikey.expiresAt`, `apikey.referenceId`, and `apikey.configId_referenceId`.
- Owner can create, list, update, and delete organization-owned API keys.
- Member with `apiKey.read` can list organization keys but cannot create them.
- Viewer without `apiKey.read` cannot list organization keys.
- Outsider cannot list organization keys.
- Raw API key secrets are returned once on create and are not stored directly in the component table.
- Server-side Convex code can verify a raw API key through `auth.api.verifyApiKey()`.
- Deleted keys verify as `{ valid: false, error: { code: 'INVALID_API_KEY' } }`; invalid verification does not throw.
- App-owned organization and membership mirrors are not present.

Current limit:

- HTTP `POST /api/auth/api-key/verify` returns 404 in this Convex route setup even though the server plugin exposes `auth.api.verifyApiKey`.
- Treat API-key verification as a server-side Better Auth API call from Convex functions/routes for now.
- Do not promise public HTTP key verification through the Nuxt auth proxy until the route exposure is understood and intentionally enabled.
- API-key create/list/update/delete routes currently can log Convex "unawaited operation" warnings from the plugin cleanup path. The tested operations still succeed, but this should be investigated before treating API keys as production-ready.

### API-Key Warning Expected-Limit Probe

```bash
pnpm feedback:better-auth-api-key-warning-limit
```

This probe starts an isolated local Convex dev server, drives a minimal user-owned API-key lifecycle, captures the server log, and asserts the current dangling-operation warning is still emitted.

Findings:

- In `@better-auth/api-key@1.6.20`, management routes call `deleteAllExpiredApiKeys(ctx.context)` without awaiting the returned promise.
- The public `ApiKeyConfigurationOptions` surface includes `deferUpdates`, storage mode, expiry, rate limit, metadata, permissions, and reference mode, but no option to disable this expired-key cleanup.
- `deferUpdates` does not solve this warning path because the affected management routes call cleanup directly.
- This remains a production-readiness limit. The recommended path is upstream fix or accepted operational warning, not an app-owned API-key mirror or duplicate management route.

### API-Key-Authenticated Product Route

```bash
pnpm feedback:better-auth-api-key-product-route
```

Proves API keys can authorize a real Convex HTTP product operation when key scopes are modeled as Better Auth API-key configurations:

- `apiKey()` supports default permissions per `configId`.
- `org-project-writer` keys are created through the Better Auth HTTP management route with default `project.create`.
- `org-project-reader` keys are created through the same route with default `project.read`.
- `POST /api/projects` reads `x-api-key`, calls a Convex internal mutation, verifies the key with `auth.api.verifyApiKey()`, checks the key's organization reference, then writes product/audit rows.
- Writer key creates a `projects` row.
- Reader key cannot create a project.
- A writer key cannot create into another organization.
- Product rows and audit rows identify the actor as `apiKey:<apiKeyId>`.
- App-owned organization and membership mirrors are not present.

Failed path:

- Creating an organization API key with ad hoc `permissions` from a Convex mutation fails in this runtime with `dynamic module import unsupported`.
- The failing path comes from `@better-auth/api-key` dynamically importing Better Auth organization permission helpers while checking org API-key permissions.
- For Convex, prefer preconfigured API-key classes (`configId`) with default permissions over arbitrary per-key permission creation from Convex mutations.

### User-Owned API Keys

```bash
pnpm feedback:better-auth-user-api-keys
```

Proves the API-key plugin's default user reference mode can run with the local Convex component:

- `user-keys` stores `referenceId` as the owning Better Auth user id.
- A signed-in user can create, list, verify, and delete their own key.
- Another signed-in user lists zero keys and cannot delete the owner's key.
- Server-side Convex code can verify the raw key through `auth.api.verifyApiKey()`.
- Deleted user-owned keys verify as `{ valid: false, error: { code: 'INVALID_API_KEY' } }`.
- Raw key secrets are returned once on create and are not stored directly in the component table.
- App-owned organization and membership mirrors are not present.

## Key Findings

### 1. The npm component is not enough for organization plugins

Adding `organization()` to the default npm Better Auth Convex component exposed routes, but the first real write failed because the component schema did not include plugin models such as `member`.

Result:

- `organization/create` failed with a validator error for model `member`.
- The default npm component is useful for default schema usage.
- Schema-changing plugins need a local Better Auth component.

Decision:

- Use local component install for the team starter if Better Auth plugins do the B2B heavy lifting.

### 2. Local component schema works

The local component setup includes:

- `convex/betterAuth/convex.config.ts`
- `convex/betterAuth/auth.ts`
- `convex/betterAuth/adapter.ts`
- generated `convex/betterAuth/generatedSchema.ts`
- wrapper `convex/betterAuth/schema.ts` for custom indexes
- app registration through `convex/convex.config.ts`
- `createClient<DataModel, typeof authSchema>(..., { local: { schema } })`

Result:

- Organization, team, member, invitation, session, user, account, jwks, verification tables deploy.
- `convex dev --once --typecheck try --typecheck-components` passes.

Decision:

- Local component is the foundation for advanced Better Auth plugin work.

### 3. Convex should generate ids for Better Auth component documents

Invitation creation failed until Better Auth was configured with:

```ts
advanced: {
  database: {
    generateId: false,
  },
}
```

Reason:

- Better Auth attempted to pass an `_id` into Convex create operations.
- Convex create validators reject explicit `_id`.

Decision:

- Keep `advanced.database.generateId: false` for this local component approach.

### 4. Invitation email verification is a production policy, not a local test blocker

With `generateId: false`, accepting invitations can require verified email unless configured.

Local verification uses:

```ts
requireEmailVerificationOnInvitation: process.env.ALLOW_TEST_RESET !== 'true'
```

Result:

- Local test mode can accept invitations without email infrastructure.
- Production/default still requires email verification.

Decision:

- Keep the local bypass only for disposable local/preview deployments.

### 5. Additional fields work for org/team/invitation

The current spike added:

```ts
schema: {
  organization: {
    additionalFields: {
      plan: { type: 'string', required: false },
      region: { type: 'string', required: false },
    },
  },
  team: {
    additionalFields: {
      color: { type: 'string', required: false },
    },
  },
  invitation: {
    additionalFields: {
      note: { type: 'string', required: false },
    },
  },
}
```

Result:

- Fields appear in generated Convex schema.
- Fields are accepted by Better Auth HTTP routes.
- Fields persist in component tables.
- Fields are returned by Better Auth route responses.

Decision:

- Plugin-owned custom fields are viable for auth-domain metadata.
- Do not mirror these fields into app tables unless a product query requirement proves it.

Open question:

- Public member creation through invitation acceptance does not naturally collect extra `member` fields. Per-member profile metadata may need a server-side Better Auth route/hook or an app-owned product/profile table, depending on whether the metadata is auth-domain or product-domain.

### 6. Teams work, but they are not free

With teams enabled:

- Better Auth creates `team` and `teamMember` tables.
- Creating an organization also creates a default team named after the organization.
- Creating a separate team works.
- Invitation with `teamId` creates a `teamMember` row on accept.
- Team-scoped Convex product rows can reference Better Auth `teamId`.
- Team-scoped product reads/writes can be authorized by reading Better Auth `team` and `teamMember` rows directly from Convex.

Decision:

- Teams are feasible.
- Keep them only if the product actually has teams inside organizations. Otherwise they add extra auth-domain state, product indexes, and UI complexity.

### 7. Role invariants are strong

Verified defaults:

- `member` has no org/team/invite mutation permissions.
- `admin` can update org and manage teams/invites/members.
- `owner` has full default organization power.
- Removing the only owner fails.
- Leaving as the only owner fails.
- Ownership transfer works by promoting another member to owner first.

Decision:

- Better Auth can own core B2B role invariants.
- Product authorization should ask Better Auth for permission truth from Convex product functions.

### 8. Active session state has a stale-team edge

After the original owner leaves:

- Better Auth clears `session.activeOrganizationId`.
- The session can still retain the old `activeTeamId`.

Observed table state:

- former owner session has `activeOrganizationId: null`
- former owner session still has `activeTeamId: <old-team-id>`

Likely impact:

- Better Auth team routes still require an active organization before using active team, so this did not grant access in the tested flow.
- Nuxt UI should not treat `activeTeamId` as valid without `activeOrganizationId`.

Decision:

- Frontend state helpers should derive active team from a valid active organization context.
- Add a follow-up spike if we need stricter cleanup after leave/remove.

### 9. Hard reset is reliable but destructive

`experiment:hard-reset` imports an empty component snapshot and clears:

- app tables
- Better Auth component tables

Decision:

- Use hard reset for disposable local/preview feedback loops.
- Do not expose this in production.
- Use soft reset only when Better Auth auth state should remain.

### 10. Product authorization from Convex works

The product authorization spike added Better Auth `project` permissions to the organization access control setup:

```ts
project: ['create', 'read', 'update', 'delete']
```

Verified role behavior:

- `owner`: project create/read/update/delete
- `admin`: project create/read/update/delete
- `member`: project create/read
- `viewer`: project read

Convex experiment functions call:

```ts
auth.api.hasPermission({
  headers,
  body: {
    organizationId,
    permissions: { project: ['create'] },
  },
})
```

Result:

- Convex can enforce product permissions using Better Auth as the auth-domain source of truth.
- Product rows can reference Better Auth `organizationId` and `authUserId` strings.
- App-owned membership rows are not needed for product authorization.

Decision:

- The next implementation spike can cut `projects.organizationId` over to Better Auth organization id strings.
- Product audit rows should also use Better Auth ids after the cutover.

Sharp edge:

- Local CLI feedback needs an experiment-only session-token argument. In the real Nuxt/Convex flow, the Convex JWT includes `sessionId`, so `authComponent.getHeaders(ctx)` can resolve the Better Auth session.

### 11. Dynamic runtime roles work, with cost

Configuration:

```ts
organization({
  ac: b2bAccessControl,
  dynamicAccessControl: {
    enabled: true,
    maximumRolesPerOrganization: 20,
  },
  roles: { owner, admin, member, viewer },
})
```

Result:

- Generated schema adds `organizationRole`.
- Role CRUD endpoints work through `/api/auth/organization/*`.
- Unknown member roles are valid only when matching `organizationRole` rows exist.
- `auth.api.hasPermission()` checks dynamic role rows for explicit `organizationId`.
- Updating a role changes Convex product authorization without app-owned role tables.

Negative findings:

- Invalid permission resources fail with `INVALID_RESOURCE`.
- Members lacking `ac.create` cannot create roles.
- Assigned roles cannot be deleted; Better Auth returns `ROLE_IS_ASSIGNED_TO_MEMBERS`.
- Permissions are stored as serialized JSON in the component table.

Decision:

- Dynamic roles are feasible for sophisticated B2B apps.
- Static roles should remain the starter default because dynamic roles require an admin UI, role naming policy, and stronger tests.
- Dynamic roles can be an advanced recipe once the hard cutover is stable.

### 12. Admin user management works through Better Auth

Command:

```bash
pnpm feedback:better-auth-admin
```

Configuration:

```ts
admin({
  adminUserIds: splitEnvList(process.env.BETTER_AUTH_ADMIN_USER_IDS),
})
```

Result:

- Generated schema adds Better Auth component fields:
  - `user.role`
  - `user.banned`
  - `user.banReason`
  - `user.banExpires`
  - `session.impersonatedBy`
- A local-only `BETTER_AUTH_ADMIN_USER_IDS` value can bootstrap the first admin.
- Non-admin users cannot list users.
- Admin users can list users, create users, set roles, ban users, unban users, impersonate users, and stop impersonating.
- Banned users are blocked from signing in with `BANNED_USER`.
- Unbanning restores sign-in.
- Impersonation creates a session row with `impersonatedBy`; stopping impersonation deletes that impersonated session.
- App `organizations` and `memberships` remain empty.
- App `users` remains a projection of Better Auth users.

Decision:

- `admin()` is feasible for advanced B2B apps on this local component architecture.
- Do not build app-owned admin role tables for the starter.
- Product UI should call Better Auth Admin APIs through typed client plugins once the Nuxt client spike is done.
- First-admin bootstrap must be explicit. Env-listed admin ids are acceptable for local/seed/bootstrap; production needs a deliberate bootstrap story.

### 13. TOTP two-factor authentication works

Command:

```bash
pnpm feedback:better-auth-two-factor
```

Configuration:

```ts
twoFactor({
  issuer: 'Better Convex Nuxt Team',
})
```

Result:

- Generated schema adds:
  - `user.twoFactorEnabled`
  - component table `twoFactor`
- Enabling 2FA creates a `twoFactor` row with `verified: false`.
- The returned TOTP URI can be verified deterministically.
- Verifying TOTP marks the row with `verified: true` and sets `user.twoFactorEnabled: true`.
- Email/password sign-in returns `twoFactorRedirect: true` and `twoFactorMethods: ["totp"]` instead of a normal session token.
- Backup code verification completes a challenged sign-in.
- Backup codes are single-use; reusing the same code fails with `INVALID_BACKUP_CODE`.
- Disabling 2FA deletes the `twoFactor` row and resets `user.twoFactorEnabled: false`.
- Raw backup codes are not stored directly in component rows.
- App `organizations` and `memberships` remain empty.

Limits:

- The feedback script waits around Better Auth's 2FA rate limit. Product UX should avoid rapid repeated 2FA endpoint calls.
- OTP delivery is not verified here because it needs a real delivery/capture path.
- Full passkey registration/sign-in is covered by the dedicated browser WebAuthn spike, not by this TOTP spike.
- Email OTP is covered by the next spike; magic link and passkeys remain separate passwordless/productization tracks.

Decision:

- TOTP 2FA is feasible for a hardened B2B starter variant.
- Keep MFA state in Better Auth component tables; do not add app-owned MFA tables.
- Productize only with deliberate recovery/backup-code UX.

### 14. Email OTP passwordless works

Command:

```bash
pnpm feedback:better-auth-email-otp
```

Configuration:

```ts
emailOTP({
  generateOTP: localExperimentOtp,
  storeOTP: 'hashed',
  async sendVerificationOTP() {
    if (process.env.ALLOW_TEST_RESET === 'true') return
    throw new Error('Email OTP delivery is not configured')
  },
})
```

Result:

- Generated schema does not need a separate OTP table; Better Auth uses component table `verification`.
- Sign-in OTP rows are created with hashed values; the raw OTP is not stored in component data.
- Passwordless sign-in can auto-create a verified Better Auth user and session.
- Consumed sign-in OTPs cannot be replayed.
- Email-verification OTP marks an existing password user as verified.
- Sign-in and email-verification rows are consumed after success.
- App `users` projection is created for signed-in users.
- App-owned `organizations` and `memberships` tables are not present.

Limits:

- Real email delivery is not configured. The deterministic local OTP is gated by `ALLOW_TEST_RESET`.
- Password reset and change-email flows are not covered by this spike.
- Magic link is covered by the next spike; passkey UI/productization remains a separate passwordless track.

Decision:

- Email OTP is feasible for a passwordless starter option or hardened B2B recipe.
- Keep OTP state in Better Auth component tables; do not add app-owned OTP tables.
- Productize only after adding real delivery and UX for resend/rate-limit states.

### 15. Magic link passwordless works

Command:

```bash
pnpm feedback:better-auth-magic-link
```

Configuration:

```ts
magicLink({
  ...(process.env.ALLOW_TEST_RESET === 'true'
    ? { generateToken: localExperimentMagicLinkToken }
    : {}),
  storeToken: 'hashed',
  async sendMagicLink() {
    if (process.env.ALLOW_TEST_RESET === 'true') return
    throw new Error('Magic link delivery is not configured')
  },
})
```

Result:

- Generated schema does not need a separate magic-link table; Better Auth uses component table `verification`.
- Sign-in creates one verification row with a hashed token identifier.
- The raw magic-link token is not stored directly in component data.
- Verification can auto-create a verified Better Auth user and session.
- Consumed magic-link tokens cannot be replayed; replay redirects with `INVALID_TOKEN`.
- App `users` projection is created for the signed-in user.
- App `organizations` and `memberships` remain empty.

Limits:

- Real email delivery is not configured. The deterministic local token is gated by `ALLOW_TEST_RESET`.
- Redirect/callback UX is not covered by this spike.
- Passkey browser credential registration/authentication is covered by the dedicated passkey browser spike, not by this magic-link spike.

Decision:

- Magic link is feasible for a passwordless starter option or hardened B2B recipe.
- Keep token state in Better Auth component tables; do not add app-owned magic-link tables.
- Productize only after adding real delivery, callback UX, and rate-limit handling.

## Source-of-Truth Decision

The plugin-owned path is viable for the final B2B starter direction.

Use Better Auth component tables as canonical for:

- users
- sessions
- organizations
- members
- invitations
- teams, if enabled
- auth-domain custom fields

Use app Convex tables as canonical for:

- projects
- product records
- product audit events
- product workflows
- product-specific read models, only when proven necessary

Do not keep app `organizations`, `memberships`, or `invitations` beside Better Auth Organization in a greenfield starter.

## Final Research Ledger

1. Product authorization spike:
   - Status: passed in experiment form and promoted into the real `projects` implementation.
   - Evidence: `pnpm feedback:starter-ui-cutover` signs up through Nuxt, creates a Better Auth organization through the typed client, creates a product row through the real Convex `projects` functions, signs out, and asserts Better Auth organization/member rows plus app product/audit rows are written.
   - Disposition: starter default.

2. Session lifecycle spike:
   - Status: passed for two concurrent sessions, `revoke-session`, `sign-out`, stale-token product authorization denial, and final empty `session` table.
   - Status update: browser-backed sign-up, product write, and sign-out now pass in the UI cutover probe.
   - Disposition: starter default; add more SSR/hydration coverage only when the UI grows beyond the current simple flow.

3. Static product permission spike:
   - Status: passed and promoted into the real product authorization path.
   - Disposition: starter default.

4. Dynamic roles spike:
   - Status: passed in experiment form.
   - Disposition: advanced pattern, not starter default.

5. Organization API key spike:
   - Status: passed for organization-owned key management and server-side verification.
   - Status: user-owned API key management passed for create/list/server-verify/delete and cross-user isolation.
   - Status: typed Nuxt client surface passed for `apiKey.create`, `apiKey.list`, `apiKey.update`, and `apiKey.delete`.
   - Limit: HTTP `/api-key/verify` is not exposed in the current Convex route setup.
   - Status: product-route authorization passed with config-level default permissions.
   - Limit: ad hoc per-key permission creation from a Convex mutation fails with `dynamic module import unsupported`.
   - Disposition: use predefined key configs; keep ad hoc per-key permissions out until the dynamic-import blocker is solved.

6. Admin user management spike:
   - Status: passed for list/create/set-role/ban/unban/impersonation.
   - Status: typed Nuxt client surface passed for `admin.listUsers`, `admin.createUser`, `admin.setRole`, `admin.banUser`, and `admin.impersonateUser`.
   - Limit: first-admin bootstrap still needs a product decision.
   - Disposition: advanced recipe until first-admin bootstrap and UI policy are productized.

7. TOTP two-factor spike:
   - Status: passed for enrollment, verification, sign-in gate, backup code use, backup code reuse rejection, and disable.
   - Status: typed Nuxt client surface passed for `twoFactor.enable`.
   - Limit: delivery-backed OTP and passkeys are not proven by this spike. Magic link is covered by its own spike.
   - Disposition: hardened-auth recipe, not base starter default.

8. Email OTP spike:
   - Status: passed for passwordless sign-in, email verification, hashed storage, replay rejection, and row consumption.
   - Status: typed Nuxt client surface includes `emailOtp`.
   - Limit: real email delivery, password reset, change email, and passkeys are not covered.
   - Disposition: runtime capability proven; real delivery is required before product use.

9. Magic link spike:
   - Status: passed for passwordless sign-in, hashed token storage, replay rejection, row consumption, and user/session creation.
   - Status: typed Nuxt client surface includes `magicLink`.
   - Limit: real email delivery, redirect/callback UX, and passkeys are not covered.
   - Disposition: runtime capability proven; real delivery and callback UX are required before product use.

10. Passkey spike:

- Status: server/runtime boundary passes with `@better-auth/passkey@1.6.20`.
- Status: browser WebAuthn boundary passes with Chromium virtual authenticator.
- Status: typed Nuxt client surface passed for `passkey.addPasskey` and `signIn.passkey`.
- Proven: package exports, local component schema generation, Convex compile, `passkey` table reset/inspection, registration option generation, browser credential creation, registration verification, passkey listing, sign-out, browser credential authentication, session creation, challenge consumption, and final hard reset.
- Limit: real-device authenticator behavior and Nuxt passkey management UI are not proven.
- Disposition: hardened-auth recipe until starter UI controls are intentionally added.

11. OIDC provider spike:

- Status: runtime probe passes for deprecated `oidcProvider()`.
- Proven: schema generation, dynamic client registration, consent, authorization-code token exchange, userinfo, and component table inspection.
- Limit: `@better-auth/oauth-provider` is not installed; token revocation/introspection endpoints are absent in the current deprecated provider surface.
- Disposition: advanced API-platform recipe only.

12. Device authorization spike:

- Status: runtime probe passes for `deviceAuthorization()`.
- Proven: device code creation, client validation, pending polling, claim, approve, token exchange, deny, row consumption, and session creation.
- Proven: device-issued Better Auth session tokens can authorize Convex product functions, and the same token respects later role downgrade and member removal.
- Limit: Nuxt verification UI, polling UX, and QR/display UX are not proven.
- Disposition: API/platform recipe, not base starter behavior.

13. MCP / platform auth spike:

- Status: runtime probe passes for `mcp()` in isolated local mode.
- Proven: MCP OAuth discovery, protected-resource metadata, dynamic client registration, consent, token exchange, `/mcp/get-session`, and component table inspection.
- Limit: `mcp()` conflicts with `oidcProvider()` on `POST /oauth2/consent` if both are enabled together; advertised `/mcp/userinfo` and `/mcp/jwks` return 404; dynamic MCP client secrets are stored raw; token revocation/introspection endpoints are absent.
- Disposition: isolated API-platform recipe only.

14. Generic OAuth spike:

- Status: runtime probe passes for `genericOAuth()` with a local synthetic provider.
- Proven: OAuth state generation, callback handling, configured token/profile hooks, Better Auth `account` row creation, Better Auth user/session creation, app `users` projection, state consumption, and replay rejection.
- Status: expected-limit probe passes for `oAuthProxy()` plus `genericOAuth()`.
- Proven limit: `oAuthProxy()` encrypts state and rewrites callback state for Generic OAuth, but the Generic OAuth callback route rejects the encrypted state with `state_mismatch`; no user/account/session rows are created.
- Limit: real provider config, Nuxt callback/error UX, account-linking policy, and `oAuthProxy()` with built-in social providers are not proven.
- Disposition: auth-provider recipe; do not add app-owned social account tables.

15. OAuth token product route spike:

- Status: runtime probe passes for OIDC and MCP bearer access tokens.
- Proven: component `oauthAccessToken` lookup, `project:create` scope enforcement, component `member` lookup, product row creation, audit event creation, missing-scope denial, invalid-token denial, and no app-owned org/member mirrors.
- Limit: the route uses explicit recipe logic; Better Auth does not currently expose a product permission API that accepts OAuth/MCP access tokens directly.
- Disposition: advanced recipe only; account for missing introspection/revocation and reusable refresh tokens.

16. OAuth token lifecycle spike:

- Status: runtime probe passes for OIDC and MCP refresh grants.
- Proven: refresh grants issue new token strings, new access tokens validate, old access tokens remain valid, old refresh tokens remain reusable, revoke/introspect endpoints return 404, and component token rows accumulate.
- Limit: current behavior is not strict single-use refresh-token rotation.
- Disposition: do not expose OAuth/MCP bearer tokens as a high-security public API boundary without an explicit invalidation/cleanup strategy or upstream provider change.

17. OAuth client credentials spike:

- Status: expected-limit probe passes for OIDC and MCP.
- Proven: discovery does not advertise `client_credentials`; registration accepts `client_credentials` metadata; token endpoints reject the grant with `invalid_request` / `code is required`; no token rows are created.
- Limit: current OIDC/MCP surfaces are not machine-to-machine OAuth providers.
- Disposition: keep service integrations on Better Auth API keys unless a replacement OAuth Provider proves real client-credentials support.

18. Enterprise SSO / SCIM spike:

- Status: SSO expected-limit probe passes; SCIM partial-runtime probe passes.
- Limit: SSO remains a future enterprise integration track, likely external or Node-bound. SCIM can provision through GET/POST routes, but full SCIM lifecycle is blocked until `/api/auth/*` can route PUT/PATCH/DELETE to Better Auth.
- Disposition: do not build custom SAML/SCIM. For SCIM, first solve route-method registration, then verify update, patch, delete/deprovision, provider-connection management, and IdP-compatible filters.

19. Stripe billing spike:

- Status: partial runtime probe passes for `@better-auth/stripe@1.6.20`.
- Proven: the package installs with `stripe@22.x`, local Better Auth component schema generation adds `subscription` and `stripeCustomerId` fields, Convex accepts explicit subscription indexes including `referenceId_status`, an organization owner can list organization subscriptions through Better Auth, an outsider is rejected by `authorizeReference`, checkout start creates an incomplete Better Auth `subscription` row, checkout success activates the row with Stripe subscription id, billing period, interval, seats, and plan limits, Convex product logic rejects writes before activation, allows exactly 10 local `team` plan projects from the active Better Auth subscription row, rejects the 11th project, and the path creates no app-owned billing rows.
- Limit: the probe uses a local fake Stripe client and one shared local plan definition. Real Stripe customer creation, webhook verification, webhook-driven subscription lifecycle writes, billing portal, seat sync, cancellation/restore/upgrade, and real Stripe price metadata are not proven.
- Disposition: advanced recipe only after real Stripe/webhook lifecycle passes. Keep Better Auth subscription rows as the billing-domain source of truth and Convex product functions as the entitlement enforcement layer.

20. Member metadata spike:

- Status: passed for Better Auth `member.additionalFields` via server-side member creation.
- Disposition: use Better Auth for lightweight membership metadata set at membership creation; use app product/profile tables for mutable product workflows.

## Current Recommendation

Current hard-cutover baseline:

1. Keep the local Better Auth component.
2. Keep `organization()` as the canonical team model.
3. Replace app-owned organization/membership authorization with Better Auth permission checks.
4. Keep app-owned org/member/invite tables deleted.
5. Keep app `users` as a projection only.
6. Keep app audit events for product-domain history.
