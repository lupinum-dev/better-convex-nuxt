# Delegated human OAuth MCP starter

This starter is the public, delegated-human MCP model. Better Auth is the OAuth
authorization server, Better Convex Nuxt exposes it through the same-origin
`/api/auth` proxy, and the fixed `/mcp` resource accepts short-lived OAuth
access tokens. Convex remains the product-authorization authority.

It is not a variant of the private service-actor starter:

| Property          | This starter                                              | `starters/mcp-agent`             |
| ----------------- | --------------------------------------------------------- | -------------------------------- |
| Credential owner  | A human Better Auth user                                  | An app-owned service actor       |
| User involvement  | Interactive sign-in and explicit OAuth consent            | An admin provisions a credential |
| Public exposure   | Public OAuth authorization server and MCP resource        | Private MCP deployment           |
| Revocation source | Session, client, consent, membership, and live delegation | App-owned service credential     |
| Intended use      | External MCP clients acting for a user                    | Controlled internal automation   |

Do not add `MCP_SERVER_SECRET` to this starter. Do not expose the private
starter using this starter's public topology. They intentionally have different
trust boundaries.

## What the starter proves

- Better Auth and its OAuth Provider use the same Convex component adapter and
  canonical component database. There is no second OAuth table set.
- OAuth supports only authorization code, mandatory PKCE, exact HTTPS or RFC
  8252 loopback-IP redirects, explicit consent, the fixed
  `mcp:read`/`mcp:write` scopes, and the exact same-origin `/mcp` resource.
- The Nuxt `/mcp` route is a bounded fixed-target proxy. It does not parse the
  token, choose a Convex function, or make product-authorization decisions.
- One Convex HTTP action verifies the issuer, resource, token class, algorithm,
  subject, session, client, and scopes. It maps five fixed tool names to five
  tool-specific internal mutations and never passes the raw token onward.
- Each tool transaction re-reads the active Better Auth session, OAuth client,
  resource link, consent, app user, organization membership, delegation,
  resource ownership, and approval state before reading or changing product
  data. Token scopes are only a ceiling.
- Project deletion remains soft, previewable, and bound to a short-lived human
  approval that can be used only once.

`users` is a rebuildable app projection of the canonical Better Auth user. The
`oauthAdmin` bit, organizations, memberships, delegations, projects, and
approvals are app-owned Convex state. OAuth client/resource/consent rows remain
provider-owned component state.

## Local setup

Use a fresh deployment. This starter is greenfield and intentionally contains
no legacy component migration or compatibility path.

1. Install dependencies and create local configuration:

   ```bash
   pnpm install
   cp .env.example .env.local
   ```

2. Fill `.env.local` with the exact Nuxt origin and Convex deployment URLs.
   Generate two independent random secrets: a versioned
   `BETTER_AUTH_SECRETS=1:<at-least-32-random-bytes>` value and a different
   `BCN_AUTH_PROXY_IP_SECRET` of at least 32 random bytes. Never commit this
   file.

3. Start Convex, then mirror the server-only values into the selected Convex
   deployment:

   ```bash
   pnpm convex:dev
   pnpm exec convex env set SITE_URL http://localhost:3000
   pnpm exec convex env set CONVEX_SITE_URL https://YOUR-DEPLOYMENT.convex.site
   pnpm exec convex env set BETTER_AUTH_SECRETS '1:YOUR-RANDOM-SECRET'
   pnpm exec convex env set BCN_AUTH_PROXY_IP_SECRET 'YOUR-SEPARATE-RANDOM-SECRET'
   ```

   Run the `convex env set` commands in another terminal while `convex:dev` is
   active. The `SITE_URL` value must exactly match the public Nuxt origin.

4. Start Nuxt in another terminal:

   ```bash
   pnpm dev
   ```

5. Create the first local Better Auth user. The starter has no public sign-up
   page; this explicit local bootstrap call keeps account creation separate
   from the OAuth login page:

   ```bash
   curl --fail-with-body \
     -H 'Content-Type: application/json' \
     -H 'Origin: http://localhost:3000' \
     -d '{"name":"Local OAuth Admin","email":"admin@example.com","password":"local-test-password"}' \
     http://localhost:3000/api/auth/sign-up/email
   ```

6. Grant that projected user the app-owned OAuth administrator capability from
   the trusted Convex CLI or dashboard operator context:

   ```bash
   pnpm exec convex run mcpAdmin:setOAuthAdministratorByEmail \
     '{"email":"admin@example.com","enabled":true}'
   ```

The administrator bit does not grant organization access. It only allows the
provider's client/resource administration callbacks. Missing users, inactive
users, ordinary sessions, callback errors, and callback timeouts deny the
operation.

## Provider-owned fixture provisioning

The interoperability runner signs in as the bootstrapped administrator and
calls `/api/auth/mcp/admin/provision`. That authenticated endpoint dispatches
the OAuth Provider's own resource-list/create, client-list/create, and
client-resource-link endpoints. It never writes OAuth component models through
the raw adapter.

The provider generates the client IDs. Stable `software_id` values let a rerun
find the two fixture profiles without creating a second source of truth:

- MCP Inspector: `http://localhost:6274/oauth/callback`;
- `mcp-remote`: `http://127.0.0.1:3334/oauth/callback`.

Every stored field is compared with the fixed profile. A duplicate profile or
any drift in callbacks, grants, scopes, PKCE, consent, DPoP, client type, token
authentication, or resource policy fails closed. App-owned 24-hour fixture
delegations are created only after the provider operations succeed.

