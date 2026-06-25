# Grilling Decisions

Date: 2026-06-23

This document captures the decisions from the grilling session around `final-vnext.md`. It is not a replacement for the full direction memo. It is the running agreement log: question, recommended answer, user decision, and impact.

## Summary

We agreed to build aggressively toward the full Nuxt + Convex + Better Auth stack, but with a strict product boundary.

The product is:

```txt
Nuxt + Convex + Better Auth as the core product.
Starters and recipes make it fast to build real apps with that stack.
```

The first hard gate is a clean canonical `team-saas` starter. It should be a real project people can start from, not a research harness.

Base `team-saas` will be richer than the smallest possible starter. It will teach organizations, teams, members, team-scoped projects, product authorization, audit, and soft delete. Advanced Better Auth plugins and public OAuth/MCP stay outside the base starter.

## Accepted Scope

In scope for the code rush:

- Core `better-convex-nuxt` integration library.
- Canonical `team-saas` based on `starters/team`.
- `agentic-saas` with explicit agent delegation.
- Private MCP recipe/starter.
- Experimental `platform-auth` for OAuth Provider and public MCP proof.

Out of scope for base starter:

- Billing rollups and invoices.
- Enterprise SSO.
- Full SCIM lifecycle.
- Generic authz DSL.
- Generated MCP wrappers.
- Shared B2B package.
- Public OAuth/MCP in `team-saas`.
- Advanced auth plugins in first-run UI.

## Question Log

### 1. What product ships first?

Accepted answer: ship `better-convex-nuxt` as the focused Nuxt + Convex + Better Auth integration product, with `team-saas` as the first canonical starter.

Impact:

- Do not market a broad SaaS/AI/MCP platform first.
- Core package remains integration-oriented.
- Starter quality becomes the main product proof.

### 2. What does "full final stack" include?

Accepted answer: include core, `team-saas`, `agentic-saas`, private MCP, and `platform-auth` proof.

Impact:

- We can build broadly, but each surface has a clear boundary.
- Advanced work is allowed, but not allowed to pollute core or base starter.

### 3. What is the first hard gate?

Accepted answer: `team-saas` must become clean and canonical before the rush expands.

Impact:

- Team/auth/product boundaries get settled first.
- Advanced starters copy the right model instead of inventing their own.

### 4. Are we willing to hard-delete or quarantine conflicting starter paths?

Accepted answer: yes.

Impact:

- Unreleased/experimental paths should use hard cutovers.
- Conflicting old paths should be deleted or clearly quarantined.
- No "just in case" compatibility paths for greenfield starters.

### 5. Should OAuth/MCP/OIDC research scripts remain in `starters/team`?

Accepted answer: no. Move or quarantine runtime OAuth/MCP lifecycle proofs into `platform-auth`.

Impact:

- `team-saas` stays understandable as the base SaaS starter.
- `platform-auth` owns public OAuth/MCP experimentation.
- Lightweight surface guards may remain only if they prevent accidental public claims.

### 6. Should advanced Better Auth recipes be in base `team-saas`?

Accepted answer: no. Base `team-saas` should be smaller than the research harness.

Base includes:

- Local Better Auth Convex component.
- Email/password or one simple auth path.
- Better Auth Organization.
- Static roles.
- Product permission resource.
- Projects.
- Product audit.
- Invite/member flow.
- Convex product authorization.

Advanced recipes:

- Admin.
- API keys.
- Dynamic roles.
- Passkeys.
- TOTP.
- Email OTP.
- Magic links.
- Stripe.
- SCIM.
- OAuth/MCP.

### 7. Should `starters/team/convex/auth.ts` be split?

Accepted answer: yes.

Impact:

- Base `auth.ts` should contain only base auth and organization setup.
- Advanced auth/plugin setup should move to recipe/proof files or other starters.
- The canonical starter should not look like a plugin kitchen.

### 8. Should `starters/team/package.json` include only base dependencies?

Accepted answer: yes.

Base dependencies should be close to:

```txt
@convex-dev/better-auth
better-auth
better-convex-nuxt
convex
nuxt
vue
```

Advanced dependencies move to recipes:

- `@better-auth/api-key`
- `@better-auth/passkey`
- `@better-auth/scim`
- `@better-auth/stripe`
- `stripe`
- `@better-auth/oauth-provider`

Impact:

- Smaller install.
- Smaller security/update surface.
- Clearer starter promise.

### 9. What should first-run `team-saas` UI show?

Accepted answer: show only the core product path.

Base UI:

- Sign up/sign in.
- Organization create/list.
- Organization rename.
- Team create/list/select/rename.
- Member invite/list/remove.
- Member role/team changes.
- Project create/list/update/soft-delete/restore.
- Paginated org/team audit activity.

Do not show in base UI:

- Admin panel.
- API keys.
- Dynamic roles.
- Passkeys.
- TOTP.
- Email OTP.
- Magic links.
- Stripe.
- SCIM.
- OAuth/MCP.

### 10. Should audit visibility be part of base UI?

Accepted answer: yes.

Impact:

- Base starter teaches product-domain audit.
- Audit proves the boundary: Better Auth owns auth state; Convex product mutations write product history.
- Keep it small. No exports, filters, generic framework, retention policy, or membership-history mirror yet.

### 11. Should invite/member management be part of base UI?

Accepted answer: yes.

Impact:

- `team-saas` actually demonstrates collaboration.
- Member/invite state remains Better Auth-owned.
- No app-owned members or invitations.

### 12. Should base use static roles only?

Initial accepted answer: yes, but later changed by team decision.

Updated decision: base uses static roles, but teams are first-class.

Still excluded from base:

- Dynamic access control.
- Custom tenant-defined roles.
- Member additional fields.

### 13. Should `teamId` be removed from base projects?

Initial recommendation was to remove it. User pushed back.

Accepted answer: keep `teamId`; teams are part of the base starter.

Impact:

- `team-saas` is not the smallest possible starter.
- It is a richer reference app that people can trim.
- Because `teamId` stays, teams must be visible and documented, not hidden in experiments.

### 14. If `teamId` stays, should teams be visible in UI/docs?

Accepted answer: yes.

Impact:

- Team create/list belongs in first-run UI.
- Project creation needs a selected team.
- Team membership and team-scoped authorization must be tested.

### 15. Should every project belong to a team?

Accepted answer: yes.

Target shape:

```ts
projects: defineTable({
  organizationId: v.string(),
  teamId: v.string(),
  name: v.string(),
  createdByAuthUserId: v.string(),
  createdAt: v.number(),
})
```

Impact:

- Avoids two scopes for projects.
- Simpler authorization rule: organization role plus team membership.
- Users who do not need teams can remove the team layer later.

### 16. Should Better Auth default team be enabled?

Accepted answer: yes.

Flow:

```txt
User creates organization.
Better Auth creates default team.
Default team becomes active/selected.
User creates first project in that team.
```

Impact:

- Projects can require `teamId` without forcing manual team creation first.
- Organization deletion remains out of base UI because teams make deletion semantics sharper.

### 17. Should invitations require a team?

Accepted answer: yes.

Invite form requires:

- Email.
- Role.
- Team.

Impact:

- Invited users can collaborate immediately.
- Avoids awkward org members with no product access.
- Team membership remains Better Auth-owned.

### 18. How should team-scoped product authorization work?

Accepted answer: use Better Auth APIs for org role permissions and Better Auth component tables for team membership.

Rule:

```txt
auth.api.hasPermission() checks org-level role permission.
Better Auth team/teamMember component tables check exact team membership.
Convex product functions enforce final product invariants.
```

Impact:

- No app-owned team/member mirrors.
- Product functions can prove both role and team membership.

### 19. Should `users` projection stay?

Accepted answer: yes, after discussing tradeoffs.

Rule:

```txt
Better Auth user is canonical.
app.users is a tiny display projection.
Authorization never reads app.users.
Product invariants never read app.users.
```

Reasons to keep:

- Product/audit UI can show names/emails.
- Project queries can resolve display data without ad hoc Better Auth reads everywhere.

Reasons not to grow it:

- It is derived state.
- It can become a second user profile source if it accumulates fields.

### 20. What should be projected into `users`?

Accepted answer:

```ts
users: defineTable({
  authUserId: v.string(),
  name: v.optional(v.string()),
  email: v.optional(v.string()),
  image: v.optional(v.string()),
  createdAt: v.number(),
  updatedAt: v.number(),
}).index('by_auth_user_id', ['authUserId'])
```

Do not project:

- Locale.
- Timezone.
- Marketing preferences.
- Email verification.
- Roles.
- Organization ids.
- Team ids.
- Memberships.
- Sessions.
- API keys.
- MFA/passkey state.
- Billing state.

Impact:

- Projection stays display-only.
- Better Auth remains canonical.

### 21. Is this the recommended Convex component approach?

Answer: yes.

The recommended model is:

- Better Auth component owns auth tables.
- Local install gives schema/plugin control and direct component table access.
- Triggers can maintain small derived app projections.
- App tables should not mirror canonical auth state.

Impact:

- `users` projection via triggers is acceptable.
- App-owned org/member/team/invite mirrors are not acceptable.

### 22. Should product audit use free-form strings or schema-bounded values?

Accepted answer: schema-bounded values.

Target:

```ts
const auditAction = v.union(
  v.literal('organization.create'),
  v.literal('organization.update'),
  v.literal('project.create'),
  v.literal('project.update'),
  v.literal('project.delete'),
  v.literal('project.restore'),
  v.literal('member.invite'),
  v.literal('member.remove'),
  v.literal('member.role.update'),
  v.literal('team.create'),
  v.literal('team.update'),
  v.literal('team.member.add'),
  v.literal('team.member.remove'),
)

const auditResourceType = v.union(
  v.literal('organization'),
  v.literal('project'),
  v.literal('member'),
  v.literal('team'),
)
```

Impact:

- Convex rejects invalid audit writes at runtime.
- Autocomplete and TypeScript improve.
- Audit UI is easier to build.
- New audit actions require intentional schema changes.

Scalability decision:

- If actions grow, split by domain.
- If hundreds of actions ever make schema unions painful, consider a deliberate typed-helper plus `v.string()` design later.

### 23. Should audit store `actorAuthUserId` or an explicit actor object?

Accepted answer: explicit actor object.

Base shape:

```ts
actor: v.object({
  kind: v.literal('user'),
  authUserId: v.string(),
})
```

Impact:

- Audit can later support agents/API keys/service actors without pretending all actors are human.
- Base starter still only supports `kind: 'user'`.
- Audit UI can switch on `actor.kind`.

### 24. Should product rows use actor objects too?

Accepted answer: no.

Keep product rows simple:

```ts
createdByAuthUserId: v.string()
```

Impact:

- Product schemas stay boring.
- Audit owns detailed actor history.
- Future non-human actor semantics do not spread into every product table.

### 25. Should project update/delete exist in base?

Accepted answer: yes, but deletion should be soft delete after follow-up discussion.

Base should include:

- Create.
- List.
- Rename/update.
- Soft delete.
- Restore.

### 26. Should project deletion be soft-delete-only in base?

Accepted answer: yes.

Target deletion fields:

```ts
status: v.union(v.literal('active'), v.literal('deleted')),
deletedAt: v.optional(v.number()),
deletedByAuthUserId: v.optional(v.string()),
```

Impact:

- Destructive action is reversible.
- Starter teaches safer SaaS default.
- No hard project delete in base.

### 27. Should deleted projects have a separate view?

Accepted answer: yes.

UI:

```txt
Projects
[Active] [Deleted]

Active:
- Launch site

Deleted:
- Old prototype [Restore]
```

Impact:

