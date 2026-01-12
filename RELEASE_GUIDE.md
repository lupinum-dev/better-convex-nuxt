# Release Guide: v0.2.0

## Current Situation

- **v0.2 branch**: Your new code with version `0.2.0` in package.json
- **main branch**: Old code at v0.1.8 (you want to discard this)
- **Fork point**: v0.2 branched from main at commit `a9441b3` (add verbose logging option)

## The Problem

The `release` script uses `changelogen --release` which auto-bumps the version. Since you already have `0.2.0` in package.json, this could cause version conflicts.

---

## Step-by-Step Release Process

### Step 1: Ensure v0.2 branch is clean

```bash
# Check current status
git status

# If you have uncommitted changes, commit them first
git add -A
git commit -m "chore: prepare for v0.2.0 release"
```

### Step 2: Force push v0.2 as the new main

```bash
# Make sure you're on v0.2
git checkout v0.2

# Force push v0.2 to main (this REPLACES main with v0.2)
git push origin v0.2:main --force
```

### Step 3: Update your local main branch

```bash
# Delete local main
git branch -D main

# Fetch and checkout the new main
git fetch origin
git checkout -b main origin/main
```

### Step 4: Delete the v0.2 branch (optional, since main is now v0.2)

```bash
git branch -d v0.2
git push origin --delete v0.2
```

### Step 5: Create the v0.2.0 release manually

Since changelogen might try to auto-bump the version, do the release manually:

```bash
# 1. Run lint and tests
pnpm run lint
pnpm run test

# 2. Build the package
pnpm run prepack

# 3. Generate changelog without auto-bump (just generate)
npx changelogen

# 4. Review the generated CHANGELOG.md changes

# 5. Create the release commit and tag manually
git add CHANGELOG.md package.json
git commit -m "chore(release): v0.2.0"
git tag v0.2.0

# 6. Publish to npm
npm publish

# 7. Push everything
git push origin main --follow-tags
```

### Alternative: Use changelogen with explicit version

If you want changelogen to handle it but with explicit version:

```bash
# This tells changelogen to use 0.2.0 as the release version
npx changelogen --release --bump patch  # This will go from 0.2.0 to 0.2.0 (no change if already set)
```

Or edit the release script temporarily to not bump:

```bash
# Run lint and tests manually first
pnpm run lint && pnpm run test && pnpm run prepack

# Then just generate changelog and tag
npx changelogen --release --no-bump
npm publish
git push --follow-tags
```

---

## Quick Commands Summary

```bash
# === REPLACE MAIN WITH V0.2 ===
git checkout v0.2
git push origin v0.2:main --force
git branch -D main
git fetch origin
git checkout -b main origin/main

# === CREATE V0.2.0 RELEASE ===
pnpm run lint
pnpm run test
pnpm run prepack
npx changelogen
git add CHANGELOG.md package.json
git commit -m "chore(release): v0.2.0"
git tag v0.2.0
npm publish
git push origin main --follow-tags
```

---

## Notes

- Existing tags (v0.1.1 - v0.1.8) will remain pointing to old commits - this is fine
- The v0.2.0 tag will mark the new release
- npm versioning will jump from 0.1.8 to 0.2.0 - this is a normal minor version bump