From the repository root, run the black-box interoperability harness:

```bash
pnpm test:mcp-auth
```

That default command creates its own temporary starter copy, pinned local
Convex backend, Nuxt server, administrator, and random secrets. It removes only
that self-contained temporary fixture when the run ends.

The harness drives the pinned MCP Inspector UI and `mcp-remote` with static
public-client information. It leaves client-secret fields empty, rejects any
dynamic-registration request, uses isolated mode-0700 client/browser storage,
redacts authorization URLs and runner secrets, and removes that isolated client
state after every run.

### External disposable deployment evidence

An already-running deployment can be exercised only through the explicit
`external-disposable` mode. This is a destructive, one-run release-evidence
path, not a development convenience and never a production or shared staging
check. Start from a fresh deployment and a fresh administrator account. Deploy
this exact starter, keep Nuxt running at the supplied origin, and ensure the
absolute app directory contains `.env.local` with exact matching `SITE_URL`,
`CONVEX_URL`, `CONVEX_SITE_URL`, `NUXT_PUBLIC_CONVEX_URL`, and
`NUXT_PUBLIC_CONVEX_SITE_URL` values. The account must already exist, use a
password of at least 15 characters, and have `oauthAdmin` enabled.

```bash
BCN_MCP_TEST_MODE=external-disposable \
BCN_MCP_TEST_APP_DIR=/absolute/path/to/fresh-mcp-oauth-agent \
BCN_MCP_TEST_ORIGIN=https://fresh-app.example.test \
BCN_MCP_TEST_CONVEX_URL=https://fresh-deployment.convex.cloud \
BCN_MCP_TEST_CONVEX_SITE_URL=https://fresh-deployment.convex.site \
BCN_MCP_TEST_EMAIL=mcp-evidence@example.test \
BCN_MCP_TEST_PASSWORD='one-time-test-password' \
pnpm test:mcp-auth
```

The runner does not provision, deploy, stop, reset, or delete the external app
or deployment. Its release hook is intentionally a no-op. During evidence it
does provision provider-owned test clients and app delegations, changes and
deletes sessions, clients, and consents, changes membership and authorization
state, and creates and soft-deletes projects. Terminal-revocation cases are not
restored. Treat the deployment as consumed after the run and destroy it using
the deployment owner's reviewed process. A rerun is not supported evidence.
The runner invokes only the repository-pinned absolute Convex CLI, from the
supplied app directory, with that directory's `.env.local`; fixture credentials
and deployment overrides are stripped from every child process environment.

The official MCP server-mode protocol suite is separate evidence. Supply one
fresh, least-scope fixture bearer through the authorized runner environment and
run:

```bash
BCN_MCP_TEST_ORIGIN=http://localhost:3000 \
BCN_MCP_CONFORMANCE_BEARER='FRESH-FIXTURE-ACCESS-TOKEN' \
pnpm test:mcp-conformance
```

This validates MCP protocol behavior through the fixed loopback relay. It is
not OAuth certification or OAuth conformance.

## Login and consent boundary

The provider signs the bounded continuation query. Before either page displays
client data, the browser submits that signed value to the provider's
`/oauth2/public-client-prelogin` endpoint. The UI then renders only the returned
client ID/name plus the exact same-origin resource and allowlisted scopes from
the verified transaction. It never accepts display names from query input and
cannot widen consent. Login and consent responses are no-store, deny framing,
and use a no-referrer policy.

## Production adaptation

The two localhost clients and the 24-hour fixture delegation are test fixtures,
not a generic client-registration product. For production:

- replace the fixed profiles with reviewed client names, exact HTTPS callbacks,
  exact scopes, and an operator-owned app grant workflow;
- keep requesters from supplying restricted OAuth fields, resource identifiers,
  callbacks, or consent-bypass settings;
- continue using provider admin endpoints for OAuth rows and app mutations for
  product grants; never add direct OAuth adapter writes;
- govern or disable public account creation and use a reviewed operator process
  for setting `oauthAdmin`;
- revoke bootstrap administrator capability when it is no longer needed;
- terminate TLS at a trusted ingress, configure deployment-level abuse controls,
  keep Better Auth's database-backed rate limiter enabled, and never log
  cookies, codes, tokens, signed continuation queries, or authorization headers;
- rotate versioned Better Auth secrets, the proxy-IP signing secret, and OAuth
  signing keys according to the deployment runbook.

The beta deliberately does not enable refresh tokens, dynamic registration,
CIMD, DPoP, client credentials, private-key client authentication,
introspection, UserInfo, or OIDC scopes. Do not enable one merely to satisfy an
unsupported client.

OAuth access tokens are self-contained JWTs with a maximum ten-minute lifetime.
Deleting a session or consent, disabling a client/resource, unlinking the
resource, or changing membership/delegation is checked live and blocks the next
tool call. Revoking only one already-issued JWT has a residual window until its
`exp`; the starter does not claim immediate individual-token revocation.

## Verification

The maintained candidate must pass codegen, typecheck, build, security tests,
the clean-tarball candidate matrix, both real OAuth client paths, and the
official MCP server-mode suite:

```bash
pnpm convex:codegen
pnpm typecheck
pnpm build
```

The supported tuple is exact: Better Auth and OAuth Provider `1.7.0-rc.1`,
Convex `1.42.2`, Kysely `0.28.17`, and Better Convex Nuxt `0.7.0-beta.0`. Kysely
`0.29.2` is not compatible with this pinned beta adapter tuple.
