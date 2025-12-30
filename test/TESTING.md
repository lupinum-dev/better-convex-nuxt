# Testing Guide

## Philosophy

- **KISS**: Simple tests that document behavior
- **TDD**: Add tests when bugs are reported
- **Fast**: CI should complete in <30 seconds

## Test Structure

```
test/
├── basic.test.ts                           # Smoke: module loads, SSR works
├── behavior/
│   ├── useConvexQuery.behavior.test.ts     # Query composable contract
│   ├── useConvexMutation.behavior.test.ts  # Mutation composable contract
│   ├── useConvexAction.behavior.test.ts    # Action composable contract
│   ├── useConvexPaginatedQuery.behavior.test.ts
│   └── useConvexAuth.behavior.test.ts      # Auth composable contract
├── fixtures/
│   └── basic/                              # Minimal Nuxt fixture
└── TESTING.md                              # This file

playground/convex/
├── notes.test.ts                           # Backend function tests
├── posts.test.ts
├── lib/permissions.test.ts
├── permissions.config.test.ts
└── test.setup.ts
```

## Test Types

### 1. Smoke Test (`test/basic.test.ts`)

Verifies the module loads and basic SSR works.

```typescript
it('renders the index page', async () => {
  const html = await $fetch('/')
  expect(html).toContain('<div>basic</div>')
})
```

### 2. Behavior Tests (`test/behavior/*.behavior.test.ts`)

Document the **PUBLIC CONTRACT** of each composable:

- What users can rely on
- NOT implementation details
- Add tests here when bugs are reported

```typescript
describe('useConvexQuery', () => {
  it('fetches data on server and includes in HTML')
  it('hydrates on client without loading flash')
  it('returns undefined data when skip=true')
})
```

### 3. Convex Function Tests (`playground/convex/*.test.ts`)

Test backend logic with `convex-test`:

- Fast (~100ms total)
- Deterministic (no network)
- Documents expected backend behavior

```typescript
it('returns empty array when no notes exist', async () => {
  const t = convexTest(schema, modules)
  const notes = await t.query(api.notes.list, {})
  expect(notes).toEqual([])
})
```

## Adding Tests (TDD Workflow)

When a bug is reported:

1. **Write a failing test** that reproduces the bug
2. **Fix the bug**
3. **Test passes**

### Example: Bug in useConvexQuery skip behavior

```typescript
// test/behavior/useConvexQuery.behavior.test.ts

// Bug: skip=true was showing pending=true briefly
it('has pending=false immediately when skip=true', async () => {
  const page = await createPage('/test-skip/static-skip')
  await page.waitForLoadState('networkidle')

  const content = await page.textContent('body')
  expect(content).toContain('pending: false')
})
```

## Running Tests

```bash
# Run all tests (~20-30s)
pnpm test

# Watch mode (re-runs on file changes)
pnpm test:watch

# Run only convex tests
pnpm test -- --project=convex

# Run only e2e tests
pnpm test -- --project=e2e
```

## CI Configuration

Tests run automatically on:

- Push to `main`
- Pull requests to `main`

Expected CI time: **<30 seconds**

## Best Practices

1. **One test = one behavior**
   - Test what, not how
   - Avoid testing implementation details

2. **Use descriptive names**

   ```typescript
   // Good
   it('returns undefined data when skip=true')

   // Bad
   it('works correctly')
   ```

3. **Keep tests independent**
   - Each test should work in isolation
   - Don't depend on other tests' state

4. **Prefer behavior tests over unit tests**
   - Test the public API
   - Avoid mocking internal details

5. **Add tests for bugs, not for coverage**
   - Every test should prevent a regression
   - Don't add tests just to increase coverage %
