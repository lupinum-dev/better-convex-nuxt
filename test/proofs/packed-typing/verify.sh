#!/usr/bin/env bash
# §5.8 proof 1 release-gate runner. Single documented command sequence.
# Run from the repository root:  bash test/proofs/packed-typing/verify.sh
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
FIXTURE_DIR="$REPO_ROOT/test/proofs/packed-typing"
CONSUMER_DIR="$FIXTURE_DIR/consumer"

echo "== 1. Pack the current package =="
# Produces better-convex-nuxt-<version>.tgz in the fixture dir from the current
# dist (prepack rebuilds dist). The consumer package.json references it by name.
VERSION="$(node -p "require('$REPO_ROOT/package.json').version")"
rm -f "$FIXTURE_DIR"/*.tgz
( cd "$REPO_ROOT" && pnpm pack --pack-destination "$FIXTURE_DIR" >/dev/null )
TARBALL="$FIXTURE_DIR/better-convex-nuxt-$VERSION.tgz"
test -f "$TARBALL" || { echo "expected $TARBALL"; exit 1; }
# Keep the consumer dependency spec in sync with the packed version.
node -e "const fs=require('fs');const p='$CONSUMER_DIR/package.json';const j=JSON.parse(fs.readFileSync(p));j.devDependencies['better-convex-nuxt']='file:../better-convex-nuxt-$VERSION.tgz';fs.writeFileSync(p,JSON.stringify(j,null,2)+'\n')"

echo "== 2. Install the packed consumer (injects prototype /auth-client entry) =="
# The consumer has its own pnpm-workspace.yaml (isolated root), so the repo-root
# workspace overrides do not leak in and pnpm 11's build-scripts gate is honored.
( cd "$CONSUMER_DIR" && pnpm install )

echo "== 3a. Plugin case: nuxi prepare + nuxi typecheck (criteria a, c, d) =="
( cd "$CONSUMER_DIR" && ./node_modules/.bin/nuxi prepare && ./node_modules/.bin/nuxi typecheck )

echo "== 3b. Base fallback: separate TS program (criterion b) =="
( cd "$CONSUMER_DIR" && ./node_modules/.bin/tsc -p base-fallback/tsconfig.base-fallback.json )

echo "== 4. Two-builds-in-one-process + type-registry regeneration =="
( cd "$CONSUMER_DIR" && node scripts/two-build-hmr.mjs )

echo "== 5. Packed-output path/import scan =="
node "$FIXTURE_DIR/scan-packed-output.mjs" "$TARBALL"

echo "== 6. Ginko defu decision-12 proof =="
node "$FIXTURE_DIR/defu-merge-proof.mjs"

echo "ALL PACKED-TYPING PROOFS PASSED"