- Soft delete is visible and teachable.
- Restore is discoverable.
- Normal project list stays clean.

### 28. Should active/deleted queries use `status` or only `deletedAt`?

Accepted answer: use explicit `status` plus deletion metadata.

Target:

```ts
projects: defineTable({
  organizationId: v.string(),
  teamId: v.string(),
  name: v.string(),
  status: v.union(v.literal('active'), v.literal('deleted')),
  createdByAuthUserId: v.string(),
  createdAt: v.number(),
  updatedAt: v.number(),
  deletedAt: v.optional(v.number()),
  deletedByAuthUserId: v.optional(v.string()),
}).index('by_team_status_updated', ['organizationId', 'teamId', 'status', 'updatedAt'])
```

Impact:

- Active/deleted queries are clean and indexed.
- `status` and `deletedAt` must be kept consistent.
- `updatedAt` drives active/deleted ordering for create, rename, delete, and restore.
- Mutations need invariant tests:
  - created project is active;
  - deleting sets status/deleted fields together;
  - restoring clears deletion fields;
  - deleted projects do not appear in active list.

### 29. Should `auditEvents` have a team index?

Accepted answer: yes.

Target:

```ts
auditEvents: defineTable({
  organizationId: v.string(),
  teamId: v.optional(v.string()),
  actor: auditActor,
  action: auditAction,
  resourceType: auditResourceType,
  resourceId: v.optional(v.string()),
  summary: v.optional(v.string()),
  createdAt: v.number(),
})
  .index('by_org_created', ['organizationId', 'createdAt'])
  .index('by_team_created', ['organizationId', 'teamId', 'createdAt'])
```

Impact:

- Org-wide activity is efficient.
- Team-scoped activity is efficient.
- Every audit write updates one extra index.
- This is justified because teams are first-class in base.

### 30. Should project lists order by `createdAt`, `updatedAt`, or `sortAt`?

Accepted answer: use `updatedAt`.

Target index:

```ts
.index('by_team_status_updated', [
  'organizationId',
  'teamId',
  'status',
  'updatedAt',
])
```

Impact:

- Recently changed projects appear first.
- Rename/delete/restore all move the row.
- No extra `sortAt` concept is needed in base.
- If background jobs later patch projects, we must avoid accidental `updatedAt` churn.

### 31. Should deleted projects order by `updatedAt` or `deletedAt`?

Accepted answer: use `updatedAt` for both active and deleted lists.

Rule:

```txt
soft delete sets updatedAt = deletedAt = now
restore sets updatedAt = now and clears deletedAt/deletedByAuthUserId
```

Impact:

- One index handles active and deleted lists.
- Deleted view behaves like most-recently-deleted.
- Restored projects appear at the top of active list.

### 32. Should restore require `project:update` or `project:delete`?

Accepted answer: restore requires `project:delete`.

Impact:

- Delete/restore are treated as the same lifecycle permission.
- Owner/admin can delete and restore.
- Members who can update projects cannot revive deleted projects unless they also have delete permission.

### 33. Which roles get which project permissions?

Accepted answer:

```txt
owner:  project create/read/update/delete
admin:  project create/read/update/delete
member: project create/read/update
viewer: project read
```

Impact:

- Members can collaborate normally.
- Soft delete and restore are admin-level actions.
- Viewer is read-only.

### 34. Should members be allowed to create teams?

Accepted answer: no. Owner/admin manage teams.

Target:

```txt
owner: team create/update
admin: team create/update
member: no team management
viewer: no team management
```

Impact:

- Organization structure is controlled.
- Members work inside teams they belong to.
- Members cannot create private team silos.
- Team deletion is intentionally out of base.

### 35. Which teams can each role see?

Accepted answer:

```txt
owner/admin: see all organization teams
member/viewer: see only teams they belong to
```

Impact:

- Admins can manage the workspace.
- Members do not see irrelevant/private teams.
- UI visibility is still not backend authorization.

### 36. Can owner/admin access team projects without being team members?

Accepted answer: yes.

Rule:

```txt
owner/admin with project permission can access any team in the organization.
member/viewer must be teamMember of that team.
```

Impact:

- Admins can support/manage all teams.
- Team membership remains the boundary for non-admin users.
- Authorization helper must encode this bypass explicitly.

### 37. How does the helper know owner/admin role?

Accepted answer: read Better Auth `member.role` from the Better Auth component table.

Flow:

```txt
1. Get authenticated Better Auth user/session.
2. Use hasPermission() for requested org permission.
3. Read Better Auth member row for organizationId + authUserId.
4. If role is owner/admin, allow team bypass.
5. Otherwise require Better Auth teamMember row.
```

Impact:

- No app-owned membership mirror.
- Better Auth remains source of truth.
- Product helper is intentionally coupled to the Better Auth local component schema.

### 38. Should the helper return role?

Accepted answer: no. Keep role internal.

Return shape:

```ts
type ProjectTeamAccess = {
  actor: { kind: 'user'; authUserId: string }
  organizationId: string
  teamId: string
}
```

Impact:

- Product mutations know access was granted.
- Role branching stays centralized.
- UI role display uses separate read/capability queries.

### 39. Specific helper or generic permission helper?

Accepted answer: small internal building blocks plus explicit exported product helper.

Target:

```ts
// convex/lib/authz.ts
async function requireAuthenticatedUser(...)
async function requireOrgPermission(...)
async function requireTeamAccess(...)

export async function requireProjectTeamAccess(...)
export async function requireProjectAccessById(...)
```

Impact:

- Avoids a generic auth framework.
- Keeps product-facing helper readable.
- Shared low-level pieces avoid copy/paste.

### 40. Should update/delete/restore helpers load the target project?

Accepted answer: yes, via a project-id helper.

Target:

```ts
const { actor, project } = await requireProjectAccessById(ctx, {
  projectId,
  permission: 'update',
})
```

Impact:

- Client cannot spoof `organizationId` or `teamId` for existing project mutations.
- Helper derives access from canonical project row.
- Product mutations become harder to misuse.

