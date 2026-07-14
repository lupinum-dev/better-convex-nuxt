# Releasing Better Convex Nuxt

The release has one source artifact: the tarball produced from the clean,
merged `main` commit. Preparation never publishes to npm and never creates or
pushes a Git tag.

## Prepare `0.6.1`

```bash
git switch main
git pull --ff-only origin main
pnpm install --frozen-lockfile
pnpm release:prepare
```

The command runs the security, test, contract, consumer, and maintained-app
gates; builds and packs once; then writes these ignored artifacts:

- `.release-artifacts/better-convex-nuxt-0.6.1.tgz`
- `.release-artifacts/v0.6.1.manifest.json`
- `.release-artifacts/v0.6.1.sbom.cdx.json`

Keep the printed SHA-256 with the release evidence. Do not rebuild between
verification and publication.

## Publish the candidate

Confirm npm authentication and that the version is still unused:

```bash
npm whoami
npm view better-convex-nuxt@0.6.1 version
```

The second command must report that the version does not exist. Publish the
verified tarball under the `next` dist-tag:

```bash
npm publish .release-artifacts/better-convex-nuxt-0.6.1.tgz --tag next
```

If npm requires one-time-password authentication, append `--otp <code>`.
Never publish the repository directory: npm would rerun lifecycle scripts and
produce bytes different from the verified tarball.

Create the tag on the same merged commit and create a GitHub prerelease using
the `v0.6.1` section of `CHANGELOG.md`:

```bash
git tag -a v0.6.1 -m v0.6.1
git push origin v0.6.1
gh release create v0.6.1 \
  .release-artifacts/better-convex-nuxt-0.6.1.tgz \
  .release-artifacts/v0.6.1.manifest.json \
  .release-artifacts/v0.6.1.sbom.cdx.json \
  --prerelease \
  --title "better-convex-nuxt v0.6.1" \
  --notes-file <(sed -n '/^## v0.6.1$/,/^## v0.6.0$/p' CHANGELOG.md | sed '$d')
```

## Probe and promote

Install the exact version in candidate consumers; do not test through a moving
tag:

```bash
pnpm add better-convex-nuxt@0.6.1
pnpm why better-convex-nuxt
```

After the candidate deployments and coordinated downstream checks pass,
promote the already-published bytes without rebuilding:

```bash
npm dist-tag add better-convex-nuxt@0.6.1 latest
gh release edit v0.6.1 --prerelease=false
```

If candidate probing fails, leave `latest` unchanged and remove only the moving
candidate tag if necessary:

```bash
npm dist-tag rm better-convex-nuxt next
```

Do not unpublish `0.6.1`; fix forward with a new version.
