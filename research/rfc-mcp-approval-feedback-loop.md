# RFC: MCP Preview, Approval, And Execute Feedback Loop

## Status

Draft.

## Summary

The MCP-agent starter should demonstrate the secure production pattern for agent-driven destructive actions:

```txt
agent intent -> preview -> request approval -> human approves in app -> execute -> audit
```

This is intentionally stronger than relying on ChatGPT, Claude, Codex, or another MCP client to show a confirmation UI. MCP clients may show confirmations, but our app cannot verify what was shown, who approved it, or whether another client skipped the prompt. Convex must own the durable approval and execution authority.

The goal is not to make every action heavy. The default rule should be:

- Read-only actions use normal tools.
- Low-risk additive writes can execute directly with clear annotations, backend authz, rate limits, and audit.
- Low-risk reversible deletes can execute directly when the backend policy marks them safe.
- Destructive, irreversible, cross-user, billing, permission, or tenant-impacting actions use preview plus app-owned approval before execution.

This keeps the starter copyable and pragmatic while showing the secure pattern teams can remove if they do not need it.

The key distinction is not "delete means approval." The distinction is whether the backend can prove the operation is low-risk, scoped, reversible, and auditable.

## Research Findings

### MCP Does Not Guarantee A UI

MCP tools are model-controlled. The protocol lets clients expose tools through any UI pattern and does not mandate a specific interaction model. The MCP tools spec recommends human-in-the-loop confirmation, but that is client behavior, not a backend guarantee.

MCP elicitation exists for user input, but clients must declare support for it and the protocol still does not require a specific UI. It is useful when available, but cannot be the only safety boundary for destructive B2B actions.

### Tool Annotations Are Hints

`readOnlyHint`, `destructiveHint`, `idempotentHint`, and `openWorldHint` help clients decide when to show guardrails. They must be accurate, but they are not security. MCP explicitly describes annotations as hints, and OpenAI app guidance says destructive tools need clear labels and friction so clients can enforce confirmations or preview mode.

Therefore:

- Use annotations correctly.
- Do not trust annotations or client confirmation as authorization.
- Re-check everything in Convex.

### Existing Mature Patterns Point To Preview + Execute

Terraform separates `plan` from `apply`. A plan previews changes, but Terraform warns the final apply must still re-check because state can change.

Kubernetes server-side dry-run validates and defaults a mutation request through the API server without persisting it. That is the right mental model: preview should use server-side policy and validation, not client-side guessing.

Stripe uses idempotency keys so retrying write requests does not accidentally duplicate effects. This matters for MCP because agents and clients can retry after network failures.

Front's MCP guidance is especially close to our use case: destructive actions should create an in-product approval/comment, poll or observe approval, then execute the destructive tool. The approval is visible and auditable in the product, not only in chat.

## Problem

If an agent asks:

```txt
Can you delete Project X?
```

and ChatGPT says:

```txt
I can delete it. Are you sure?
```

then the user says:

```txt
Yes.
```

that may be acceptable for a personal app or reversible low-risk action. It is not strong enough for a B2B multi-tenant SaaS because:

- Convex cannot verify the confirmation happened.
- Convex cannot verify what the user saw.
- The app has no durable approval record.
- The approval may not name the exact org, project id, actor, or side effects.
- Another MCP client may auto-approve or show less context.
- Prompt injection can influence the model's natural-language summary.

The secure boundary must be app-owned:

```txt
human approves in the app -> Convex stores approval -> agent executes with approval id
```

## Goals

- Give agents fast, structured feedback before writes.
- Make destructive actions explicit and auditable.
- Keep Convex as the source of truth for authz, tenant scope, approvals, rate limits, and execution.
- Avoid a complex workflow engine.
- Keep the starter easy to copy and understand.
- Make the secure path visible in the demo so OSS users learn the correct pattern.
- Let app builders compose only the pieces they need per operation.

## Non-Goals