### 41. API shape for project functions

Accepted answer:

```txt
create/list: initially discussed as organizationId + teamId
rename/softDelete/restore: projectId only
```

This was refined in Question 42.

### 42. Should project create/list use only `teamId`?

Accepted answer: yes.

Final project API shape:

```ts
projects.list({ teamId, status })
projects.create({ teamId, name })
projects.rename({ projectId, name })
projects.softDelete({ projectId })
projects.restore({ projectId })
```

Server derivation:

```txt
create/list derive organizationId from Better Auth team row.
rename/delete/restore derive organizationId/teamId from project row.
```

Impact:

- Minimal caller-supplied authority.
- No org/team mismatch.
- Product functions depend on reading the Better Auth team table.

### 43. Should routes still include `organizationId`?

Accepted answer: yes.

Route:

```txt
/organizations/:organizationId/teams/:teamId
```

Backend:

```ts
projects.list({ teamId, status })
projects.create({ teamId, name })
```

Impact:

- URL remains contextual and navigable.
- Backend does not trust URL organization id for project authorization.
- UI should verify team belongs to organization for display.

### 44. Organization overview or redirect to team?

Accepted direction: organization page should exist as a management/overview page, but visible sections depend on capabilities.

Target route split:

```txt
/organizations/:organizationId
  organization overview and management

/organizations/:organizationId/teams/:teamId
  team-scoped project workspace
```

Impact:

- Clear place for team list, members, invites, settings, and org activity.
- Team page stays focused on projects and team activity.

### 45. Should we add an org UI capability query?

Accepted answer: yes.

Target:

```ts
organizationAccess.getCapabilities({ organizationId })
```

Purpose:

- Hide/show org settings.
- Hide/show member management.
- Hide/show team management.
- Keep role/capability display logic out of scattered Vue components.

Important rule:

```txt
Capabilities are display-only.
Mutations still authorize independently.
```

### 46. Should capabilities return role, booleans, or both?

Accepted answer: both.

Target:

```ts
{
  role: 'owner' | 'admin' | 'member' | 'viewer',
  canManageOrganization: boolean,
  canManageMembers: boolean,
  canManageTeams: boolean,
  canViewOrgActivity: boolean,
  canCreateProject: boolean,
  canDeleteProject: boolean,
}
```

Impact:

- UI can display the role.
- UI behavior uses booleans.
- Policy remains centralized.

### 47. Should capabilities read role directly or use `hasPermission()`?

Accepted answer: both.

Rule:

```txt
Read Better Auth member.role for display.
Use auth.api.hasPermission() for boolean capabilities.
```

Impact:

- Role label is available.
- Boolean policy follows Better Auth permission engine.
- Reduces drift if role permissions change.

### 48. Should org and team capability queries be separate?

Accepted answer: yes.

Target:

```ts
organizationAccess.getCapabilities({ organizationId })
teamAccess.getCapabilities({ teamId })
```

Team capability query returns:

```ts
{
  organizationId: string,
  teamId: string,
  canViewProjects: boolean,
  canCreateProject: boolean,
  canUpdateProject: boolean,
  canDeleteProject: boolean,
}
```

Impact:

- Org page and team page each get the display data they need.
- Avoids one generic capability service with optional branching.
- Team query derives organization from Better Auth team row.

## `convex-authz` Learning

We inspected `/Users/matthias/Git/external/convex-auths/convex-authz`.

Decision: borrow design ideas, do not adopt the component in base `team-saas`.

Useful ideas to reuse:

- Typed permission vocabulary.
- Readable role matrix.
- Scope concept.
- Future custom-role whitelist pattern.
- Invariant test discipline.
- Bounded audit vocabulary.

Do not reuse in base:

- `roleAssignments` table.
- `permissionOverrides` table.
- `relationships` table.
- `effectivePermissions` table.
- `effectiveRoles` table.
- `effectiveRelationships` table.
- `customRoles` table.
- Authz audit log table.
- Recompute workflows.
- ABAC/ReBAC engine.
- O(1) materialized permission lookup system.

Reason:

```txt
convex-authz owns authorization state.
Base team-saas already uses Better Auth Organization as the auth-domain source of truth.
Adding convex-authz would create a second authorization authority.
```

Future use:

```txt
convex-authz can become an advanced recipe only if we need ABAC, ReBAC,
permission overrides, custom tenant-defined roles, or materialized O(1) checks.
```

## Continued Grilling Decisions

### 49. Should the UI route include organization and team IDs?

Accepted answer: yes.

Target routes:

```txt
/organizations/:organizationId
/organizations/:organizationId/teams/:teamId
```

Impact:

- Navigation is understandable and bookmarkable.
- The backend still derives authority from `teamId` or `projectId`.
- Frontend route IDs are navigation context, not security proof.

### 50. Should project APIs accept organization ID from the client?

Accepted answer: no for existing project mutations.

Target API:

```ts
projects.list({ teamId, status })
projects.create({ teamId, name })
projects.rename({ projectId, name })
projects.softDelete({ projectId })
projects.restore({ projectId })
```

Impact:

- Existing project operations cannot mix a project ID from one org with an organization ID from another org.
- The server loads the project and derives organization/team from canonical rows.
- Create/list use `teamId`; the server derives organization from the Better Auth team row.

### 51. Should team creation, rename, and delete all ship in base?

Accepted answer: create/list/select/rename only. No team delete in base.

Reason:

```txt
Projects require teamId.
Deleting teams creates hard product questions: what happens to projects,
default teams, last teams, and member access?
```

Impact:

- The base starter teaches teams without introducing destructive team lifecycle complexity.
- Team deletion can be a later advanced recipe once reassignment/archive semantics are designed.

### 52. Should organization settings exist in base?

Accepted answer: yes, but minimal.

Base organization settings:

```txt
Rename organization
View members/teams/activity based on capabilities
```

