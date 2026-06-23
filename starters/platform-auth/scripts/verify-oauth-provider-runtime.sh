#!/usr/bin/env bash
set -euo pipefail

stamp="$(date +%s)"
email="platform-oauth-$stamp@example.com"
password="password123"
site_url="${SITE_URL:-http://localhost:3000}"
convex_site_url="http://127.0.0.1:3211"
redirect_uri="$site_url/oauth-provider/callback"
cookie_jar="$(mktemp)"
headers_file="$(mktemp)"
body_file="$(mktemp)"

cleanup() {
  rm -f "$cookie_jar" "$headers_file" "$body_file"
}

trap cleanup EXIT

json_field() {
  node -e "let input = ''; process.stdin.on('data', d => input += d); process.stdin.on('end', () => process.stdout.write(String(JSON.parse(input)$1 ?? '')))"
}

request_json() {
  local method="$1"
  local path="$2"
  local body="$3"
  local expected_status="$4"
  local response
  local status
  local payload

  response=$(curl -sS -w '\n%{http_code}' -X "$method" "$convex_site_url$path" \
    -H 'Content-Type: application/json' \
    -H "Origin: $site_url" \
    -b "$cookie_jar" \
    -c "$cookie_jar" \
    --data "$body")
  status="$(printf '%s' "$response" | tail -n 1)"
  payload="$(printf '%s' "$response" | sed '$d')"
  if [[ "$status" != "$expected_status" ]]; then
    printf 'request failed: %s %s expected %s\n%s\n' "$path" "$status" "$expected_status" "$payload" >&2
    exit 1
  fi
  printf '%s' "$payload"
}

echo "== configure local OAuth Provider proof env"
echo "SITE_URL and BETTER_AUTH_SECRET must be set on the running convex dev process."

echo "== auth config stays static for anonymous local proof"
node --input-type=module <<'NODE'
import { readFileSync } from 'node:fs'

const source = readFileSync('convex/auth.config.ts', 'utf8')
if (source.includes('process.env')) {
  throw new Error('auth.config.ts must not read process.env in the anonymous local proof')
}
if (!source.includes("domain: 'http://localhost:3000'")) {
  throw new Error('auth.config.ts must keep the local Convex auth provider domain explicit')
}
console.log(JSON.stringify({ authConfigDomain: 'http://localhost:3000' }, null, 2))
NODE

echo "== OAuth Provider hard-cut source guard"
node --input-type=module <<'NODE'
import { readFileSync } from 'node:fs'

const packageJson = JSON.parse(readFileSync('package.json', 'utf8'))
const deps = { ...packageJson.dependencies, ...packageJson.devDependencies }
const authSource = readFileSync('convex/auth.ts', 'utf8')
const betterAuthSchemaSource = readFileSync('convex/betterAuth/generatedSchema.ts', 'utf8')
const appSchemaSource = readFileSync('convex/schema.ts', 'utf8')

