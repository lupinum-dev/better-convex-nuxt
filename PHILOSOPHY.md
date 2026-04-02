Philosophy
Vue taught us that APIs should feel like they disappear. You don't "use Vue" — you just write components and they're reactive. Vite taught us the build tool should be invisible. Nuxt taught us that conventions eliminate decisions that don't matter.
Radix taught us something different: give people unstyled, accessible primitives that handle the hard parts, then get out of the way. Shadcn said: don't even install it as a dependency — copy it, own it, change it.
better-convex-nuxt tries to be both at once.
The four principles
Structural safety. The API shape makes unsafe things hard to express — not just documented as "don't do this." A handler without a guard is a type error, not a code review catch. A public endpoint says guard: open, not nothing. Tenant isolation is declared once, not checked in every query. The absence of a security decision is visible, not silent.
Composable primitives. defineActor, defineGuard, defineHandler, defineCapabilities, defineRedaction, definePermissionContext, defineArgs — each does one thing and composes with everything. On the frontend, useConvexQuery, useConvexMutation, usePermissions, useConvexAuth follow the same rule. Use one. Use all of them. They don't know about each other, and they don't need to.
Owned code. Your actor resolution is yours. Your permission checks are yours. Your shared schemas are yours. The module provides the hard primitives — auth wiring, real-time subscriptions, SSR hydration, trusted caller detection, MCP protocol handling. The meaning of your data model, your roles, your business rules? That's your code, not our config.
Progressive disclosure. A public todo app is one config line and a few composables. Adding auth is one more config flag. Adding tenant isolation is one declaration. Adding MCP tools is one more module. Adding visibility rules, redaction, share tokens, plan entitlements — each is a primitive you reach for when you need it. Nothing in between feels like a cliff, because each layer is additive.
What this means in practice
On the backend, the handler body is business logic. Everything else — who's calling, can they do this, does this resource exist, does it belong to their tenant, what can the frontend do with the result — lives in the function signature.
On the frontend, the page is UI logic. Auth state, permission checks, real-time subscriptions, optimistic updates — those are composables that disappear into your <script setup>.
On the server, Nitro routes call the same Convex queries and mutations as the browser — with the same permission checks, through the same actor pipeline. No duplicated access logic.
In tests, you seed a tenant, name your users, and assert the authorization boundary. The test reads like a spec, not like infrastructure.
Across MCP tools, the same shared schemas and permission checks apply. An AI agent hitting your MCP endpoint goes through the same safety pipeline as a browser user clicking a button.
The test
Pick any file in your app. You should be able to answer these questions without reading other files:

- A handler: Who can call this? What does it check? What does it return?
- A page: What data does it need? What permissions gate the UI?
- A test: What's the scenario? What's the boundary being proven?
- An MCP tool: What does it do? Who's allowed? Is it destructive?
  If you can answer from the file itself, the design is working. If you need to chase through three other files to understand the safety story, something belongs in the signature that's hiding in the implementation
