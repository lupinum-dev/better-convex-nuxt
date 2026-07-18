# RFC: Clean Anonymous Convex Token Bootstrap

- Status: Proposed
- Date: 2026-07-18
- Target: Next compatible `better-convex-nuxt` release

## Summary

Change the Better Auth Convex token endpoint so that an ordinary anonymous browser request is represented as a successful response with no token:

```http
HTTP/1.1 200 OK
Content-Type: application/json
Cache-Control: private, no-store

{"token":null}
```

The endpoint must continue to return `401 Unauthorized` when credentials are present but invalid, expired, revoked, or otherwise fail validation.

The intended contract is:

| Request state                    | Response                   | Meaning                       |
| -------------------------------- | -------------------------- | ----------------------------- |
| No session credentials           | `200 { "token": null }`    | Expected anonymous state      |
| Valid session                    | `200 { "token": "<jwt>" }` | Authenticated Convex identity |
| Invalid or revoked credentials   | `401`                      | Authentication failure        |
| Unsupported credential transport | `401`                      | Authentication failure        |

This removes an avoidable failed network request from normal anonymous page loads without weakening token issuance or session validation.

## Motivation

The browser auth bootstrap currently calls `GET /api/auth/convex/token` before it knows whether a Better Auth session exists. The endpoint uses `sessionMiddleware` and returns `401 Unauthorized` when no session is present. The client catches that response and correctly settles into an anonymous state.

The application therefore behaves correctly, but the HTTP response still appears as a failed request in browser developer tools. Firefox and other browsers may surface it as a red XHR or console/network error. This makes a normal public page load look broken and creates noise when diagnosing real authentication failures.

An anonymous user has not failed authentication. They have supplied no credentials and should receive no token. That state can be represented directly without using an error response.

## Goals

1. Ensure a normal anonymous page load produces no authentication-related `4xx` response.
2. Preserve the current client-visible anonymous state and connection behavior.
3. Keep invalid, expired, forged, and revoked credentials distinguishable from an absent session.
4. Issue a Convex JWT only after full Better Auth session validation.
5. Preserve `private, no-store` caching semantics for token responses.
6. Keep the change inside the existing token endpoint and token-fetch lifecycle.
7. Cover the HTTP contract and security invariants with automated tests.

## Non-goals

This RFC does not propose:

- returning a placeholder or anonymous JWT;
- making protected Convex functions accessible to anonymous callers;
- suppressing browser logs or monkey-patching `fetch`;
- adding a separate session-probe request before token exchange;
- changing Better Auth session creation, cookies, or renewal;
- changing Convex authorization rules;
- treating invalid credentials as anonymous success;
- adding a second client-side source of truth for authentication;
- changing how authenticated server-side requests exchange tokens.

## Current behavior

The token endpoint is registered at `/convex/token` and uses Better Auth's session middleware. Its handler currently rejects both of these states with the same `401` response:

1. no authenticated session exists;
2. a session exists but cannot be trusted or persisted session validation fails.

The client token fetcher intentionally maps `401` and `403` to a definitive anonymous identity when no usable token can be obtained. This prevents an application error, but it cannot prevent the browser from reporting the underlying failed HTTP request.

The result is an overloaded status code: `401` means both expected absence of identity and rejected credentials.

## Proposed behavior

### Endpoint contract

When session middleware produces no session and the request does not represent a rejected or newly invalidated session, return:

```ts
return ctx.json({ token: null })
```

When a valid session is available and persisted-session validation succeeds, retain the existing token issuance path:

```ts
return ctx.json({ token })
```

Retain `401 Unauthorized` for all credential failure cases, including:

- a session cookie that is invalid, expired, or revoked;
- a session that changes or becomes invalid during the request;
- a mismatch between middleware and persisted session state;
- unsupported bearer-token use;
- any request that presents credentials but cannot prove a valid session.

### Response type

The successful response type becomes:

```ts
interface ConvexTokenResponse {
  token: string | null
}
```

The generated OpenAPI schema and auth-client plugin types must reflect the nullable token.

### Client behavior

The token fetcher already treats a missing token as anonymous. It should explicitly accept the nullable response and settle with:

```ts
{
  identity: null,
  authError: null,
  definitive: true,
}
```

No additional request, retry, cache, or client auth state is needed.

### Server-side behavior

Server-side auth snapshot creation already checks for a supported Better Auth session cookie before attempting token exchange. A request with no session cookie remains anonymous without calling the exchange endpoint.

Authenticated server-side exchange must continue to require a non-null token. Receiving `200 { "token": null }` after presenting a session cookie is not a successful authenticated exchange and must not be treated as one.

## Security model

This proposal changes the status code for absence of credentials, not the authorization boundary.

The following invariants remain mandatory:

