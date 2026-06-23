#!/usr/bin/env bash
set -euo pipefail

inspect_table() {
  local label="$1"
  local table="$2"
  shift
  shift

  echo "== $label"
  pnpm exec convex data "$table" "$@" --format json --limit 50
  echo
}

inspect_table "app users" users
inspect_table "app projects" projects
inspect_table "app auditEvents" auditEvents
inspect_table "betterAuth user" user --component betterAuth
inspect_table "betterAuth account" account --component betterAuth
inspect_table "betterAuth session" session --component betterAuth
inspect_table "betterAuth verification" verification --component betterAuth
inspect_table "betterAuth twoFactor" twoFactor --component betterAuth
inspect_table "betterAuth passkey" passkey --component betterAuth
inspect_table "betterAuth organization" organization --component betterAuth
inspect_table "betterAuth member" member --component betterAuth
inspect_table "betterAuth team" team --component betterAuth
inspect_table "betterAuth teamMember" teamMember --component betterAuth
inspect_table "betterAuth invitation" invitation --component betterAuth
inspect_table "betterAuth organizationRole" organizationRole --component betterAuth
inspect_table "betterAuth apikey" apikey --component betterAuth
inspect_table "betterAuth scimProvider" scimProvider --component betterAuth
inspect_table "betterAuth deviceCode" deviceCode --component betterAuth
inspect_table "betterAuth oauthApplication" oauthApplication --component betterAuth
inspect_table "betterAuth oauthAccessToken" oauthAccessToken --component betterAuth
inspect_table "betterAuth oauthConsent" oauthConsent --component betterAuth
inspect_table "betterAuth subscription" subscription --component betterAuth