- Do not build a generic approval framework for every possible domain.
- Do not force every MCP tool into the same lifecycle.
- Do not require app-owned approval for every write.
- Do not depend on MCP elicitation or ChatGPT widgets.
- Do not store raw bearer tokens or chat transcripts.
- Do not make preview results authoritative. Execute must re-check.

## Proposed Design

### Composable Building Blocks

The starter should teach a small set of backend-owned building blocks that can be composed per operation. This gives app builders flexibility without creating a god-framework.

The blocks:

| Block      | Purpose                                                       | Required for                 |
| ---------- | ------------------------------------------------------------- | ---------------------------- |
| `authz`    | verify service actor, role, tenant scope, and server secret   | every tool                   |
| `policy`   | classify operation risk and approval requirement              | every write                  |
| `preview`  | return normalized inputs, effects, warnings, and next actions | agent-facing writes          |
| `approval` | store app-owned human approval                                | sensitive/destructive writes |
| `execute`  | perform mutation after re-checking authz and policy           | every write                  |
| `audit`    | record who did what, from where, and why                      | every write                  |
| `undo`     | restore soft-deleted or reversible state                      | reversible writes            |

Apps can then choose one of these flows:

```txt
read:
  authz -> query

low-risk write:
  authz -> policy -> execute -> audit

previewable low-risk write:
  authz -> policy -> preview -> execute -> audit

reversible soft delete:
  authz -> policy -> preview -> execute -> audit -> undo available

sensitive/destructive write:
  authz -> policy -> preview -> request approval -> human approves -> execute -> audit

blocked write:
  authz -> policy -> blocked response with reason and next action
```

The API should make this explicit in the tool result:

```ts
type McpActionStatus = 'ready' | 'executed' | 'waiting_for_approval' | 'blocked'

type McpActionSafety = {
  riskLevel: 'read' | 'low' | 'approval_required'
  requiresApproval: boolean
  reversible: boolean
  approvalReason: string | null
  undoTool?: {
    tool: string
    arguments: Record<string, unknown>
  }
}
```

This keeps the protocol flexible while preserving one source of truth: Convex decides the policy, not the agent.

### Risk Policy

Convex should classify each MCP operation with a small explicit policy. Do not infer this in the agent and do not rely on the MCP client UI.

```ts
type McpRiskLevel = 'read' | 'low' | 'approval_required'

type McpOperationPolicy = {
  operation: string
  riskLevel: McpRiskLevel
  requiresApproval: boolean
  reason: string
}
```

Recommended defaults:

| Operation shape                      | Example                                          | Default                   |
| ------------------------------------ | ------------------------------------------------ | ------------------------- |
| Read-only                            | list projects, read notes                        | no approval               |
| Additive, reversible write           | create personal note, create project             | no approval               |
| Single-user soft delete              | archive my own personal note                     | no approval if restorable |
| Organization destructive write       | delete project, revoke member, delete credential | app approval              |
| Irreversible or external side effect | hard delete, billing change, email blast         | app approval              |
| Permission or auth change            | change roles, create admin service actor         | app approval              |
| Cross-tenant or ambiguous scope      | any uncertain operation                          | block or require approval |

Example low-risk direct delete:

```txt
notes.delete.soft
```

This can execute without app approval when all of these are true:

- The note belongs to the authenticated user or the service actor's personal workspace.
- The delete is a soft delete, not a hard delete.
- The note can be restored for a defined retention period.
- The operation has no cross-user, billing, permission, or external side effects.
- Convex writes an audit event.
- Convex rate limits the tool.

If any condition fails, the same operation becomes `approval_required` or `blocked`.

This keeps the system practical: agents can clean up personal data quickly, but the app still forces the slow path for actions that can hurt a team or become impossible to recover.

### Tool Shape

For the starter demo, expose these MCP tools for projects:

```txt
projects.list
projects.create.preview
projects.create
projects.delete.preview
projects.delete.requestApproval
projects.delete.execute
approvals.get
```