Not in base:

```txt
Delete organization
Plan/billing fields
Region settings
Fake enterprise settings
```

Impact:

- The starter has a real management surface.
- Owner/admin-only organization settings can be demonstrated.
- We avoid pretending to support lifecycle and billing workflows that are not implemented.

### 53. Should member management include role change and team assignment?

Accepted answer: yes.

Base member management:

```txt
Invite member with role and team
List members
Remove member
Change member role
Add existing org member to a team
Remove member from a team
```

Impact:

- The starter demonstrates the real org/team shape.
- Team-scoped access can be tested from the UI.
- Complexity is acceptable because this is the pattern people need to copy correctly.

### 54. Should members removed from a team keep access to projects they created?

Accepted answer: no.

Rule:

```txt
Creator metadata is history, not authorization.
```

Impact:

- Removed team members lose access to team projects, including their own created projects.
- Authorization remains based on current org permission and current team access.
- `createdByAuthUserId` is display/audit metadata only.

### 55. Should owner/admin bypass team membership?

Accepted answer: yes, if they also have the relevant organization permission.

Rule:

```txt
owner/admin + project permission => can access any team in org
member/viewer + project permission => must be team member
```

Impact:

- Admins can manage the whole organization without being manually added to every team.
- Lower roles cannot access teams just because they know IDs.
- Every project access check still requires org permission and team access/bypass.

### 56. Should team membership alone grant project access?

Accepted answer: no.

Rule:

```txt
Project access = organization permission + team access/bypass.
```

Impact:

- A viewer can belong to a team and still only read.
- A member can update if their org role allows update.
- Team membership scopes where access applies; org role defines what action is allowed.

### 57. Should direct Better Auth route calls be included in app audit completeness?

Accepted answer: no. Base audit is app-surface audit, not full Better Auth system audit.

Known bypass:

```txt
If someone calls Better Auth organization/team routes directly,
Better Auth can still authorize and mutate its own component tables,
but our app auditEvents table will not automatically receive an event.
```

Impact:

- Security impact is low: Better Auth still enforces Better Auth permissions.
- Audit completeness impact is medium: app activity is complete only for actions performed through our app wrappers/UI.
- The docs must say this clearly.

### 58. Should the base starter add a service key so Nuxt can force audit around Better Auth calls?

Accepted answer: no.

Reason:

```txt
A service key can let the Nuxt backend call Convex with privileged authority,
but it does not solve direct Better Auth route calls unless all Better Auth
traffic is forced through that backend.
```

Impact:

- We avoid teaching service-key plumbing in the base starter.
- The base remains closer to normal Convex/Better Auth usage.
- Full server-mediated auth can be an advanced platform recipe later.

### 59. Should management audit events be written through app wrappers?

Accepted answer: yes.

Rule:

```txt
When our UI performs management actions, it should call app-owned wrappers
that perform the Better Auth operation and write app audit where feasible.
```

Examples:

```txt
Invite member -> member.invite audit
Remove member -> member.remove audit
Update member role -> member.role.update audit
Create team -> team.create audit
Rename team -> team.update audit
Add member to team -> team.member.add audit
Remove member from team -> team.member.remove audit
```

Impact:

- The visible app path has useful audit.
- The base does not claim impossible global audit coverage.
- Direct Better Auth calls remain documented as outside app audit.

### 60. Should product mutation audit be in the same Convex transaction?

Accepted answer: yes.

Rule:

```txt
Project mutation and project audit insert happen in the same Convex mutation.
```

Impact:

- No project write without matching product audit write.
- No background job needed.
- If the mutation fails, both product change and audit write fail together.

### 61. Should audit writes be inline everywhere or use a helper?

Accepted answer: use a small helper.

Target:

```ts
export async function writeAuditEvent(
  ctx: MutationCtx,
  event: {
    organizationId: string
    teamId?: string
    actor: { kind: 'user'; authUserId: string }
    action: AuditAction
    resourceType: AuditResourceType
    resourceId?: string
    summary?: string
    createdAt: number
  },
) {
  return await ctx.db.insert('auditEvents', event)
}
```

Impact:

- Keeps audit insert shape consistent.
- Avoids a generic service/framework.
- Still makes each mutation explicitly choose its audit action and summary.

### 62. Should audit events store only IDs or also a tiny display snapshot?

Accepted answer: store IDs plus an optional bounded `summary` string. Do not add generic metadata.

Target:

```ts
summary: v.optional(v.string())
```

Impact:

- Activity remains readable after resource names change.
- Old audit events preserve what happened at the time.
- We avoid `metadata: v.any()` becoming a second product database.

### 63. Should the base audit feed support filters?

Accepted answer: no. Base audit is latest activity only.

Target queries:

```ts
audit.listForTeam({ teamId, paginationOpts })
audit.listForOrganization({ organizationId, paginationOpts })
```

Rule:

```txt
Sort newest first using the existing org/team created indexes.
Do not add action, actor, resource, or generic search filters yet.
```

Impact:

- Activity feed stays simple.
- No extra indexes for imagined future filters.
- The audit model is still visible and testable.
- Later filters can be added deliberately with matching access checks and indexes.

### 64. Should audit reads join current names server-side?

Accepted answer: no. Audit rows should be self-contained enough for display.

Rule:

```txt
Audit read queries return audit rows directly.
The UI uses action, actor, summary, resourceType, resourceId, and createdAt.
```

Example:

```ts
{
  action: 'project.update',
  resourceType: 'project',
  resourceId: projectId,
  actor: { kind: 'user', authUserId },
  summary: 'Renamed project from Roadmap to Launch Plan',
  createdAt: now,
}
```

Impact:

- Historical audit text does not drift when users/projects/teams are renamed.
- Audit reads stay simple and fast.
- Deleted resources do not break the feed.
- Mutation code must write useful summaries when events are created.

### 65. Should audit move into the reusable core library?

Accepted answer: no. Audit stays starter-local.