1. No Convex JWT is issued without a fully validated Better Auth session.
2. A revoked session cannot be downgraded into a successful anonymous token exchange.
3. Invalid credentials receive `401`, even though a request with no credentials receives `200`.
4. Token responses are never publicly cached.
5. The client cannot choose whether a request is classified as absent or invalid; that decision is made from trusted server-side session state.
6. Convex functions remain responsible for authorization based on `ctx.auth.getUserIdentity()` and application invariants.

Returning `{ token: null }` discloses no additional private information and grants no capability.

## Why not preflight the session?

An alternative is to call a session endpoint first and request a Convex token only when that endpoint reports an authenticated user. This is rejected because it:

- adds a network round trip to authenticated bootstrap;
- duplicates session state across two requests;
- creates a race when a session expires or is revoked between requests;
- does not eliminate the need for the token endpoint to validate the session;
- can still produce a `401` after a successful preflight.

One token request with an explicit nullable success response is simpler and more correct.

## Why not return `204 No Content`?

`204` accurately indicates that no token body exists, but the existing auth client uses a JSON response contract. A nullable JSON field is explicit, typeable, and avoids special parsing behavior in Better Auth's client transport.

`200 { "token": null }` also keeps authenticated and anonymous successful responses under one stable schema.

## Why not keep the `401`?

The current behavior is technically handled, but it conflates an expected public state with rejected authentication. It also creates observable failure noise on every anonymous bootstrap.

Keeping `401` would be reasonable only if the endpoint were called exclusively after credentials were known to exist. That is not the current client lifecycle, and adding such knowledge would require the rejected preflight or a second auth source of truth.

## Implementation outline

1. Update the `/convex/token` endpoint to distinguish an absent session from an invalid session.
2. Return `{ token: null }` only for the ordinary no-credential anonymous path.
3. Preserve existing `unauthorized()` branches for invalid, changed, expired, or revoked sessions.
4. Change the endpoint response schema to `string | null`.
5. Change the auth-client plugin token response type to `string | null`.
6. Update the token fetcher tests to model anonymous bootstrap as a successful nullable response.
7. Retain explicit tests for all `401` security cases.
8. Add an end-to-end browser assertion that an anonymous initial load produces no token-endpoint `4xx` response.

No compatibility adapter, feature flag, alternate endpoint, or dual behavior is proposed.

## Acceptance criteria

The change is complete when all of the following are true:

- An anonymous browser opening a public page receives `200 { "token": null }` from `/api/auth/convex/token`.
- The anonymous client settles definitively with no identity and no auth error.
- The browser console and network log contain no failed auth request caused solely by the absence of a session.
- A valid Better Auth session receives `200` with a usable Convex JWT.
- A revoked session receives `401` and no token.
- An expired or malformed session receives `401` and no token.
- Unsupported bearer authentication receives `401` and no token.
- Authenticated SSR and Nuxt server routes continue to obtain a token.
- Token responses retain `Cache-Control: private, no-store`.
- Unit, type, integration, and relevant end-to-end tests pass.

## Test matrix

| Scenario                          | Expected HTTP status | Expected token | Expected client state  |
| --------------------------------- | -------------------: | -------------- | ---------------------- |
| First visit, no cookies           |                `200` | `null`         | Definitively anonymous |
| Valid session cookie              |                `200` | JWT string     | Authenticated          |
| Revoked session cookie            |                `401` | None           | Authentication failure |
| Expired session cookie            |                `401` | None           | Authentication failure |
| Malformed session cookie          |                `401` | None           | Authentication failure |
| Unsupported bearer token          |                `401` | None           | Authentication failure |
| Session revoked during validation |                `401` | None           | Authentication failure |
| Anonymous SSR request             | No exchange required | None           | Anonymous snapshot     |
| Authenticated SSR request         |                `200` | JWT string     | Authenticated snapshot |

## Compatibility and rollout

The wire contract changes only for session-less token requests: the response moves from `401` to `200` with a nullable token. Existing applications using the package's token fetcher continue to receive the same semantic anonymous state.

Consumers that call the endpoint directly and assume every `200` response contains a string token must adopt the nullable response type. This is an appropriate correction because absence of identity is already part of the endpoint's runtime domain.

The change should ship as one hard cutover in the library. There should be no configuration option for legacy anonymous `401` behavior.

## Documentation

Authentication documentation should state the three-state contract clearly:

- no credentials means anonymous success with no token;
- valid credentials produce a Convex token;
- rejected credentials produce an authentication error.

Troubleshooting documentation should reserve token-endpoint `401` responses for actual credential failures. This makes a reported `401` materially useful during debugging.

## Decision

Adopt `200 { "token": null }` for requests with no session credentials, while retaining `401 Unauthorized` for requests whose credentials fail validation.

This is the smallest change that removes misleading browser failures, preserves one authentication lifecycle, and keeps the security boundary explicit.