This is an example composition, not a required global shape. Other domains can use fewer or more blocks:

```txt
notes.list
notes.delete.preview
notes.delete.soft
notes.restore

members.remove.preview
members.remove.requestApproval
members.remove.execute

billing.planChange.preview
billing.planChange.requestApproval
billing.planChange.execute
```

Optional later:

```txt
approvals.listPending
approvals.reject
```

### Annotations

Use annotations as client hints only:

```ts
projects.list:
  readOnlyHint: true
  destructiveHint: false
  openWorldHint: false

projects.create.preview:
  readOnlyHint: true
  destructiveHint: false
  openWorldHint: false

projects.create:
  readOnlyHint: false
  destructiveHint: false
  idempotentHint: false
  openWorldHint: false

projects.delete.preview:
  readOnlyHint: true
  destructiveHint: false
  openWorldHint: false

projects.delete.requestApproval:
  readOnlyHint: false
  destructiveHint: false
  idempotentHint: true when requestKey is provided
  openWorldHint: false

projects.delete.execute:
  readOnlyHint: false
  destructiveHint: true
  idempotentHint: false
  openWorldHint: false
```

### Preview Contract

Preview tools are read-only Convex queries. They use the same server-side authz and tenant scope checks as execution, but they do not mutate.

Example `projects.delete.preview` result:

```ts
type McpActionPreview =
  | {
      status: 'ready'
      operation: 'projects.delete'
      requiresApproval: true
      canRequestApproval: true
      canExecute: false
      resource: {
        type: 'project'
        id: string
        label: string
        organizationId: string
      }
      actor: {
        type: 'serviceActor'
        id: string
        role: 'admin'
      }
      effects: Array<{
        type: 'delete' | 'audit'
        table: 'projects' | 'auditEvents'
        id?: string
        label?: string
        action?: string
      }>
      warnings: string[]
      nextActions: Array<{
        tool: string
        arguments: Record<string, unknown>
      }>
    }
  | {
      status: 'blocked'
      operation: 'projects.delete'
      reason:
        | 'mcp_server_unauthorized'
        | 'service_actor_denied'
        | 'insufficient_role'
        | 'project_not_found'
        | 'rate_limited'
      message: string
      retryAfterMs?: number
      nextActions: Array<{
        tool?: string
        message: string
      }>
    }
```

Example response:

```json
{
  "status": "ready",
  "operation": "projects.delete",
  "requiresApproval": true,
  "canRequestApproval": true,
  "canExecute": false,
  "resource": {
    "type": "project",
    "id": "project_123",
    "label": "Launch Plan",
    "organizationId": "org_123"
  },
  "actor": {
    "type": "serviceActor",
    "id": "actor_123",
    "role": "admin"
  },
  "effects": [
    {
      "type": "delete",
      "table": "projects",
      "id": "project_123",
      "label": "Launch Plan"
    },
    {
      "type": "audit",
      "table": "auditEvents",
      "action": "projects.delete"
    }
  ],
  "warnings": [],
  "nextActions": [
    {
      "tool": "projects.delete.requestApproval",
      "arguments": {
        "projectId": "project_123",
        "requestKey": "optional-agent-generated-idempotency-key"
      }
    }
  ]
}
```

### Approval Request Contract

`projects.delete.requestApproval` creates a durable approval request in Convex. It is not the approval itself.

Input:

```ts
{
  projectId: Id<'projects'>
  requestKey?: string
  reason?: string
}
```

Output:

```ts
{
  approvalRequestId: Id<'approvals'>
  status: 'pending'
  message: string
  preview: McpActionPreview
  approvalUrl?: string
  expiresAt: number
}
```

The `requestKey` is optional but recommended. If supplied, Convex treats it as an idempotency key scoped to:

```txt
organizationId + serviceActorId + operation + projectId + requestKey
```

Repeated calls return the same pending approval request instead of creating duplicates.

