# ADR: minimal Vue MCP App lifecycle admission

- Status: accepted for experimental implementation
- Date checked: 2026-07-22
- Extension basis: MCP Apps `2026-01-26`
- SDK basis: exact `@modelcontextprotocol/ext-apps@1.7.4`
- Decision task: `P7-001`

## Decision

Admit one optional `better-convex-vue/mcp-app` entry and one composable,
`useMcpApp()`. It will own the official `App` instance's Vue mount/unmount
lifecycle and project official host notifications into non-deep reactive,
structured-clone-safe state.

The composable returns the raw, non-reactive official `App` instance for
`callServerTool`, `openLink`, `sendMessage`, resource reads, display requests,
and app-local tool registration. Better Convex will not wrap or rename those
methods.

Candidate shape for implementation proof:

```ts
const mcp = useMcpApp({
  implementation: { name: 'notes-dashboard', version: '0.1.0' },
  capabilities: {},
})

// Official SDK method; no Better Convex tool-call abstraction.
await mcp.app.callServerTool({ name: 'search_notes', arguments: query })

type McpAppLifecycle = {
  app: App
  phase: Readonly<Ref<'idle' | 'connecting' | 'ready' | 'error' | 'closed'>>
  hostCapabilities: Readonly<ShallowRef<McpUiHostCapabilities | undefined>>
  hostContext: Readonly<ShallowRef<McpUiHostContext | undefined>>
  hostVersion: Readonly<ShallowRef<Implementation | undefined>>
  toolInput: Readonly<ShallowRef<McpUiToolInputNotification['params'] | undefined>>
  toolInputPartial: Readonly<ShallowRef<McpUiToolInputPartialNotification['params'] | undefined>>
  toolResult: Readonly<ShallowRef<McpUiToolResultNotification['params'] | undefined>>
  toolCancelled: Readonly<ShallowRef<McpUiToolCancelledNotification['params'] | undefined>>
}
```

Names remain experimental until the exact package and two consumers pass. The
implementation may reduce the return shape when tests show a field is redundant;
it must not add more surface without another admission result.

## Exact authority

Registry and repository checks on 2026-07-22 show:

```text
@modelcontextprotocol/ext-apps latest: 1.7.4
published: 2026-06-05
package.json SHA-256: 5f238c430e0c3a62f8be2a918a05da0d09ccf369b695d85237afd92a81f194df
app.js SHA-256: 5d73952817a00799fdca8ed96b6d693da5b7005e1a8871f0aab3864359c4dc8b
app.d.ts SHA-256: 7b2fda78a2914c9baba53496f1dbac3ae5baeb94bf5b1e4f4520c5b3eb0a4b19
```

MCP Apps is an official extension. The framework-neutral SDK exports `App`,
`PostMessageTransport`, the notification/context types, theme helpers, and
host-bound operations. It provides React hooks but no Vue lifecycle entry. Its
official Vue example constructs the App on mount and does not close it on Vue
scope disposal.

The Apps server helper is peer-coupled to combined
`@modelcontextprotocol/sdk@^1.29.0`, while `@better-convex/mcp` uses split
`@modelcontextprotocol/server@2.0.0-beta.5`. Do not import the server helper,
cast between majors, ship both server runtimes, or add a compatibility wrapper.
Server-side Apps metadata remains direct official v2 registration until an
official compatible helper exists. `P7-004` must record that hard cut rather
than forcing its originally illustrative “adapter” wording.

## Repeated consumer need

The neutral notes dashboard already proves the complete lifecycle against the
deployed Convex topology. It needs current tool input/result, host context,
host-mediated `search_notes`, optional external navigation, repeated mounts,
and exact teardown.

Ginko's canonical publish flow provides a materially different consumer. Its
existing `preview-publish`, `request-publish-review`, and `get-review-status`
operations expose current publish impact and a human-owned review queue. A
read-only publish-impact App needs the same bridge lifecycle, validated tool
result projection, host context, host-mediated status refresh, and optional
navigation to the authenticated queue. It must not publish or approve.

Neither consumer needs a direct Convex client, bearer token, Better Auth
session, approval protocol, or application permission abstraction in the
iframe.

## Direct official SDK comparison

The official SDK already owns and Better Convex must reuse directly:

- app/host initialization and the postMessage transport;
- host capability and context types;
- tool input, partial input, result, cancellation, and teardown notifications;
- server tool/resource calls, messages, links, downloads, display modes, and
  app-local tools;
- CSP-compatible parsing and protocol error behavior;
- theme/font/style application helpers.

The direct SDK intentionally does not own:

- Vue mount and scope disposal;
- readonly Vue refs for changing host/tool state;
- retirement of callbacks after component disposal;
- projection of Vue reactive proxies into structured-cloneable values.

Those four gaps are the admitted Vue integration. The private probe found a
real `DataCloneError` when a Vue proxy crossed App Bridge, and proved that an
allowlisting host must re-project app-originated calls rather than forward the
received envelope.

## Public API admission test

1. **Can code be deleted?** Yes. Both Apps otherwise repeat constructor,
   listener setup, connect state, host-state synchronization, listener removal,
   and close behavior.
2. **Can the official SDK solve it directly?** It supplies every protocol
   operation but has no Vue lifecycle integration. Its Vue example demonstrates
   the repeated glue and omits scope cleanup.
3. **Two consumers?** Neutral notes and Ginko publish-impact/review-status have
   distinct domains and authority models but require the same iframe lifecycle.
4. **One source of truth?** The official `App` remains the protocol owner. Refs
   are disposable projections of current official notifications.
5. **Derived-state rebuild story?** A fresh mount creates a fresh App and refs;
   unmount removes listeners, closes the App exactly once, and retires late
   callbacks.
6. **Authorization owner?** The host mediates requests and the MCP server
   re-verifies the bearer plus current application authority. Vue state grants
   nothing.
7. **Invalid states?** Methods remain official; the wrapper exposes one phase,
   a raw non-reactive App, and readonly shallow projections. It never exposes a
   Convex client or token.
8. **Persistent mechanism?** None. No table, cache, worker, registry, plugin,
   global singleton, or background job is added.
9. **Failure model?** Connect/protocol failure moves the lifecycle to `error`
   without exposing a raw cause. Official operation results/errors stay official
   and application code handles domain failures.
10. **Packed proof?** The subpath must be installed from the exact Vue tarball in
    production Vite Apps for both consumers before stabilization.

## Rejected surface

- Separate `useMcpToolInput`, `useMcpToolResult`, and `useMcpHostContext`
  composables: one App lifecycle does not justify provide/inject or multiple
  lookup APIs.
- Wrapped `callTool`, `openLink`, `sendMessage`, resource, display, or download
  methods: official methods already define the contract.
- An MCP App Vue plugin: each iframe root owns one local App; no application-wide
  runtime is needed.
- Automatic theme mutation: consumers may compose the official theme helpers;
  the lifecycle only exposes current context.
- Raw error causes, messages, stacks, bridge transcripts, or diagnostics in Vue
  state.
- Direct Convex or Better Auth attachment inside the iframe.
- A host/sandbox implementation in the Vue package. Hosts own sandboxing; Better
  Convex tests it but does not become a general MCP host SDK.
- React compatibility, server registration wrappers, protocol-version adapters,
  or v1/v2 casts.

## Consequences

`P7-002` may add the optional entry with an exact Apps dependency without
changing the ordinary `better-convex-vue` dependency graph or main bundle.
`P7-003` proves lifecycle behavior before examples migrate. If implementation
requires more than this narrow surface, stop and amend this decision with
executed evidence rather than adding convenience APIs.