Boundary:

```txt
better-convex-nuxt owns Nuxt + Convex + Better Auth integration.
team-saas owns auditEvents, writeAuditEvent(), audit UI, and product audit rules.
```

Impact:

- Core package stays focused.
- Audit action/resource names remain product-domain concepts.
- The starter teaches the pattern directly.
- Extraction can happen later only if multiple starters converge on the same shape.

### 66. Should member/team management use app-owned wrappers?

Accepted answer: yes for audited management mutations.

Rule:

```txt
Use small app-owned wrappers for actions where the app needs audit or app-specific policy.
Use direct Better Auth client calls only for simple reads/auth UI where no app invariant is involved.
```

Examples:

```ts
teamManagement.renameTeam({ teamId, name })
memberManagement.inviteMember({ organizationId, teamId, email, role })
```

Impact:

- Visible app management actions can write app audit.
- UI stays thinner.
- We avoid pretending every Better Auth route is globally audited.
- Wrappers must stay explicit, not become a generic Better Auth proxy layer.

### 67. Should audited management wrappers run as Convex functions or Nuxt server routes?

Accepted answer: use Nuxt server routes for Better Auth management wrappers, and Convex mutations for product data.

Split:

```txt
Nuxt server routes:
- member invite/remove/role change
- team create/rename/member assignment
- organization rename
- call Better Auth APIs with natural HTTP/session context
- then call Convex to write app audit where feasible

Convex mutations:
- project create/rename/soft-delete/restore
- product authorization
- product audit in the same Convex transaction
```

Impact:

- Better Auth calls stay in the layer that naturally has cookies/session.
- Product mutations remain atomic inside Convex.
- Management audit cannot be one Convex transaction with Better Auth component table changes.
- We avoid forcing awkward session/cookie plumbing into Convex actions.

### 68. What happens if Better Auth management succeeds but audit fails?

Accepted answer: management action returns success; audit failure is logged/reported.

Rule:

```txt
Management audit is best-effort after Better Auth success.
Product audit remains strict and transactional inside Convex mutations.
```

Example:

```txt
Rename team request:
1. Better Auth team update succeeds.
2. Convex audit insert fails.
3. Nuxt server logs the audit failure.
4. UI still treats the team rename as successful.
```

Impact:

- UI reflects the actual source-of-truth state.
- Retrying does not repeat already-successful management actions.
- Management audit has an honest completeness limit.
- We avoid outbox/retry/service-key architecture in the base starter.

### 69. Should management wrappers be explicit routes or one generic endpoint?

Accepted answer: explicit Nuxt server routes per audited management action.

Examples:

```txt
POST /api/organizations/:organizationId/rename
POST /api/organizations/:organizationId/teams
POST /api/teams/:teamId/rename
POST /api/teams/:teamId/members
DELETE /api/teams/:teamId/members/:memberId
```

Do not add:

```txt
POST /api/management
{ "action": "renameTeam", "payload": { ... } }
```

Impact:

- Each route has one input shape and one permission story.
- Routes are easier to test and debug.
- We avoid a stringly-typed command bus.
- More files are acceptable because each file stays small and explicit.

### 70. Should organization creation move behind an app-owned wrapper?

Accepted answer: yes.

Current issue:

```ts
await authClient.organization.create({
  name,
  slug,
  plan: 'team',
  region: 'eu',
})
```

Target:

```txt
POST /api/organizations
{ "name": "Acme" }
```

Rule:

```txt
The server route generates the slug, calls Better Auth, relies on default team creation,
and avoids fake base fields like plan/region.
```

Impact:

- The base starter teaches the app-owned organization setup path.
- Random research metadata leaves the base UI.
- Organization creation can write app audit later if we keep org-level audit.
- Adds one small route for a root product setup action.

### 71. Should organization creation write audit?

Accepted answer: yes.

Target audit event:

```ts
{
  organizationId,
  actor: { kind: 'user', authUserId },
  action: 'organization.create',
  resourceType: 'organization',
  resourceId: organizationId,
  summary: 'Created organization Acme',
  createdAt: now,
}
```

Impact:

- Organization activity feed is not empty after setup.
- The starter teaches lifecycle audit from the first management action.
- This remains best-effort management audit because Better Auth organization creation and Convex audit insert are not one transaction.
- Adds `organization` to `auditResourceType`.

### 72. Should organization rename write audit?

Accepted answer: yes.

Target audit event:

```ts
{
  organizationId,
  actor: { kind: 'user', authUserId },
  action: 'organization.update',
  resourceType: 'organization',
  resourceId: organizationId,
  summary: 'Renamed organization from Acme to Acme Labs',
  createdAt: now,
}
```

Impact:

- Organization settings changes are visible in activity.
- The only base organization settings mutation is audited.
- This remains best-effort management audit through the Nuxt wrapper.

### 73. What should organization and team activity feeds include?

Accepted answer:

```txt
Organization activity shows all events in the organization.
Team activity shows only events scoped to that teamId.
```

Impact:

- Organization page becomes the cross-team management overview.
- Team page remains focused on the current workspace.
- Existing `by_org_created` and `by_team_created` indexes support the split.
- Noise can be handled later with explicit filters if it becomes a real issue.

### 74. Should audit list queries use pagination?

Accepted answer: yes. Use Convex pagination with a simple Load More UI.

Target:

```ts
audit.listForOrganization({
  organizationId,
  paginationOpts,
})

audit.listForTeam({
  teamId,
  paginationOpts,
})
```

Impact:

- Audit can grow without unbounded queries.
- The starter teaches the scalable Convex pattern.
- No hidden fixed-limit behavior where older activity silently disappears.
- Still no filters, search, or extra indexes in base.

### 75. Should project list queries use pagination?

Accepted answer: yes. Use Convex pagination for active and deleted project lists.

Target:

```ts
projects.list({
  teamId,
  status: 'active',
  paginationOpts,
})
```

Impact:

- Project lists scale beyond demo data.
- Active and deleted tabs can paginate independently.
- The starter teaches the same Convex pattern as audit.
- Slightly more UI state is acceptable because projects are a primary resource.

### 76. Should auth-owned lists use custom Convex pagination?

Accepted answer: no. Use Better Auth list APIs as-is for organization, team, and member management in base.

Rule:

```txt
App-owned resources use Convex pagination: projects, audit.
Better Auth-owned resources use Better Auth APIs: organizations, teams, members.
```

Impact:

- No mirror tables for auth-domain lists.
- No custom read model around Better Auth organizations/teams/members.
- Fewer reads against Better Auth component internals.
- If a Better Auth list API is insufficient later, add a narrow wrapper around that API, not a second source of truth.

### 77. What invariant tests are required for the starter cutover?

Accepted answer: add focused Convex/domain invariant tests before trusting the cutover.

Minimum tests:

```txt
User without org permission cannot create/list/update/delete projects.
Member/viewer cannot access another team's projects unless owner/admin bypass applies.
Team membership alone does not grant write access.
Project rename/softDelete/restore accept only projectId and derive org/team server-side.
Soft delete hides project from active list.
Deleted tab shows deleted projects.
Restore moves project back to active.
Product mutations write audit in the same mutation path.
Audit reads enforce org/team access.
App users projection is never used for authorization.
```

Impact:

- Tests target security and product invariants, not only happy paths.
- UI e2e can come later after backend policy is stable.
- Better Auth permission/component table mocking requires setup, but it is justified.

### 78. Should implementation happen as one giant cutover or smaller slices?

Accepted answer: smaller hard-cutover slices, with no old/new dual paths inside each slice.

Sequence:

```txt
1. Cut starters/team dependencies/auth config down to base.
2. Replace schema + product Convex functions + invariant tests.
3. Add audit helpers/queries and paginated project/audit reads.
4. Add Nuxt server wrappers for org/team/member management.
5. Replace UI with the canonical org/team/project/activity workflow.
6. Quarantine or move advanced proofs/scripts out of starters/team.
7. Run full starter validation and clean dead code.
```

Impact:

- Each layer is reviewable and testable.
- The starter avoids a long half-working state.
- Hard cutover principle still applies: no competing old/new implementation per feature.

### 79. Where should removed advanced proofs go?

Accepted answer: move advanced proofs out of `starters/team` into a quarantined research/proofs area first, then promote selectively later.

Target:

```txt
research/better-auth-proofs/
  api-keys/
  passkeys/
  scim/
  stripe/
  oauth-provider/
  mcp-runtime/
  dynamic-roles/
```

Rule:

```txt
Do not dump every experiment into platform-auth.
Move OAuth/MCP/OIDC lifecycle work there only when it is actively shaped into that starter.
```

Impact:

- `starters/team` becomes clean.
- Research is not lost immediately.
- Recipes are not polluted with half-productized proofs.
- Each proof later gets deleted or promoted into a real recipe with docs and validation.

### 80. What is the acceptance gate for calling `team-saas` done?

Accepted answer: the starter is done only when it is runnable, validated, and free of advanced research leftovers.

Acceptance gate:

```txt
pnpm install works from starters/team
pnpm lint passes
pnpm typecheck passes
pnpm test passes
pnpm convex codegen/check path passes if available
Base auth flow works: sign up/sign in/sign out
Organization create/list/rename works
Default team exists after org creation
Team create/list/select/rename works
Invite member with role/team works
Member role/team changes work
Project create/list/rename/soft-delete/restore works
Active/deleted project tabs work
Org activity feed works with pagination
Team activity feed works with pagination
Unauthorized org/team/project access is rejected server-side
No advanced auth plugins remain in base starter
No advanced proof scripts remain in base starter
README explains the strict boundary and what moved out
```

Impact:

- "Done" means runnable, not only architecturally designed.
- Research leftovers cannot remain in the canonical starter.
- Backend authorization and audit rules must pass real checks.
- The gate may reveal more cleanup work, which is acceptable.

## Consistency And Feasibility Review

Reviewed after the grilling pass against the local repo and installed package surface:

```txt
better-auth: 1.6.20
@convex-dev/better-auth: 0.12.4
better-convex-nuxt server helpers: serverConvexQuery/serverConvexMutation/serverConvexAction
better-convex-nuxt client pagination: useConvexPaginatedQuery
```

The plan is internally consistent if implementation follows these constraints:

### Better Auth Route Surface

The accepted management wrapper plan maps to Better Auth Organization routes that exist locally:

```txt
POST /organization/create
POST /organization/update
POST /organization/invite-member
POST /organization/remove-member
POST /organization/update-member-role
POST /organization/create-team
POST /organization/update-team
GET  /organization/list-user-teams
GET  /organization/list-team-members
POST /organization/add-team-member
POST /organization/remove-team-member
```

Important request shapes:

```ts
// Organization creation
{ name: string, slug: string }

// Organization rename
{ organizationId?: string, data: { name?: string, slug?: string } }

// Team creation
{ name: string, organizationId?: string }

// Team rename
{ teamId: string, data: { name?: string } }

// Invitation
{ email: string, role: Role, organizationId?: string, teamId?: string | string[] }

// Role update
{ memberId: string, role: Role, organizationId?: string }

// Add existing org member to team
{ teamId: string, userId: string }

// Remove team member
{ teamId: string, userId: string }
```

Implementation constraint:

```txt
Nuxt server wrappers must forward the incoming request cookies/headers to the Better Auth proxy/API call.
If cookies are not forwarded, Better Auth will not see the user's session.
```

### Nuxt Server Wrapper Surface

The wrapper approach is feasible because `better-convex-nuxt` already exposes server helpers:

```ts
serverConvexMutation(event, api.audit.recordManagementEvent, args, { auth: 'required' })
```

Rules for these wrappers:

- Call the Better Auth operation first.
- If Better Auth fails, return the Better Auth failure and do not write audit.
- If Better Auth succeeds, call Convex to write management audit.
- If the audit write fails, log/report it but return success for the already-completed management action.
- Do not introduce a service key in base.
- Do not introduce a generic management endpoint.

### Product Convex Surface

Project and product-audit functions remain Convex-owned:

```ts
projects.list({ teamId, status, paginationOpts })
projects.create({ teamId, name })
projects.rename({ projectId, name })
projects.softDelete({ projectId })
projects.restore({ projectId })
audit.listForOrganization({ organizationId, paginationOpts })
audit.listForTeam({ teamId, paginationOpts })
```

Implementation constraints:

- `projects.list` and `projects.create` derive `organizationId` from Better Auth `team`.
- `projects.rename`, `projects.softDelete`, and `projects.restore` derive `organizationId` and `teamId` from the loaded project.
- Every project mutation writes project audit inside the same Convex mutation.
- Audit list queries use Convex pagination, not fixed limits.
- Audit reads authorize access before returning rows.

### Remaining Real Risks

The plan should work, but these parts require careful implementation:

- Server wrappers must preserve Better Auth session cookies.
- Better Auth team/member route return shapes should be verified while implementing the wrappers.
- Invariant tests need a clean way to seed/mock Better Auth component rows and permission outcomes.
- `users` projection triggers must be rebuildable or clearly treated as display-only best effort.
- Management audit is intentionally best-effort; docs must not call it a complete system audit.

## Target Base Schema

The current agreed base app schema should look approximately like this:

```ts
import { defineSchema, defineTable } from 'convex/server'
import { v } from 'convex/values'

const projectStatus = v.union(v.literal('active'), v.literal('deleted'))

const auditActor = v.object({
  kind: v.literal('user'),
  authUserId: v.string(),
})

const auditAction = v.union(
  v.literal('organization.create'),
  v.literal('organization.update'),
  v.literal('project.create'),
  v.literal('project.update'),
  v.literal('project.delete'),
  v.literal('project.restore'),
  v.literal('member.invite'),
  v.literal('member.remove'),
  v.literal('member.role.update'),
  v.literal('team.create'),
  v.literal('team.update'),
  v.literal('team.member.add'),
  v.literal('team.member.remove'),
)

const auditResourceType = v.union(
  v.literal('organization'),
  v.literal('project'),
  v.literal('member'),
  v.literal('team'),
)

export default defineSchema({
  users: defineTable({
    authUserId: v.string(),
    name: v.optional(v.string()),
    email: v.optional(v.string()),
    image: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index('by_auth_user_id', ['authUserId']),

  projects: defineTable({
    organizationId: v.string(),
    teamId: v.string(),
    name: v.string(),
    status: projectStatus,
    createdByAuthUserId: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
    deletedAt: v.optional(v.number()),
    deletedByAuthUserId: v.optional(v.string()),
  }).index('by_team_status_updated', ['organizationId', 'teamId', 'status', 'updatedAt']),

  auditEvents: defineTable({
    organizationId: v.string(),
    teamId: v.optional(v.string()),
    actor: auditActor,
    action: auditAction,
    resourceType: auditResourceType,
    resourceId: v.optional(v.string()),
    summary: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index('by_org_created', ['organizationId', 'createdAt'])
    .index('by_team_created', ['organizationId', 'teamId', 'createdAt']),
})
```

## Target Auth/Product Rules

Base `team-saas` should enforce:

```txt
Better Auth owns users, sessions, organizations, members, invitations, teams, teamMembers, and roles.
App tables own users projection, projects, and auditEvents only.
Every project belongs to one Better Auth organization and one Better Auth team.
Every project mutation checks org role permission and team access.
Owner/admin can access any team in the organization.
Member/viewer must belong to the team.
Every product mutation writes audit.
Project delete is soft delete.
Project restore is explicit.
Authorization never reads app.users.
```

## Target Starter UX

Base first-run app should include:

```txt
Sign up / sign in
Organization create/list
Default team after org creation
Organization rename
Team create/list/select/rename
Invite member to role + team
Member list/remove
Member role/team changes
Project create/list/rename/soft-delete/restore scoped to selected team
Active / Deleted project tabs
Paginated org/team audit activity
Organization capability-gated settings/management sections
```

Not in base first-run app:

```txt
Admin user management
API keys
Dynamic roles
Passkeys
TOTP
Email OTP
Magic links
Stripe
SCIM
OAuth/MCP
Agents
Organization deletion
Hard project delete
```

## Implementation Implications

The current `starters/team` needs to stop being the big Better Auth research harness and become the starter people should actually fork.

Likely required changes:

- Shrink `starters/team/package.json` to base dependencies.
- Split or delete advanced plugin setup from `convex/auth.ts`.
- Keep `organization()` and enable teams/default team.
- Remove dynamic roles and advanced plugin clients from `useTeamAuthClient()`.
- Make `projects.teamId` required.
- Add project `status`, `updatedAt`, `deletedAt`, and `deletedByAuthUserId`.
- Add audit actor object and bounded audit action/resource validators.
- Add org and team audit indexes.
- Add `image` to the `users` projection if Better Auth user docs provide it.
- Add a small userland authorization helper.
- Add org/team UI capability queries.
- Add paginated project and audit queries.
- Add explicit Nuxt server wrappers for audited organization/team/member management actions.
- Move OAuth/MCP runtime proofs to `platform-auth`.
- Move advanced auth proofs into clearly quarantined research first, then promote selectively.
- Add team/member/project/audit UI and tests.

## Open Implementation Questions

These are implementation details, not product direction blockers:

1. Exact Better Auth client methods to use for team/member UI in Nuxt.
2. Exact filenames and route paths for Nuxt management wrappers.
3. Exact quarantine directory layout for advanced proof scripts/code.
4. Whether `platform-auth` receives OAuth/MCP/OIDC work immediately or after the team starter cutover.
