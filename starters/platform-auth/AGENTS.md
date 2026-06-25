# Platform Auth Starter Guardrails

- This starter is a proof for the current `@better-auth/oauth-provider` path only.
- Do not add deprecated `oidcProvider()` or `mcp()` plugin tables here.
- Do not add product tables until token-to-product authorization is being proven.
- OAuth client, grant, consent, refresh token, and access token state belongs to Better Auth.
- App-owned schema must not mirror Better Auth user, session, organization, member, OAuth client, or OAuth token state.
- Keep this experimental until mounted lifecycle, token invalidation, resource auth, and deployment behavior are proven.
