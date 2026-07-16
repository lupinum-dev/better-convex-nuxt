# Releasing Better Convex Nuxt

The release has one source artifact: the tarball produced from the clean,
merged `main` commit. Preparation never publishes to npm and never creates or
pushes a Git tag.

## Prepare a release

```bash
git switch main
git pull --ff-only origin main
pnpm install --frozen-lockfile
pnpm release:prepare
```

The command runs the security, test, contract, consumer, and maintained-app
gates; builds and packs once; then writes these ignored artifacts:

- the package tarball;
- a versioned content manifest;
- a versioned CycloneDX SBOM.

Keep the printed SHA-256 with the release evidence. Do not rebuild between
verification and publication.

## Publish the candidate

Confirm npm authentication and that the version is still unused:

```bash
VERSION="$(node -p "require('./package.json').version")"
npm whoami
npm view "better-convex-nuxt@$VERSION" version
```

The second command must report that the version does not exist. Publish the
verified tarball under the `next` dist-tag:

```bash
TARBALL=".release-artifacts/better-convex-nuxt-$VERSION.tgz"
npm publish "$TARBALL" --tag next
```

If npm requires one-time-password authentication, append `--otp <code>`.
Never publish the repository directory: npm would rerun lifecycle scripts and
produce bytes different from the verified tarball.

Create the tag on the same merged commit and create a GitHub prerelease using
the matching version section of `CHANGELOG.md`:

```bash
TAG="v$VERSION"
git tag -a "$TAG" -m "$TAG"
git push origin "$TAG"
gh release create "$TAG" \
  "$TARBALL" \
  ".release-artifacts/$TAG.manifest.json" \
  ".release-artifacts/$TAG.sbom.cdx.json" \
  --prerelease \
  --title "better-convex-nuxt $TAG" \
  --notes-file <(awk -v tag="$TAG" '$0 == "## " tag {found=1; next} found && /^## / {exit} found' CHANGELOG.md)
```

## Probe and promote

Install the exact version in candidate consumers; do not test through a moving
tag:

```bash
pnpm add "better-convex-nuxt@$VERSION"
pnpm why better-convex-nuxt
```

After the candidate deployments and coordinated downstream checks pass,
promote the already-published bytes without rebuilding:

```bash
npm dist-tag add "better-convex-nuxt@$VERSION" latest
gh release edit "$TAG" --prerelease=false
```

If candidate probing fails, leave `latest` unchanged and remove only the moving
candidate tag if necessary:

```bash
npm dist-tag rm better-convex-nuxt next
```

Do not unpublish a released version; fix forward with a new version.