if (deps['@better-auth/oauth-provider'] !== '1.6.20') {
  throw new Error('platform-auth must stay pinned to the proven @better-auth/oauth-provider version')
}
if (deps['@better-auth/oidc-provider']) {
  throw new Error('platform-auth must not add the old OIDC provider package beside OAuth Provider')
}
if (!authSource.includes("from '@better-auth/oauth-provider'")) {
  throw new Error('convex/auth.ts must mount the current @better-auth/oauth-provider package')
}
if (!/\boauthProvider\s*\(/.test(authSource)) {
  throw new Error('convex/auth.ts must mount oauthProvider()')
}
if (/\boidcProvider\s*\(/.test(authSource) || /\bmcp\s*\(/.test(authSource)) {
  throw new Error('platform-auth must not mount deprecated oidcProvider() or mcp() plugins beside OAuth Provider')
}
for (const tableName of [
  'oauthApplication',
  'oauthApplicationAccessToken',
  'oauthApplicationAuthorizationCode',
  'oauthApplicationConsent',
  'oauthApplicationRefreshToken',
]) {
  if (new RegExp(`\\b${tableName}\\s*:`).test(betterAuthSchemaSource)) {
    throw new Error(`generatedSchema.ts must not include deprecated ${tableName} table`)
  }
}
for (const tableName of ['oauthClient', 'oauthRefreshToken', 'oauthAccessToken', 'oauthConsent']) {
  if (!new RegExp(`\\b${tableName}\\s*:`).test(betterAuthSchemaSource)) {
    throw new Error(`generatedSchema.ts is missing current OAuth Provider ${tableName} table`)
  }
}
if (!/\boauthProjects\s*:\s*defineTable\s*\(/.test(appSchemaSource)) {
  throw new Error('app schema must keep product state in oauthProjects')
}
for (const tableName of [
  'user',
  'session',
  'organization',
  'member',
  'oauthClient',
  'oauthRefreshToken',
  'oauthAccessToken',
  'oauthConsent',
]) {
  if (new RegExp(`\\b${tableName}\\s*:\\s*defineTable\\s*\\(`).test(appSchemaSource)) {
    throw new Error(`app schema must not mirror Better Auth ${tableName} state`)
  }
}
console.log(JSON.stringify({ oauthProvider: deps['@better-auth/oauth-provider'], schema: 'current' }, null, 2))
NODE

echo "== OAuth Provider authorization server metadata"
metadata=$(curl -sS "$convex_site_url/api/auth/.well-known/oauth-authorization-server")
echo "$metadata"
authorization_endpoint=$(printf '%s' "$metadata" | json_field ".authorization_endpoint")
token_endpoint=$(printf '%s' "$metadata" | json_field ".token_endpoint")
introspection_endpoint=$(printf '%s' "$metadata" | json_field ".introspection_endpoint")
revocation_endpoint=$(printf '%s' "$metadata" | json_field ".revocation_endpoint")
registration_endpoint=$(printf '%s' "$metadata" | json_field ".registration_endpoint")
jwks_uri=$(printf '%s' "$metadata" | json_field ".jwks_uri")
if [[ "$authorization_endpoint" != "$site_url/api/auth/oauth2/authorize" ]]; then
  echo "unexpected authorization endpoint: $authorization_endpoint" >&2
  exit 1
fi
if [[ "$token_endpoint" != "$site_url/api/auth/oauth2/token" ]]; then
  echo "unexpected token endpoint: $token_endpoint" >&2
  exit 1
fi
if [[ "$introspection_endpoint" != "$site_url/api/auth/oauth2/introspect" ]]; then
  echo "unexpected introspection endpoint: $introspection_endpoint" >&2
  exit 1
fi
if [[ "$revocation_endpoint" != "$site_url/api/auth/oauth2/revoke" ]]; then
  echo "unexpected revocation endpoint: $revocation_endpoint" >&2
  exit 1
fi
if [[ "$registration_endpoint" != "$site_url/api/auth/oauth2/register" ]]; then
  echo "unexpected registration endpoint: $registration_endpoint" >&2
  exit 1
fi
if [[ "$jwks_uri" != "$site_url/api/auth/jwks" ]]; then
  echo "unexpected jwks uri: $jwks_uri" >&2
  exit 1
fi

echo "== unauthenticated dynamic client registration is rejected"
unauth_response=$(curl -sS -w '\n%{http_code}' -X POST "$convex_site_url/api/auth/oauth2/register" \
  -H 'Content-Type: application/json' \
  -H "Origin: $site_url" \
  --data "{\"client_name\":\"Unauth Client\",\"redirect_uris\":[\"$redirect_uri\"],\"grant_types\":[\"authorization_code\"],\"response_types\":[\"code\"],\"scope\":\"openid profile\"}")
unauth_status="$(printf '%s' "$unauth_response" | tail -n 1)"
printf '%s\n' "$(printf '%s' "$unauth_response" | sed '$d')"
if [[ "$unauth_status" != "401" ]]; then
  echo "expected unauthenticated dynamic registration to return 401, got $unauth_status" >&2
  exit 1
fi

echo "== unauthenticated client_credentials registration is rejected"
unauth_client_credentials_response=$(curl -sS -w '\n%{http_code}' -X POST "$convex_site_url/api/auth/oauth2/register" \
  -H 'Content-Type: application/json' \
  -H "Origin: $site_url" \
  --data "{\"client_name\":\"Unauth M2M Client\",\"redirect_uris\":[\"$redirect_uri\"],\"grant_types\":[\"client_credentials\"],\"response_types\":[],\"scope\":\"project:create\",\"token_endpoint_auth_method\":\"client_secret_post\"}")
unauth_client_credentials_status="$(printf '%s' "$unauth_client_credentials_response" | tail -n 1)"
printf '%s\n' "$(printf '%s' "$unauth_client_credentials_response" | sed '$d')"
if [[ "$unauth_client_credentials_status" != "401" ]]; then
  echo "expected unauthenticated client_credentials registration to return 401, got $unauth_client_credentials_status" >&2
  exit 1
fi

echo "== sign up platform user"
signup=$(request_json POST /api/auth/sign-up/email \
  "{\"name\":\"Platform OAuth User\",\"email\":\"$email\",\"password\":\"$password\"}" \
  200)
echo "$signup"
user_id=$(printf '%s' "$signup" | json_field ".user.id")

echo "== authenticated dynamic client registration"
registered=$(request_json POST /api/auth/oauth2/register \
  "{\"client_name\":\"Platform OAuth Client\",\"redirect_uris\":[\"$redirect_uri\"],\"grant_types\":[\"authorization_code\",\"refresh_token\"],\"response_types\":[\"code\"],\"scope\":\"openid profile email offline_access project:create\",\"token_endpoint_auth_method\":\"client_secret_post\",\"metadata\":{\"source\":\"platform-auth-proof\"}}" \
  200)
echo "$registered"
client_id=$(printf '%s' "$registered" | json_field ".client_id")
client_secret=$(printf '%s' "$registered" | json_field ".client_secret")
if [[ "$client_secret" != bcn_cs_* ]]; then
  echo "expected prefixed client secret, got $client_secret" >&2
  exit 1
fi
pkce=$(node - <<'NODE'
const crypto = require('node:crypto')
const verifier = crypto.randomBytes(48).toString('base64url')
const challenge = crypto.createHash('sha256').update(verifier).digest('base64url')
process.stdout.write(`${verifier}\n${challenge}`)
NODE
)
code_verifier="$(printf '%s' "$pkce" | sed -n '1p')"
code_challenge="$(printf '%s' "$pkce" | sed -n '2p')"

echo "== authorize and request consent"
authorize_status=$(curl -sS -o "$body_file" -D "$headers_file" -w '%{http_code}' -G \
  "$convex_site_url/api/auth/oauth2/authorize" \
  -H "Origin: $site_url" \
  -b "$cookie_jar" \
  -c "$cookie_jar" \
  --data-urlencode "response_type=code" \
  --data-urlencode "client_id=$client_id" \
  --data-urlencode "redirect_uri=$redirect_uri" \
  --data-urlencode "scope=openid profile email offline_access project:create" \
  --data-urlencode "code_challenge=$code_challenge" \
  --data-urlencode "code_challenge_method=S256" \
  --data-urlencode "prompt=consent" \
  --data-urlencode "state=platform-state-$stamp")
cat "$headers_file"
cat "$body_file"
printf '\n'
if [[ "$authorize_status" != "302" ]]; then
  echo "expected authorize to redirect to consent page, got $authorize_status" >&2
  exit 1
fi
location=$(awk 'BEGIN{IGNORECASE=1} /^location:/ {sub(/\r$/, "", $0); print substr($0, index($0, " ")+1)}' "$headers_file" | tail -n 1)
oauth_query=$(node -e "const url = new URL(process.argv[1], '$site_url'); process.stdout.write(url.search.slice(1))" "$location")
if [[ -z "$oauth_query" ]]; then
  echo "missing signed oauth query in consent redirect: $location" >&2
  exit 1
fi

echo "== accept OAuth Provider consent"
consent_response=$(request_json POST /api/auth/oauth2/consent \
  "{\"accept\":true,\"oauth_query\":\"$oauth_query\"}" \
  200)
echo "$consent_response"
redirect_with_code=$(printf '%s' "$consent_response" | json_field ".url")
code=$(node -e "const url = new URL(process.argv[1]); process.stdout.write(url.searchParams.get('code') || '')" "$redirect_with_code")
state=$(node -e "const url = new URL(process.argv[1]); process.stdout.write(url.searchParams.get('state') || '')" "$redirect_with_code")
issuer=$(node -e "const url = new URL(process.argv[1]); process.stdout.write(url.searchParams.get('iss') || '')" "$redirect_with_code")
if [[ -z "$code" ]]; then
  echo "missing authorization code in consent response: $consent_response" >&2
  exit 1
fi
if [[ "$state" != "platform-state-$stamp" ]]; then
  echo "unexpected state: $state" >&2
  exit 1
fi
if [[ "$issuer" != "$site_url/api/auth" ]]; then
  echo "unexpected issuer: $issuer" >&2
  exit 1
fi

echo "== exchange authorization code for tokens"
token_response=$(curl -sS -w '\n%{http_code}' -X POST "$convex_site_url/api/auth/oauth2/token" \
  -H 'Content-Type: application/x-www-form-urlencoded' \
  -H "Origin: $site_url" \
  --data-urlencode "grant_type=authorization_code" \
  --data-urlencode "code=$code" \
  --data-urlencode "client_id=$client_id" \
  --data-urlencode "client_secret=$client_secret" \
  --data-urlencode "code_verifier=$code_verifier" \
  --data-urlencode "redirect_uri=$redirect_uri")
token_status="$(printf '%s' "$token_response" | tail -n 1)"
token_payload="$(printf '%s' "$token_response" | sed '$d')"
echo "$token_payload"
if [[ "$token_status" != "200" ]]; then
  echo "token exchange failed: $token_status" >&2
  exit 1
fi
access_token=$(printf '%s' "$token_payload" | json_field ".access_token")
refresh_token=$(printf '%s' "$token_payload" | json_field ".refresh_token")
id_token=$(printf '%s' "$token_payload" | json_field ".id_token")
if [[ -z "$access_token" || "$access_token" == "null" ]]; then
  echo "missing access token" >&2
  exit 1
fi
if [[ -z "$refresh_token" || "$refresh_token" == "null" ]]; then
  echo "missing refresh token" >&2
  exit 1
fi
if [[ -z "$id_token" || "$id_token" == "null" ]]; then
  echo "missing id token" >&2
  exit 1
fi

echo "== inspect client state before refresh"
node --input-type=module - "$client_id" <<'NODE'
import { ConvexHttpClient } from 'convex/browser'
import { api } from './convex/_generated/api.js'

const [clientId] = process.argv.slice(2)
const client = new ConvexHttpClient('http://127.0.0.1:3210')
const state = await client.query(api.oauthProof.inspectClientState, { clientId })
console.log(JSON.stringify(state, null, 2))
NODE

echo "== userinfo validates access token"
userinfo=$(curl -sS -H "Authorization: Bearer $access_token" "$convex_site_url/api/auth/oauth2/userinfo")
echo "$userinfo"
userinfo_sub=$(printf '%s' "$userinfo" | json_field ".sub")
if [[ "$userinfo_sub" != "$user_id" ]]; then
  echo "userinfo sub mismatch: $userinfo_sub != $user_id" >&2
  exit 1
fi

echo "== introspection reports active access token"
introspection=$(curl -sS -X POST "$convex_site_url/api/auth/oauth2/introspect" \
  -H 'Content-Type: application/x-www-form-urlencoded' \
  -u "$client_id:$client_secret" \
  --data-urlencode "token=$access_token" \
  --data-urlencode "token_type_hint=access_token")
echo "$introspection"
active=$(printf '%s' "$introspection" | json_field ".active")
if [[ "$active" != "true" ]]; then
  echo "expected active introspection, got $introspection" >&2
  exit 1
fi

echo "== authenticated client_credentials registration"
m2m_registered=$(request_json POST /api/auth/oauth2/register \
  "{\"client_name\":\"Platform M2M OAuth Client\",\"redirect_uris\":[\"$redirect_uri\"],\"grant_types\":[\"client_credentials\"],\"response_types\":[],\"scope\":\"project:create\",\"token_endpoint_auth_method\":\"client_secret_post\",\"metadata\":{\"source\":\"platform-auth-m2m-proof\"}}" \
  200)
echo "$m2m_registered"
m2m_client_id=$(printf '%s' "$m2m_registered" | json_field ".client_id")
m2m_client_secret=$(printf '%s' "$m2m_registered" | json_field ".client_secret")
m2m_scope=$(printf '%s' "$m2m_registered" | json_field ".scope")
if [[ "$m2m_client_secret" != bcn_cs_* ]]; then
  echo "expected prefixed m2m client secret, got $m2m_client_secret" >&2
  exit 1
fi
if [[ "$m2m_scope" != "project:create" ]]; then
  echo "expected m2m client scope project:create, got $m2m_scope" >&2
  exit 1
fi

echo "== invalid resource is rejected for client_credentials"
invalid_resource_response=$(curl -sS -w '\n%{http_code}' -X POST "$convex_site_url/api/auth/oauth2/token" \
  -H 'Content-Type: application/x-www-form-urlencoded' \
  -u "$m2m_client_id:$m2m_client_secret" \
  --data-urlencode "grant_type=client_credentials" \
  --data-urlencode "scope=project:create" \
  --data-urlencode "resource=$site_url/not-mcp")
invalid_resource_status="$(printf '%s' "$invalid_resource_response" | tail -n 1)"
invalid_resource_payload="$(printf '%s' "$invalid_resource_response" | sed '$d')"
echo "$invalid_resource_payload"
if [[ "$invalid_resource_status" != "400" ]]; then
  echo "expected invalid resource to return 400, got $invalid_resource_status" >&2
  exit 1
fi
invalid_resource_error=$(printf '%s' "$invalid_resource_payload" | json_field ".error")
if [[ "$invalid_resource_error" != "invalid_request" ]]; then
  echo "unexpected invalid resource response: $invalid_resource_payload" >&2
  exit 1
fi

echo "== client_credentials returns resource-bound JWT access token"
m2m_token_response=$(curl -sS -w '\n%{http_code}' -X POST "$convex_site_url/api/auth/oauth2/token" \
  -H 'Content-Type: application/x-www-form-urlencoded' \
  -u "$m2m_client_id:$m2m_client_secret" \
  --data-urlencode "grant_type=client_credentials" \
  --data-urlencode "scope=project:create" \
  --data-urlencode "resource=$site_url/mcp")
m2m_token_status="$(printf '%s' "$m2m_token_response" | tail -n 1)"
m2m_token_payload="$(printf '%s' "$m2m_token_response" | sed '$d')"
echo "$m2m_token_payload"
if [[ "$m2m_token_status" != "200" ]]; then
  echo "client_credentials token exchange failed: $m2m_token_status" >&2
  exit 1
fi
m2m_access_token=$(printf '%s' "$m2m_token_payload" | json_field ".access_token")
m2m_refresh_token=$(printf '%s' "$m2m_token_payload" | json_field ".refresh_token")
m2m_id_token=$(printf '%s' "$m2m_token_payload" | json_field ".id_token")
if [[ "$(awk -F. '{print NF}' <<< "$m2m_access_token")" != "3" ]]; then
  echo "expected resource-bound client_credentials access token to be a JWT" >&2
  exit 1
fi
if [[ -n "$m2m_refresh_token" || -n "$m2m_id_token" ]]; then
  echo "client_credentials should not return refresh or id tokens: $m2m_token_payload" >&2
  exit 1
fi
SITE_URL="$site_url" TOKEN="$m2m_access_token" CLIENT_ID="$m2m_client_id" node --input-type=module <<'NODE'
const token = process.env.TOKEN
const clientId = process.env.CLIENT_ID
const siteUrl = process.env.SITE_URL
const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString())
if (payload.aud !== `${siteUrl}/mcp`) {
  throw new Error(`unexpected JWT audience ${payload.aud}`)
}
if (payload.iss !== `${siteUrl}/api/auth`) {
  throw new Error(`unexpected JWT issuer ${payload.iss}`)
}
if (payload.azp !== clientId) {
  throw new Error(`unexpected JWT azp ${payload.azp}`)
}
if (payload.scope !== 'project:create') {
  throw new Error(`unexpected JWT scope ${payload.scope}`)
}
console.log(JSON.stringify({ aud: payload.aud, iss: payload.iss, azp: payload.azp, scope: payload.scope }, null, 2))
NODE

echo "== resource client verifies JWT through introspection"
SITE_URL="$site_url" TOKEN="$m2m_access_token" CLIENT_ID="$m2m_client_id" CLIENT_SECRET="$m2m_client_secret" node --input-type=module <<'NODE'
import { oauthProviderResourceClient } from '@better-auth/oauth-provider/resource-client'

const siteUrl = process.env.SITE_URL
const plugin = oauthProviderResourceClient()
const actions = plugin.getActions()
const metadata = await actions.getProtectedResourceMetadata({
  resource: `${siteUrl}/mcp`,
  authorization_servers: [`${siteUrl}/api/auth`],
  scopes_supported: ['project:create'],
}, { externalScopes: ['project:create'] })
const verified = await actions.verifyAccessToken(process.env.TOKEN, {
  verifyOptions: {
    audience: `${siteUrl}/mcp`,
    issuer: `${siteUrl}/api/auth`,
  },
  remoteVerify: {
    clientId: process.env.CLIENT_ID,
    clientSecret: process.env.CLIENT_SECRET,
    introspectUrl: 'http://127.0.0.1:3211/api/auth/oauth2/introspect',
  },
})
if (metadata.resource !== `${siteUrl}/mcp`) {
  throw new Error(`unexpected protected resource ${metadata.resource}`)
}
if (verified.active !== true) {
  throw new Error(`expected active verified token: ${JSON.stringify(verified)}`)
}
if (verified.client_id !== process.env.CLIENT_ID) {
  throw new Error(`unexpected verified client ${verified.client_id}`)
}
if (verified.scope !== 'project:create') {
  throw new Error(`unexpected verified scope ${verified.scope}`)
}
console.log(JSON.stringify({ metadata, verified }, null, 2))
NODE

echo "== mounted JWKS endpoint matches advertised OAuth Provider path"
jwks_status=$(curl -sS -o "$body_file" -w '%{http_code}' "$convex_site_url/api/auth/jwks")
cat "$body_file"
printf '\n'
if [[ "$jwks_status" != "200" ]]; then
  echo "expected mounted JWKS route to return 200, got $jwks_status" >&2
  exit 1
fi
jwks_key_count=$(node -e "let input = ''; process.stdin.on('data', d => input += d); process.stdin.on('end', () => process.stdout.write(String(JSON.parse(input).keys?.length ?? 0)))" < "$body_file")
if [[ "$jwks_key_count" == "0" ]]; then
  echo "expected mounted JWKS route to return at least one key" >&2
  exit 1
fi

echo "== resource client verifies JWT through local JWKS"
SITE_URL="$site_url" TOKEN="$m2m_access_token" CLIENT_ID="$m2m_client_id" node --input-type=module <<'NODE'
import { oauthProviderResourceClient } from '@better-auth/oauth-provider/resource-client'

const siteUrl = process.env.SITE_URL
const plugin = oauthProviderResourceClient()
const actions = plugin.getActions()
const verified = await actions.verifyAccessToken(process.env.TOKEN, {
  jwksUrl: 'http://127.0.0.1:3211/api/auth/jwks',
  verifyOptions: {
    audience: `${siteUrl}/mcp`,
    issuer: `${siteUrl}/api/auth`,
  },
})
if (verified.aud !== `${siteUrl}/mcp`) {
  throw new Error(`unexpected verified aud ${verified.aud}`)
}
if (verified.azp !== process.env.CLIENT_ID) {
  throw new Error(`unexpected verified azp ${verified.azp}`)
}
if (verified.scope !== 'project:create') {
  throw new Error(`unexpected verified scope ${verified.scope}`)
}
console.log(JSON.stringify({ aud: verified.aud, iss: verified.iss, azp: verified.azp, scope: verified.scope }, null, 2))
NODE

echo "== protected resource metadata is mounted for MCP discovery"
protected_resource_metadata=$(curl -sS "$convex_site_url/.well-known/oauth-protected-resource/mcp")
echo "$protected_resource_metadata"
protected_resource=$(printf '%s' "$protected_resource_metadata" | json_field ".resource")
protected_resource_auth_server=$(node -e "let input = ''; process.stdin.on('data', d => input += d); process.stdin.on('end', () => process.stdout.write(JSON.parse(input).authorization_servers?.[0] ?? ''))" <<< "$protected_resource_metadata")
protected_resource_scope=$(node -e "let input = ''; process.stdin.on('data', d => input += d); process.stdin.on('end', () => process.stdout.write(JSON.parse(input).scopes_supported?.[0] ?? ''))" <<< "$protected_resource_metadata")
if [[ "$protected_resource" != "$site_url/mcp" ]]; then
  echo "unexpected protected resource metadata resource: $protected_resource" >&2
  exit 1
fi
if [[ "$protected_resource_auth_server" != "$site_url/api/auth" ]]; then
  echo "unexpected protected resource authorization server: $protected_resource_auth_server" >&2
  exit 1
fi
if [[ "$protected_resource_scope" != "project:create" ]]; then
  echo "unexpected protected resource scope: $protected_resource_scope" >&2
  exit 1
fi

echo "== OAuth Provider MCP handler gates protected tool execution"
SITE_URL="$site_url" TOKEN="$m2m_access_token" CLIENT_ID="$m2m_client_id" node --input-type=module <<'NODE'
import { mcpHandler } from '@better-auth/oauth-provider'

const siteUrl = process.env.SITE_URL
const token = process.env.TOKEN
const clientId = process.env.CLIENT_ID
let toolCallCount = 0

const makeHandler = (scopes = ['project:create']) => mcpHandler({
  jwksUrl: 'http://127.0.0.1:3211/api/auth/jwks',
  verifyOptions: {
    audience: `${siteUrl}/mcp`,
    issuer: `${siteUrl}/api/auth`,
  },
  scopes,
}, async (request, jwt) => {
  toolCallCount += 1
  const body = await request.json()
  if (body.method !== 'tools/call' || body.params?.name !== 'projects.create') {
    return Response.json({ jsonrpc: '2.0', id: body.id ?? null, error: { code: -32601, message: 'Unknown tool' } }, { status: 404 })
  }

  return Response.json({
    jsonrpc: '2.0',
    id: body.id,
    result: {
      content: [{
        type: 'text',
        text: JSON.stringify({
          actorKind: 'oauthClient',
          clientId: jwt.azp,
          audience: jwt.aud,
          scope: jwt.scope,
          toolName: body.params.name,
        }),
      }],
    },
  })
}, { resourceMetadataMappings: {} })

const toolRequest = (headers = {}) => new Request(`${siteUrl}/mcp`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    ...headers,
  },
  body: JSON.stringify({
    jsonrpc: '2.0',
    id: 1,
    method: 'tools/call',
    params: {
      name: 'projects.create',
      arguments: {
        title: 'OAuth-backed MCP project',
      },
    },
  }),
})

const handler = makeHandler()
const accepted = await handler(toolRequest({ Authorization: `Bearer ${token}` }))
if (accepted.status !== 200) {
  throw new Error(`expected protected MCP tool call to pass, got ${accepted.status}: ${await accepted.text()}`)
}
const acceptedBody = await accepted.json()
const acceptedResult = JSON.parse(acceptedBody.result.content[0].text)
if (acceptedResult.clientId !== clientId) {
  throw new Error(`expected OAuth client actor ${clientId}, got ${acceptedResult.clientId}`)
}
if (acceptedResult.audience !== `${siteUrl}/mcp`) {
  throw new Error(`unexpected protected resource audience ${acceptedResult.audience}`)
}
if (acceptedResult.scope !== 'project:create') {
  throw new Error(`unexpected MCP scope ${acceptedResult.scope}`)
}

const missingAuth = await handler(toolRequest())
if (missingAuth.status !== 401) {
  throw new Error(`expected missing auth to return 401, got ${missingAuth.status}`)
}
const challenge = missingAuth.headers.get('www-authenticate') ?? ''
if (!challenge.includes('/.well-known/oauth-protected-resource/mcp')) {
  throw new Error(`expected MCP protected-resource challenge, got ${challenge}`)
}

const scopeCheckedHandler = makeHandler(['project:delete'])
const beforeDenied = toolCallCount
const denied = await scopeCheckedHandler(toolRequest({ Authorization: `Bearer ${token}` }))
if (denied.status !== 403) {
  throw new Error(`expected insufficient scope to return 403, got ${denied.status}: ${await denied.text()}`)
}
if (toolCallCount !== beforeDenied) {
  throw new Error('tool handler ran despite insufficient OAuth scope')
}

console.log(JSON.stringify({
  acceptedToolActor: acceptedResult,
  missingAuthStatus: missingAuth.status,
  missingAuthChallenge: challenge,
  insufficientScopeStatus: denied.status,
  toolCallCount,
}, null, 2))
NODE

echo "== Convex MCP route writes product state through verified OAuth client"
mcp_payload='{"jsonrpc":"2.0","id":101,"method":"tools/call","params":{"name":"projects.create","arguments":{"title":"  OAuth-backed MCP project  ","projectId":"spoofed-project-id","createdByOAuthClientId":"attacker-client-id"}}}'
mcp_response=$(curl -sS -w '\n%{http_code}' -X POST "$convex_site_url/mcp" \
  -H 'Content-Type: application/json' \
  -H "Authorization: Bearer $m2m_access_token" \
  --data "$mcp_payload")
mcp_status="$(printf '%s' "$mcp_response" | tail -n 1)"
mcp_body="$(printf '%s' "$mcp_response" | sed '$d')"
echo "$mcp_body"
if [[ "$mcp_status" != "200" ]]; then
  echo "expected Convex MCP product route to return 200, got $mcp_status" >&2
  exit 1
fi
mcp_project_id=$(node -e "let input = ''; process.stdin.on('data', d => input += d); process.stdin.on('end', () => { const body = JSON.parse(input); const payload = JSON.parse(body.result.content[0].text); process.stdout.write(payload.projectId || '') })" <<< "$mcp_body")
if [[ -z "$mcp_project_id" ]]; then
  echo "missing project id from Convex MCP product route" >&2
  exit 1
fi
node --input-type=module - "$m2m_client_id" "$mcp_project_id" <<'NODE'
import { ConvexHttpClient } from 'convex/browser'
import { api } from './convex/_generated/api.js'

const [clientId, projectId] = process.argv.slice(2)
const client = new ConvexHttpClient('http://127.0.0.1:3210')
const projects = await client.query(api.oauthMcpProof.listProjectsForOAuthClient, { clientId })
if (projects.length !== 1) {
  throw new Error(`expected one OAuth-created project, got ${projects.length}`)
}
const project = projects[0]
if (project._id !== projectId) {
  throw new Error(`unexpected project id ${project._id} != ${projectId}`)
}
if (project.createdByOAuthClientId !== clientId) {
  throw new Error(`unexpected project actor ${project.createdByOAuthClientId}`)
}
if (project.title !== 'OAuth-backed MCP project') {
  throw new Error(`expected normalized project title, got ${project.title}`)
}
console.log(JSON.stringify({
  projectId: project._id,
  title: project.title,
  createdByOAuthClientId: project.createdByOAuthClientId,
}, null, 2))
NODE

echo "== invalid MCP product title does not create product state"
long_title=$(node -e "process.stdout.write('x'.repeat(121))")
invalid_title_payload=$(node -e "process.stdout.write(JSON.stringify({jsonrpc:'2.0',id:103,method:'tools/call',params:{name:'projects.create',arguments:{title:process.argv[1]}}}))" "$long_title")
invalid_title_response=$(curl -sS -w '\n%{http_code}' -X POST "$convex_site_url/mcp" \
  -H 'Content-Type: application/json' \
  -H "Authorization: Bearer $m2m_access_token" \
  --data "$invalid_title_payload")
invalid_title_status="$(printf '%s' "$invalid_title_response" | tail -n 1)"
invalid_title_body="$(printf '%s' "$invalid_title_response" | sed '$d')"
echo "$invalid_title_body"
if [[ "$invalid_title_status" != "400" ]]; then
  echo "expected invalid MCP product title to return 400, got $invalid_title_status" >&2
  exit 1
fi
invalid_title_error=$(printf '%s' "$invalid_title_body" | json_field ".error.message")
if [[ "$invalid_title_error" != "Invalid project title" ]]; then
  echo "unexpected invalid MCP title error: $invalid_title_body" >&2
  exit 1
fi
node --input-type=module - "$m2m_client_id" <<'NODE'
import { ConvexHttpClient } from 'convex/browser'
import { api } from './convex/_generated/api.js'

const [clientId] = process.argv.slice(2)
const client = new ConvexHttpClient('http://127.0.0.1:3210')
const projects = await client.query(api.oauthMcpProof.listProjectsForOAuthClient, { clientId })
if (projects.length !== 1) {
  throw new Error(`invalid MCP title should not create another project, got ${projects.length}`)
}
console.log(JSON.stringify({ projectsAfterInvalidTitle: projects.length }, null, 2))
NODE

echo "== unknown MCP tool does not create product state"
unknown_mcp_payload='{"jsonrpc":"2.0","id":102,"method":"tools/call","params":{"name":"projects.archive","arguments":{"title":"Should not write"}}}'
unknown_mcp_response=$(curl -sS -w '\n%{http_code}' -X POST "$convex_site_url/mcp" \
  -H 'Content-Type: application/json' \
  -H "Authorization: Bearer $m2m_access_token" \
  --data "$unknown_mcp_payload")
unknown_mcp_status="$(printf '%s' "$unknown_mcp_response" | tail -n 1)"
unknown_mcp_body="$(printf '%s' "$unknown_mcp_response" | sed '$d')"
echo "$unknown_mcp_body"
if [[ "$unknown_mcp_status" != "404" ]]; then
  echo "expected unknown MCP tool to return 404, got $unknown_mcp_status" >&2
  exit 1
fi
unknown_mcp_error=$(printf '%s' "$unknown_mcp_body" | json_field ".error.message")
if [[ "$unknown_mcp_error" != "Unknown tool" ]]; then
  echo "unexpected unknown MCP tool error: $unknown_mcp_body" >&2
  exit 1
fi
node --input-type=module - "$m2m_client_id" <<'NODE'
import { ConvexHttpClient } from 'convex/browser'
import { api } from './convex/_generated/api.js'

const [clientId] = process.argv.slice(2)
const client = new ConvexHttpClient('http://127.0.0.1:3210')
const projects = await client.query(api.oauthMcpProof.listProjectsForOAuthClient, { clientId })
if (projects.length !== 1) {
  throw new Error(`unknown MCP tool should not create another project, got ${projects.length}`)
}
console.log(JSON.stringify({ projectsAfterUnknownToolCall: projects.length }, null, 2))
NODE

echo "== disabled OAuth client cannot use still-valid JWT for product write"
node --input-type=module - "$m2m_client_id" <<'NODE'
import { ConvexHttpClient } from 'convex/browser'
import { api } from './convex/_generated/api.js'

const [clientId] = process.argv.slice(2)
const client = new ConvexHttpClient('http://127.0.0.1:3210')
await client.mutation(api.oauthProof.setClientDisabledForProof, {
  clientId,
  disabled: true,
})
const state = await client.query(api.oauthProof.inspectClientState, { clientId })
const oauthClient = state.clients.page[0]
if (oauthClient?.disabled !== true) {
  throw new Error(`expected OAuth client to be disabled, got ${oauthClient?.disabled}`)
}
console.log(JSON.stringify({ clientId, disabled: oauthClient.disabled }, null, 2))
NODE
disabled_mcp_response=$(curl -sS -w '\n%{http_code}' -X POST "$convex_site_url/mcp" \
  -H 'Content-Type: application/json' \
  -H "Authorization: Bearer $m2m_access_token" \
  --data "$mcp_payload")
disabled_mcp_status="$(printf '%s' "$disabled_mcp_response" | tail -n 1)"
disabled_mcp_body="$(printf '%s' "$disabled_mcp_response" | sed '$d')"
echo "$disabled_mcp_body"
if [[ "$disabled_mcp_status" != "403" ]]; then
  echo "expected disabled OAuth client product route to return 403, got $disabled_mcp_status" >&2
  exit 1
fi
disabled_mcp_error=$(printf '%s' "$disabled_mcp_body" | json_field ".error.message")
if [[ "$disabled_mcp_error" != "OAuth client is disabled" ]]; then
  echo "unexpected disabled OAuth client error: $disabled_mcp_body" >&2
  exit 1
fi
node --input-type=module - "$m2m_client_id" <<'NODE'
import { ConvexHttpClient } from 'convex/browser'
import { api } from './convex/_generated/api.js'

const [clientId] = process.argv.slice(2)
const client = new ConvexHttpClient('http://127.0.0.1:3210')
const projects = await client.query(api.oauthMcpProof.listProjectsForOAuthClient, { clientId })
if (projects.length !== 1) {
  throw new Error(`disabled client should not create another project, got ${projects.length}`)
}
console.log(JSON.stringify({ projectsAfterDisabledClientCall: projects.length }, null, 2))
NODE

echo "== refresh token rotation exposes Convex null-vs-absent limitation"
refresh_response=$(curl -sS -w '\n%{http_code}' -X POST "$convex_site_url/api/auth/oauth2/token" \
  -H 'Content-Type: application/x-www-form-urlencoded' \
  -H "Origin: $site_url" \
  --data-urlencode "grant_type=refresh_token" \
  --data-urlencode "client_id=$client_id" \
  --data-urlencode "client_secret=$client_secret" \
  --data-urlencode "refresh_token=$refresh_token")
refresh_status="$(printf '%s' "$refresh_response" | tail -n 1)"
refresh_payload="$(printf '%s' "$refresh_response" | sed '$d')"
echo "$refresh_payload"
if [[ "$refresh_status" != "400" ]]; then
  echo "expected pinned OAuth Provider refresh rotation to fail with 400, got $refresh_status" >&2
  exit 1
fi
refresh_error=$(printf '%s' "$refresh_payload" | json_field ".error")
refresh_error_description=$(printf '%s' "$refresh_payload" | json_field ".error_description")
if [[ "$refresh_error" != "invalid_grant" || "$refresh_error_description" != "invalid refresh token" ]]; then
  echo "unexpected refresh failure: $refresh_payload" >&2
  exit 1
fi
node --input-type=module - "$client_id" <<'NODE'
import { ConvexHttpClient } from 'convex/browser'
import { api } from './convex/_generated/api.js'

const [clientId] = process.argv.slice(2)
const client = new ConvexHttpClient('http://127.0.0.1:3210')
const state = await client.query(api.oauthProof.inspectClientState, { clientId })
const refreshToken = state.refreshTokens.page[0]
if (!refreshToken) {
  throw new Error('missing refresh token row after failed rotation')
}
if ('revoked' in refreshToken) {
  throw new Error(`expected created refresh token row to omit revoked, got ${refreshToken.revoked}`)
}
if (refreshToken.expiresAt <= Date.now()) {
  throw new Error(`expected refresh token to be unexpired, got ${refreshToken.expiresAt}`)
}
console.log(JSON.stringify({
  refreshTokenRows: state.refreshTokens.page.length,
  revokedField: 'absent',
  expiresAt: refreshToken.expiresAt,
}, null, 2))
NODE

echo "== explicit null revoked value makes refresh rotation succeed"
node --input-type=module - "$client_id" <<'NODE'
import { ConvexHttpClient } from 'convex/browser'
import { api } from './convex/_generated/api.js'

const [clientId] = process.argv.slice(2)
const client = new ConvexHttpClient('http://127.0.0.1:3210')
const state = await client.query(api.oauthProof.inspectClientState, { clientId })
const refreshToken = state.refreshTokens.page[0]
if (!refreshToken?._id) {
  throw new Error('missing refresh token id before null revoked proof')
}
await client.mutation(api.oauthProof.setRefreshRevokedNullForProof, {
  refreshTokenId: refreshToken._id,
})
const afterUpdate = await client.query(api.oauthProof.inspectClientState, { clientId })
const updatedRefreshToken = afterUpdate.refreshTokens.page.find((token) => token._id === refreshToken._id)
if (!updatedRefreshToken) {
  throw new Error('missing refresh token after null revoked proof mutation')
}
if (!('revoked' in updatedRefreshToken) || updatedRefreshToken.revoked !== null) {
  throw new Error(`expected refresh token revoked to be explicit null, got ${updatedRefreshToken.revoked}`)
}
console.log(JSON.stringify({ refreshTokenId: refreshToken._id, revokedField: null }, null, 2))
NODE
refresh_after_null_response=$(curl -sS -w '\n%{http_code}' -X POST "$convex_site_url/api/auth/oauth2/token" \
  -H 'Content-Type: application/x-www-form-urlencoded' \
  -H "Origin: $site_url" \
  --data-urlencode "grant_type=refresh_token" \
  --data-urlencode "client_id=$client_id" \
  --data-urlencode "client_secret=$client_secret" \
  --data-urlencode "refresh_token=$refresh_token")
refresh_after_null_status="$(printf '%s' "$refresh_after_null_response" | tail -n 1)"
refresh_after_null_payload="$(printf '%s' "$refresh_after_null_response" | sed '$d')"
echo "$refresh_after_null_payload"
if [[ "$refresh_after_null_status" != "200" ]]; then
  echo "expected refresh grant to pass after explicit revoked null, got $refresh_after_null_status" >&2
  exit 1
fi
rotated_refresh_token=$(printf '%s' "$refresh_after_null_payload" | json_field ".refresh_token")
rotated_access_token=$(printf '%s' "$refresh_after_null_payload" | json_field ".access_token")
if [[ -z "$rotated_refresh_token" || "$rotated_refresh_token" == "$refresh_token" ]]; then
  echo "expected rotated refresh token after explicit null, got $rotated_refresh_token" >&2
  exit 1
fi
if [[ -z "$rotated_access_token" || "$rotated_access_token" == "null" ]]; then
  echo "missing rotated access token after explicit null" >&2
  exit 1
fi
node --input-type=module - "$client_id" <<'NODE'
import { ConvexHttpClient } from 'convex/browser'
import { api } from './convex/_generated/api.js'

const [clientId] = process.argv.slice(2)
const client = new ConvexHttpClient('http://127.0.0.1:3210')
const state = await client.query(api.oauthProof.inspectClientState, { clientId })
const revokedRows = state.refreshTokens.page.filter((token) => 'revoked' in token && token.revoked !== null)
const activeRows = state.refreshTokens.page.filter((token) => !('revoked' in token))
if (revokedRows.length !== 1) {
  throw new Error(`expected one revoked old refresh token row, got ${revokedRows.length}`)
}
if (activeRows.length !== 1) {
  throw new Error(`expected one active new refresh token row without revoked, got ${activeRows.length}`)
}
console.log(JSON.stringify({
  refreshTokenRows: state.refreshTokens.page.length,
  revokedRows: revokedRows.length,
  activeRowsWithoutRevoked: activeRows.length,
}, null, 2))
NODE

echo "== revoke original access token"
revoke_status=$(curl -sS -o "$body_file" -w '%{http_code}' -X POST "$convex_site_url/api/auth/oauth2/revoke" \
  -H 'Content-Type: application/x-www-form-urlencoded' \
  -u "$client_id:$client_secret" \
  --data-urlencode "token=$access_token" \
  --data-urlencode "token_type_hint=access_token")
cat "$body_file"
printf '\n'
if [[ "$revoke_status" != "200" ]]; then
  echo "expected revocation status 200, got $revoke_status" >&2
  exit 1
fi

echo "== revoked access token no longer introspects"
revoked_introspection_response=$(curl -sS -w '\n%{http_code}' -X POST "$convex_site_url/api/auth/oauth2/introspect" \
  -H 'Content-Type: application/x-www-form-urlencoded' \
  -u "$client_id:$client_secret" \
  --data-urlencode "token=$access_token" \
  --data-urlencode "token_type_hint=access_token")
revoked_introspection_status="$(printf '%s' "$revoked_introspection_response" | tail -n 1)"
revoked_introspection_payload="$(printf '%s' "$revoked_introspection_response" | sed '$d')"
echo "$revoked_introspection_payload"
if [[ "$revoked_introspection_status" != "400" ]]; then
  echo "expected revoked access token introspection to return 400, got $revoked_introspection_status" >&2
  exit 1
fi
revoked_introspection_error=$(printf '%s' "$revoked_introspection_payload" | json_field ".error")
if [[ "$revoked_introspection_error" != "invalid_request" ]]; then
  echo "unexpected revoked token introspection response: $revoked_introspection_payload" >&2
  exit 1
fi

echo "current OAuth Provider mounted runtime proof passed with documented refresh-rotation gap"