### Human Approval Contract

The human approves inside the app, not in chat.

The starter UI should show:

- Operation: `projects.delete`
- Project name and id
- Organization
- Requesting service actor
- Requested reason
- Effects
- Expiry
- Approve / reject buttons

Convex mutation:

```ts
approvals.approve({
  approvalRequestId,
})
```

Rules:

- Caller must be active organization owner/admin.
- Approval must be pending.
- Approval must not be expired.
- Approval operation/resource must still match a real resource in the org.
- Approval stores `approvedBy`, `approvedAt`, and a snapshot of what was approved.

Reject:

```ts
approvals.reject({
  approvalRequestId,
  reason?: string
})
```

Reject is useful but not required for the first implementation.

### Execute Contract

The agent executes only after approval:

```ts
projects.delete.execute({
  projectId,
  approvalId,
})
```

Convex re-checks all invariants:

- `MCP_SERVER_SECRET` is valid.
- Bearer token maps to active credential.
- Service actor is active.
- Service actor role is `admin`.
- Project exists.
- Project belongs to the credential organization.
- Approval exists.
- Approval belongs to the same organization.
- Approval operation is exactly `projects.delete`.
- Approval resource id matches `projectId`.
- Approval status is `approved`.
- Approval is not expired.
- Approval has not been used.

Then Convex:

- Deletes or soft-deletes the project.
- Marks approval `used`.
- Writes audit event with actor, operation, resource, approval id, and timestamp.

### Hard Delete vs Soft Delete

For the starter, use soft delete by default:

```ts
projects.status: 'active' | 'deleted'
projects.deletedAt?: number
projects.deletedBy?: { kind: 'serviceActor'; serviceActorId: Id<'serviceActors'> }
```

Why:

- Safer demo.
- Easier restore story.
- Better OSS starter ergonomics.
- Still teaches the approval pattern.

Hard delete can be documented as a production variant.

If we keep hard delete for now, the approval pattern still works, but the demo is less forgiving.

## Data Model Changes

Current approval records are only `approved | used`. Change to:

```ts
approvals: {
  organizationId: Id<'organizations'>
  operation: 'projects.delete'
  resourceId: Id<'projects'>
  status: 'pending' | 'approved' | 'rejected' | 'used'
  requestedBy: {
    kind: 'serviceActor'
    serviceActorId: Id<'serviceActors'>
  }
  requestedReason?: string
  requestKey?: string
  preview: {
    resourceLabel: string
    effects: Array<{
      type: 'delete' | 'audit'
      table: string
      id?: string
      label?: string
      action?: string
    }>
  }
  approvedBy?: Id<'users'>
  rejectedBy?: Id<'users'>
  rejectionReason?: string
  expiresAt: number
  createdAt: number
  approvedAt?: number
  rejectedAt?: number
  usedAt?: number
}
```

Indexes:

```ts
.index('by_operation_resource', ['operation', 'resourceId'])
.index('by_org_status', ['organizationId', 'status'])
.index('by_request_key', ['organizationId', 'operation', 'resourceId', 'requestKey'])
```

`expired` should be treated as an effective status derived from `expiresAt`, not as a second stored source of truth. Pending approval lists should filter out rows where `expiresAt <= Date.now()`.

Use `requestKey` only when supplied. A supplied `requestKey` identifies one approval request permanently. If the existing request is pending and unexpired, return it. If it is expired, rejected, or used, return a blocked response telling the agent to create a new request with a new `requestKey`; do not insert a duplicate row for the same key.

If Convex index constraints make optional keys awkward, create a separate `approvalRequestKey` string:

```ts
approvalRequestKey?: string
```

where the value is a deterministic concatenation/hash.

## Shared Policy Function

Avoid preview and execute drifting apart. Put shared decision logic in one helper:

```ts
async function evaluateProjectDelete(ctx, args) {
  requireMcpServerCall(args.serverSecret)
  const { actor, organizationId } = await requireServiceActor(ctx, {
    bearerToken: args.bearerToken,
    minimumRole: 'admin',
  })

  const project = await ctx.db.get(args.projectId)
  if (!project || project.organizationId !== organizationId) {
    return blocked('project_not_found', 'Project not found')
  }

  return {
    status: 'ready',
    operation: 'projects.delete',
    requiresApproval: true,
    resource: {
      type: 'project',
      id: project._id,
      label: project.name,
      organizationId,
    },
    actor: {
      type: 'serviceActor',
      id: actor._id,
      role: actor.role,
    },
    effects: [
      { type: 'delete', table: 'projects', id: project._id, label: project.name },
      { type: 'audit', table: 'auditEvents', action: 'projects.delete' },
    ],
    warnings: [],
    nextActions: [
      {
        tool: 'projects.delete.requestApproval',
        arguments: { projectId: project._id },
      },
    ],
  }
}
```

Preview returns this decision.

Request approval stores this decision snapshot.

Execute re-runs this decision and then checks the approval.

## MCP Tool Results

Return both structured content and text. MCP supports `structuredContent`, but text keeps compatibility.

Example:

```ts
return {
  structuredContent: preview,
  content: [
    {
      type: 'text',
      text: [
        `Preview: delete project "${preview.resource.label}".`,
        `Requires approval from an organization admin.`,
        `Next: call projects.delete.requestApproval with projectId ${preview.resource.id}.`,
      ].join('\n'),
    },
  ],
}
```

This matters because not every MCP client renders structured data well, but agents can still read the text.

## Tool Naming

Use explicit names:

```txt
projects.delete.preview
projects.delete.requestApproval
projects.delete.execute
```

Avoid overloading one `projects.delete` tool with `mode: 'preview' | 'execute'`. Separate tools make agent planning clearer and reduce accidental destructive calls.

## Agent Feedback Principles

Every MCP tool should return actionable next steps.

Bad:

```txt
Approval required.
```

Good:

```json
{
  "status": "waiting_for_approval",
  "message": "A human organization admin must approve this deletion in the app.",
  "approvalRequestId": "approval_123",
  "approvalUrl": "https://app.example.com/approvals/approval_123",
  "nextActions": [
    {
      "tool": "approvals.get",
      "arguments": { "approvalRequestId": "approval_123" }
    }
  ]
}
```

Blocked results should name the policy reason:

```json
{
  "status": "blocked",
  "reason": "insufficient_role",
  "message": "This service actor needs admin role to request project deletion.",
  "nextActions": [
    {
      "message": "Use an admin service actor or ask an organization admin to delete the project."
    }
  ]
}
```

This creates the tight feedback loop: agents can self-correct without guessing.

## Before / After

### Current Flow

```txt
agent -> projects.delete(projectId, approvalId)
Convex -> verify approval -> delete
```

Secure, but incomplete from the agent's point of view. The agent must somehow get an approval id outside the MCP workflow.

### Proposed Flow

```txt
agent -> projects.delete.preview(projectId)
Convex -> returns exact impact and next action

agent -> projects.delete.requestApproval(projectId, reason, requestKey)
Convex -> stores pending approval request and returns approvalUrl

human -> approves in app
Convex -> marks approval approved

agent -> projects.delete.execute(projectId, approvalId)
Convex -> re-checks policy, consumes approval, deletes, audits
```

## Why Not Just Chat Confirmation?

Chat confirmation is acceptable for low-risk actions. It is not enough for destructive B2B actions because the app cannot verify:

- what the user saw,
- which exact resource was shown,
- who approved inside the app's org model,
- whether the confirmation was skipped by another client,
- whether the approval is auditable later.

The app-owned approval record solves those issues.

## Why Not Use MCP Elicitation?

Use elicitation when available, but do not depend on it.

Reasons:

- Clients must support the capability.
- The UI is client-defined.
- It should not request sensitive information.
- It still does not replace app-owned authorization and audit.

