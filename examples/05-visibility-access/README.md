# Example 05 — Team Knowledge Base (Visibility & Access)

The advanced access pattern showcase. A workspace-scoped knowledge base with every access control
pattern you'll need in production, layered into a single coherent domain.

## What this example teaches (beyond 01–04)

- **Row-level visibility** — articles have `private`, `team`, or `workspace` visibility, filtered by owner scope
- **Field redaction** — `internalNotes` and `draftFeedback` stripped for non-editors
- **Manager hierarchy** — editors see their team's articles via `managerId` chains
- **Enrollment-based access** — users must be enrolled in a knowledge base to read its articles
- **Prerequisite chains** — article X requires completing article Y first
- **Publication state** — draft articles visible only to staff (owner/admin/editor)
- **Share tokens** — SHA-256 hashed, expirable, revocable links for external access
- **Access levels** — `view` / `comment` / `edit` per article with inheritance from parent articles
- **Inherited access** — child articles inherit parent's share permissions

## Domain model

```
Workspace → Knowledge Base → Article (hierarchical via parentArticleId)
                ↓                 ↓
           Enrollment        ArticleProgress (completion tracking)
                             ArticleShare (per-user access level)
                             ShareToken (anonymous access via link)
```

## Roles

| Role | KB | Articles | Enrollments | Shares |
|------|-----|----------|-------------|--------|
| owner | create/publish | full access, skip enrollment | manage | create |
| admin | create/publish | full access, skip enrollment | manage | create |
| editor | — | create, see team articles, see internal notes | manage | create |
| contributor | — | create own, see workspace articles | — | — |
| viewer | — | see workspace articles (if enrolled) | — | — |

## Running

```bash
pnpm install
pnpm dev
```

## Testing

```bash
pnpm test
```

Tests cover visibility filtering, redaction, enrollment, prerequisites, share tokens, inherited access, and cross-tenant isolation.