Recommended stance:

- MCP elicitation can improve UX.
- Convex approval remains the authority.

## Why Not Build A Generic Workflow Engine?

Too much abstraction for the starter.

Implement one concrete pattern for `projects.delete`:

- preview,
- request approval,
- approve in app,
- execute,
- audit.

If users need more, they can copy the pattern.

## Implementation Plan

### Phase 1: Backend Approval State

- Extend `approvals` schema to support `pending`, `approved`, `rejected`, and `used`.
- Add request metadata: `requestedBy`, `requestedReason`, `requestKey`, `preview`.
- Keep `operation` constrained to `'projects.delete'`.
- Add indexes for pending org approvals and idempotent request keys.
- Treat expiry as derived from `expiresAt`; do not store a separate `expired` status.

### Phase 2: Shared Delete Evaluator

- Add a Convex helper for `evaluateProjectDelete`.
- Use it from preview, request approval, and execute.
- Ensure execute re-checks current state and does not trust stored preview.

### Phase 3: MCP Tools

- Add:
  - `projects.delete.preview`
  - `projects.delete.requestApproval`
  - `projects.delete.execute`
  - `approvals.get`
- Keep annotations precise.
- Return structured content and text content.
- Keep `projects.delete.execute` as the only destructive tool.

### Phase 4: App UI

- Add an approvals panel to the MCP starter.
- Show pending deletion requests for org admins.
- Show preview snapshot and current project state.
- Add approve/reject actions.
- Show used/expired state after execution.

### Phase 5: Tests

- Preview is read-only and returns exact effects.
- Request approval creates pending approval and is idempotent with `requestKey`.
- Non-admin service actor cannot request delete approval.
- Non-admin human cannot approve.
- Cross-org human cannot approve.
- Execute without approved approval fails.
- Execute with approved approval succeeds.
- Execute re-checks project org and actor role after approval.
- Expired/rejected/used approval fails.
- Audit event includes approval id.
- MCP tools return structured next actions.

## Acceptance Criteria

- An agent can discover the correct next step from tool output without guessing.
- A human can approve destructive MCP requests inside the app.
- Convex can prove who requested, who approved, what was approved, and what executed.
- No destructive tool relies only on chat confirmation.
- Preview and execute share policy logic.
- Browser demo shows the full lifecycle at least once:
  - create service actor,
  - create project through MCP,
  - preview delete,
  - request approval,
  - approve in app,
  - execute delete through MCP,
  - observe audit/used approval.

## Open Questions

- Should project delete be soft delete in the starter? Recommended: yes.
- Should approval requests expire after 5 minutes or 15 minutes? Recommended: 5 minutes for the starter.
- Should `requestApproval` require service actor `admin`, or can `member` request and only `admin` execute? Recommended: require `admin` for delete request and execute to keep policy simple.
- Should `approvals.get` be callable by service actors? Recommended: yes, but scoped to approval requests created by the same service actor credential organization.

## References

- MCP Tools specification: https://modelcontextprotocol.io/specification/2025-11-25/server/tools
- MCP Elicitation specification: https://modelcontextprotocol.io/specification/2025-06-18/client/elicitation
- MCP Schema reference for tool annotations: https://modelcontextprotocol.io/specification/2025-06-18/schema
- OpenAI Apps SDK tool planning: https://developers.openai.com/apps-sdk/plan/tools
- OpenAI app submission guidelines: https://developers.openai.com/apps-sdk/app-submission-guidelines
- OpenAI Apps SDK security and privacy: https://developers.openai.com/apps-sdk/guides/security-privacy
- Front MCP destructive approval convention: https://dev.frontapp.com/docs/mcp-server
- Terraform plan command: https://developer.hashicorp.com/terraform/cli/commands/plan
- Kubernetes server-side dry-run: https://knative.dev/development/serving/dryrun/
- Stripe idempotency: https://docs.stripe.com/api/idempotent_requests
