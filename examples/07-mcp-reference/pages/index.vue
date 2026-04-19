<template>
  <div
    class="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(14,165,233,0.12),_transparent_35%),radial-gradient(circle_at_bottom_right,_rgba(245,158,11,0.14),_transparent_30%),linear-gradient(180deg,_#f8fafc_0%,_#eef2ff_100%)] p-6"
  >
    <div class="mx-auto flex max-w-7xl flex-col gap-6">
      <UCard>
        <template #header>
          <div class="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div class="space-y-2">
              <p class="text-xs font-black uppercase tracking-[0.28em] text-sky-700">Example 07</p>
              <h1 class="text-3xl font-black tracking-tight text-slate-950">MCP Reference</h1>
              <p class="max-w-3xl text-sm leading-6 text-slate-600">
                The complete MCP example: public and scoped tools, destructive previews, result
                envelopes, prompts, resources, sessions, dynamic per-session tools, code mode, and a
                real hashed MCP key flow.
              </p>
            </div>

            <div class="grid gap-2 text-sm text-slate-600 md:grid-cols-2">
              <div class="rounded-2xl border border-slate-200 bg-white/80 px-4 py-3">
                <p class="font-semibold text-slate-900">Default endpoint</p>
                <code class="text-xs">{{ endpointBase }}/mcp</code>
              </div>
              <div class="rounded-2xl border border-slate-200 bg-white/80 px-4 py-3">
                <p class="font-semibold text-slate-900">Code mode endpoint</p>
                <code class="text-xs">{{ endpointBase }}/mcp/runbook-agent</code>
              </div>
            </div>
          </div>
        </template>

        <div class="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
          <div class="space-y-6">
            <UCard>
              <template #header>
                <div class="flex items-center justify-between gap-3">
                  <div>
                    <h2 class="text-lg font-semibold text-slate-950">Public MCP surface</h2>
                    <p class="text-sm text-slate-600">
                      These runbooks are visible through unauthenticated MCP tools and resources.
                    </p>
                  </div>
                  <UBadge color="info" variant="soft">No auth required</UBadge>
                </div>
              </template>

              <div v-if="publicPending" class="space-y-3">
                <USkeleton v-for="n in 2" :key="n" class="h-20 w-full rounded-2xl" />
              </div>
              <div v-else class="grid gap-3">
                <div
                  v-for="runbook in publicRunbooks"
                  :key="runbook._id"
                  class="rounded-2xl border border-slate-200 bg-white/90 p-4"
                >
                  <div class="flex items-start justify-between gap-3">
                    <div>
                      <h3 class="font-semibold text-slate-950">{{ runbook.title }}</h3>
                      <p class="mt-1 text-sm text-slate-600">{{ runbook.summary }}</p>
                    </div>
                    <UBadge color="success" variant="subtle">{{ runbook.visibility }}</UBadge>
                  </div>
                  <div class="mt-3 flex flex-wrap gap-2">
                    <UBadge
                      v-for="tag in runbook.tags"
                      :key="`${runbook._id}-${tag}`"
                      color="neutral"
                      variant="soft"
                    >
                      {{ tag }}
                    </UBadge>
                  </div>
                </div>
                <p v-if="!publicRunbooks?.length" class="text-sm text-slate-500">
                  No public runbooks yet. Create a workspace to seed the defaults.
                </p>
              </div>
            </UCard>

            <ConvexAuthLoading>
              <UCard>
                <div class="space-y-3">
                  <p class="text-sm text-slate-600">Checking your session…</p>
                  <USkeleton class="h-28 w-full rounded-2xl" />
                </div>
              </UCard>
            </ConvexAuthLoading>

            <ConvexUnauthenticated>
              <div class="grid gap-4 lg:grid-cols-2">
                <UCard>
                  <UAuthForm
                    :schema="signUpSchema"
                    title="Create account"
                    description="Sign up, create a workspace, then issue MCP keys from the app."
                    icon="i-lucide-user-plus"
                    :fields="signUpFields"
                    :submit="{ label: 'Sign up', block: true }"
                    :loading="authAction.pending.value"
                    @submit="handleSignUp"
                  >
                    <template #validation>
                      <UAlert
                        v-if="authAction.error.value"
                        color="error"
                        variant="soft"
                        icon="i-lucide-circle-alert"
                        title="Authentication error"
                        :description="authAction.error.value.message"
                      />
                    </template>
                  </UAuthForm>
                </UCard>

                <UCard>
                  <UAuthForm
                    :schema="signInSchema"
                    title="Sign in"
                    description="Load the workspace-scoped runbook dashboard and MCP key manager."
                    icon="i-lucide-log-in"
                    :fields="signInFields"
                    :submit="{ label: 'Sign in', block: true, color: 'neutral', variant: 'soft' }"
                    :loading="authAction.pending.value"
                    @submit="handleSignIn"
                  >
                    <template #validation>
                      <UAlert
                        v-if="authAction.error.value"
                        color="error"
                        variant="soft"
                        icon="i-lucide-circle-alert"
                        title="Authentication error"
                        :description="authAction.error.value.message"
                      />
                    </template>
                  </UAuthForm>
                </UCard>
              </div>
            </ConvexUnauthenticated>

            <ConvexAuthenticated>
              <div class="space-y-6">
                <UCard>
                  <template #header>
                    <div class="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                      <div>
                        <h2 class="text-xl font-semibold text-slate-950">{{ displayName }}</h2>
                        <p class="mt-1 text-sm text-slate-600">
                          Role:
                          <span class="font-semibold text-slate-900">{{
                            permissionsPending ? 'loading…' : role || 'no workspace yet'
                          }}</span>
                          <span v-if="tenantId"> · Workspace ID: {{ tenantId }}</span>
                        </p>
                      </div>

                      <UButton
                        type="button"
                        color="neutral"
                        variant="ghost"
                        trailing-icon="i-lucide-log-out"
                        @click="handleSignOut"
                      >
                        Sign out
                      </UButton>
                    </div>
                  </template>

                  <UAlert
                    v-if="appError"
                    color="error"
                    variant="soft"
                    icon="i-lucide-circle-alert"
                    title="Example error"
                    :description="appError"
                  />

                  <UAlert
                    v-if="!permissionsPending && !ready"
                    color="warning"
                    variant="soft"
                    icon="i-lucide-triangle-alert"
                    title="Account setup incomplete"
                    description="Your browser session is active, but the example could not load your workspace context yet. Sign out and sign back in once to rebuild the app user row."
                  />

                  <template v-if="ready && !tenantId">
                    <div class="grid gap-4 lg:grid-cols-2">
                      <UCard>
                        <template #header>
                          <h3 class="text-lg font-semibold">Create workspace</h3>
                          <p class="mt-1 text-sm text-slate-600">
                            The creator becomes owner and gets seeded runbooks for the MCP demos.
                          </p>
                        </template>

                        <form class="space-y-4" @submit.prevent="handleCreateWorkspace">
                          <div class="space-y-1">
                            <label class="text-sm font-medium text-slate-900">Name</label>
                            <UInput v-model="createWorkspaceForm.name" required />
                          </div>

                          <div class="space-y-1">
                            <label class="text-sm font-medium text-slate-900">Slug</label>
                            <UInput v-model="createWorkspaceForm.slug" required />
                          </div>

                          <UButton type="submit" block :loading="createWorkspace.pending.value">
                            Create workspace
                          </UButton>
                        </form>
                      </UCard>

                      <UCard>
                        <template #header>
                          <h3 class="text-lg font-semibold">Join workspace</h3>
                          <p class="mt-1 text-sm text-slate-600">
                            Join an existing workspace to test role-aware MCP visibility.
                          </p>
                        </template>

                        <form class="space-y-4" @submit.prevent="handleJoinWorkspace">
                          <div class="space-y-1">
                            <label class="text-sm font-medium text-slate-900">Workspace slug</label>
                            <UInput v-model="joinWorkspaceForm.slug" required />
                          </div>

                          <div class="space-y-1">
                            <label class="text-sm font-medium text-slate-900">Role</label>
                            <USelect
                              v-model="joinWorkspaceForm.role"
                              :items="workspaceRoleOptions"
                            />
                          </div>

                          <UButton
                            type="submit"
                            block
                            color="neutral"
                            variant="soft"
                            :loading="joinWorkspace.pending.value"
                          >
                            Join workspace
                          </UButton>
                        </form>
                      </UCard>
                    </div>

                    <UCard v-if="workspaceOptions?.length">
                      <template #header>
                        <h3 class="text-lg font-semibold">Existing workspaces</h3>
                      </template>

                      <ul class="space-y-2">
                        <li
                          v-for="workspace in workspaceOptions"
                          :key="workspace._id"
                          class="flex items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white/90 px-4 py-3"
                        >
                          <span class="font-medium text-slate-900">{{ workspace.name }}</span>
                          <span class="text-sm text-slate-500">{{ workspace.slug }}</span>
                        </li>
                      </ul>
                    </UCard>
                  </template>

                  <template v-if="tenantId">
                    <div class="grid gap-6 2xl:grid-cols-[1.1fr_0.9fr]">
                      <div class="space-y-6">
                        <UCard>
                          <template #header>
                            <div class="flex items-start justify-between gap-3">
                              <div>
                                <h3 class="text-lg font-semibold">Workspace runbooks</h3>
                                <p class="mt-1 text-sm text-slate-600">
                                  These are the records the scoped MCP tools manipulate.
                                </p>
                              </div>
                              <UBadge v-if="canCreateRunbook" color="success" variant="soft">
                                Create allowed
                              </UBadge>
                            </div>
                          </template>

                          <form
                            class="grid gap-3 rounded-2xl border border-slate-200 bg-white/90 p-4"
                            @submit.prevent="handleCreateRunbook"
                          >
                            <UInput
                              v-model="createRunbookForm.title"
                              placeholder="Runbook title"
                              :disabled="!canCreateRunbook"
                              required
                            />
                            <UInput
                              v-model="createRunbookForm.summary"
                              placeholder="One-line summary"
                              :disabled="!canCreateRunbook"
                              required
                            />
                            <UTextarea
                              v-model="createRunbookForm.content"
                              :rows="6"
                              :disabled="!canCreateRunbook"
                            />
                            <div class="grid gap-3 md:grid-cols-[1fr_1fr]">
                              <USelect
                                v-model="createRunbookForm.visibility"
                                :items="visibilityOptions"
                                :disabled="!canCreateRunbook"
                              />
                              <UInput
                                v-model="createRunbookForm.tags"
                                placeholder="incident, ops, release"
                                :disabled="!canCreateRunbook"
                              />
                            </div>
                            <UButton
                              type="submit"
                              :loading="createRunbookMutation.pending.value"
                              :disabled="!canCreateRunbook"
                            >
                              Create runbook
                            </UButton>
                          </form>

                          <div class="mt-4 space-y-3">
                            <div v-if="workspaceRunbooksPending" class="space-y-3">
                              <USkeleton v-for="n in 3" :key="n" class="h-24 w-full rounded-2xl" />
                            </div>

                            <div
                              v-for="runbook in workspaceRunbooks"
                              :key="runbook._id"
                              class="rounded-2xl border border-slate-200 bg-white/90 p-4"
                            >
                              <div
                                class="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between"
                              >
                                <div class="space-y-2">
                                  <div class="flex flex-wrap items-center gap-2">
                                    <h4 class="font-semibold text-slate-950">
                                      {{ runbook.title }}
                                    </h4>
                                    <UBadge color="neutral" variant="soft">{{
                                      runbook.visibility
                                    }}</UBadge>
                                  </div>
                                  <p class="text-sm text-slate-600">{{ runbook.summary }}</p>
                                  <div class="flex flex-wrap gap-2">
                                    <UBadge
                                      v-for="tag in runbook.tags"
                                      :key="`${runbook._id}-${tag}`"
                                      color="neutral"
                                      variant="subtle"
                                    >
                                      {{ tag }}
                                    </UBadge>
                                  </div>
                                </div>

                                <div class="flex flex-wrap gap-2">
                                  <UButton
                                    v-for="visibility in visibilityOptions"
                                    :key="`${runbook._id}-${visibility}`"
                                    size="xs"
                                    color="neutral"
                                    variant="soft"
                                    :disabled="
                                      !runbook._can.update || visibility === runbook.visibility
                                    "
                                    @click="handleSetVisibility(runbook._id, visibility)"
                                  >
                                    {{ visibility }}
                                  </UButton>
                                  <UButton
                                    size="xs"
                                    color="error"
                                    variant="soft"
                                    :disabled="!runbook._can.delete"
                                    @click="handleDeleteRunbook(runbook._id)"
                                  >
                                    Delete
                                  </UButton>
                                </div>
                              </div>
                            </div>
                          </div>
                        </UCard>

                        <UCard>
                          <template #header>
                            <h3 class="text-lg font-semibold">Reference MCP flows</h3>
                            <p class="mt-1 text-sm text-slate-600">
                              The example ships public, scoped, session, dynamic, resource, prompt,
                              and code-mode flows.
                            </p>
                          </template>

                          <div class="grid gap-3 md:grid-cols-2">
                            <div class="rounded-2xl border border-slate-200 bg-white/90 p-4">
                              <p class="text-sm font-semibold text-slate-900">Public tool call</p>
                              <pre class="mt-2 overflow-x-auto text-xs text-slate-700">
curl {{ endpointBase }}/mcp \
  -H 'Content-Type: application/json' \
  -d '{"method":"tools/list","params":{}}'</pre
                              >
                            </div>
                            <div class="rounded-2xl border border-slate-200 bg-white/90 p-4">
                              <p class="text-sm font-semibold text-slate-900">
                                Scoped authenticated call
                              </p>
                              <pre class="mt-2 overflow-x-auto text-xs text-slate-700">
curl {{ endpointBase }}/mcp \
  -H "Authorization: Bearer {{ createdKeySecret || 'mcp_…' }}" \
  -H 'Content-Type: application/json' \
  -d '{"method":"tools/list","params":{}}'</pre
                              >
                            </div>
                          </div>
                        </UCard>
                      </div>

                      <div class="space-y-6">
                        <UCard>
                          <template #header>
                            <div class="flex items-start justify-between gap-3">
                              <div>
                                <h3 class="text-lg font-semibold">MCP keys</h3>
                                <p class="mt-1 text-sm text-slate-600">
                                  Keys are hashed at rest and only shown once after creation.
                                </p>
                              </div>
                              <UBadge :color="canManageMcp ? 'success' : 'warning'" variant="soft">
                                {{ canManageMcp ? 'Manage allowed' : 'Owner or admin only' }}
                              </UBadge>
                            </div>
                          </template>

                          <UAlert
                            v-if="createdKeySecret"
                            color="success"
                            variant="soft"
                            icon="i-lucide-key-round"
                            title="New MCP key"
                            :description="`Copy this now. It will not be shown again: ${createdKeySecret}`"
                          />

                          <form
                            class="mt-4 grid gap-3 rounded-2xl border border-slate-200 bg-white/90 p-4"
                            @submit.prevent="handleCreateMcpKey"
                          >
                            <UInput
                              v-model="createKeyForm.name"
                              placeholder="Key name"
                              :disabled="!canManageMcp"
                              required
                            />
                            <USelect
                              v-model="createKeyForm.boundAuthId"
                              :items="mcpBoundUserOptions"
                              :disabled="!canManageMcp || !mcpBoundUserOptions.length"
                              placeholder="Choose workspace user"
                            />
                            <p v-if="selectedMcpBoundUser" class="text-xs text-slate-500">
                              This key will act as
                              <span class="font-semibold text-slate-700">
                                {{
                                  selectedMcpBoundUser.displayName ||
                                  selectedMcpBoundUser.email ||
                                  selectedMcpBoundUser.authId
                                }}
                              </span>
                              with their live role
                              <span class="font-semibold text-slate-700">{{
                                selectedMcpBoundUser.role
                              }}</span
                              >.
                            </p>
                            <UButton
                              type="submit"
                              :loading="createKey.pending.value"
                              :disabled="!canManageMcp || !selectedMcpBoundUser"
                            >
                              Issue MCP key
                            </UButton>
                          </form>

                          <div class="mt-4 rounded-2xl border border-slate-200 bg-white/90 p-4">
                            <p class="text-sm font-semibold text-slate-900">Verify a key</p>
                            <div class="mt-3 flex gap-3">
                              <UInput
                                v-model="verifyMcpKeyForm.token"
                                class="flex-1"
                                placeholder="Paste mcp_ token"
                              />
                              <UButton
                                color="neutral"
                                variant="soft"
                                :loading="verifyingKey"
                                @click="handleVerifyKey"
                              >
                                Verify
                              </UButton>
                            </div>
                            <UAlert
                              v-if="verifyMessage"
                              class="mt-3"
                              :color="verifyVariant"
                              variant="soft"
                              :description="verifyMessage"
                            />
                          </div>

                          <div class="mt-4 space-y-3">
                            <div
                              v-for="key in mcpKeys"
                              :key="key._id"
                              class="rounded-2xl border border-slate-200 bg-white/90 p-4"
                            >
                              <div class="flex items-start justify-between gap-3">
                                <div>
                                  <p class="font-semibold text-slate-900">{{ key.name }}</p>
                                  <p class="mt-1 text-xs text-slate-500">
                                    {{ key.prefix }} · acts as
                                    {{
                                      key.boundUser?.displayName ||
                                      key.boundUser?.email ||
                                      key.boundAuthId
                                    }}
                                    · live role {{ key.effectiveRole || 'unavailable' }} · status
                                    {{ key.status }}
                                  </p>
                                  <p class="mt-1 text-xs text-slate-500">
                                    Binding: {{ formatKeyUsability(key.usability) }}
                                  </p>
                                  <p class="mt-1 text-xs text-slate-500">
                                    Last used:
                                    {{
                                      key.lastUsedAt
                                        ? new Date(key.lastUsedAt).toLocaleString()
                                        : 'never'
                                    }}
                                  </p>
                                </div>
                                <UButton
                                  size="xs"
                                  color="error"
                                  variant="soft"
                                  :disabled="key.status === 'revoked' || !canManageMcp"
                                  @click="revokeKey({ id: key._id })"
                                >
                                  Revoke
                                </UButton>
                              </div>
                            </div>
                          </div>
                        </UCard>

                        <UCard>
                          <template #header>
                            <h3 class="text-lg font-semibold">Capability map</h3>
                          </template>

                          <ul class="space-y-3 text-sm text-slate-600">
                            <li>
                              <span class="font-semibold text-slate-900">Public tools:</span> list
                              and search public runbooks.
                            </li>
                            <li>
                              <span class="font-semibold text-slate-900">Scoped tools:</span> list,
                              create, update, delete, bulk-delete, and summarize workspace runbooks.
                            </li>
                            <li>
                              <span class="font-semibold text-slate-900">Middleware:</span>
                              create/update/search and bulk-delete tools demonstrate tool
                              middleware.
                            </li>
                            <li>
                              <span class="font-semibold text-slate-900">Sessions:</span> set/get
                              focus plus dynamic shortcut registration.
                            </li>
                            <li>
                              <span class="font-semibold text-slate-900"
                                >Resources and prompts:</span
                              >
                              `app://mcp-reference/guide` and `/plan-runbook-workflow` are
                              discoverable.
                            </li>
                            <li>
                              <span class="font-semibold text-slate-900">Code mode:</span>
                              `/mcp/runbook-agent` exposes a focused orchestration endpoint.
                            </li>
                          </ul>
                        </UCard>
                      </div>
                    </div>
                  </template>
                </UCard>
              </div>
            </ConvexAuthenticated>
          </div>

          <div class="space-y-6">
            <UCard>
              <template #header>
                <h2 class="text-lg font-semibold text-slate-950">Why this example exists</h2>
              </template>

              <div class="space-y-4 text-sm leading-6 text-slate-600">
                <p>
                  Example 03 is the minimal MCP story. Example 07 is the full reference: one compact
                  business domain, one real MCP auth story, and one place to read every major
                  capability.
                </p>
                <p>
                  The app UI uses browser auth. MCP clients use bearer tokens stored as hashes in
                  Convex. Both paths converge on the same `ctx.actor()` permission flow in Convex.
                </p>
              </div>
            </UCard>
          </div>
        </div>
      </UCard>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { AuthFormField, FormSubmitEvent } from '@nuxt/ui'
import { computed, reactive, ref } from 'vue'
import * as z from 'zod'

import { api } from '#trellis/api'
import type { Id } from '~/convex/_generated/dataModel'
import { mcpManage, runbookCreate } from '~/convex/auth/permissions'
import { selectMcpBoundUser } from '~/shared/mcp-bound-user'

const { client, user, signOut } = useConvexAuth()
const authAction = useConvexAuthActions()
const { allows, ready, role, tenantId, ctx, pending: permissionsPending } = usePermissions()

const signUpFields: AuthFormField[] = [
  { name: 'name', type: 'text', label: 'Name', placeholder: 'Enter your name', required: true },
  { name: 'email', type: 'email', label: 'Email', placeholder: 'Enter your email', required: true },
  {
    name: 'password',
    type: 'password',
    label: 'Password',
    placeholder: 'Create a password',
    required: true,
  },
]

const signInFields: AuthFormField[] = [
  { name: 'email', type: 'email', label: 'Email', placeholder: 'Enter your email', required: true },
  {
    name: 'password',
    type: 'password',
    label: 'Password',
    placeholder: 'Enter your password',
    required: true,
  },
]

const signUpSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  email: z.string().email('Invalid email'),
  password: z.string().min(8, 'Must be at least 8 characters'),
})

const signInSchema = z.object({
  email: z.string().email('Invalid email'),
  password: z.string().min(1, 'Password is required'),
})

type SignUpSchema = z.output<typeof signUpSchema>
type SignInSchema = z.output<typeof signInSchema>

const createWorkspaceForm = reactive({
  name: '',
  slug: '',
})

const joinWorkspaceForm = reactive({
  slug: '',
  role: 'member' as 'admin' | 'member' | 'viewer',
})

const createRunbookForm = reactive({
  title: '',
  summary: '',
  content: '# New runbook\n\n1. Add the first step\n2. Add the second step',
  visibility: 'draft' as 'public' | 'workspace' | 'draft',
  tags: 'ops, reference',
})

const createKeyForm = reactive({
  name: 'Primary agent key',
  boundAuthId: '',
})

const verifyMcpKeyForm = reactive({
  token: '',
})

const createdKeySecret = ref('')
const verifyMessage = ref('')
const verifyVariant = ref<'success' | 'error'>('success')
const verifyingKey = ref(false)
const requestUrl = useRequestURL()

const createWorkspace = useConvexMutation(api.domain.workspaces.createWorkspace)
const joinWorkspace = useConvexMutation(api.domain.workspaces.joinWorkspace)
const createRunbookMutation = useConvexMutation(api.domain.runbooks.create)
const updateRunbookMutation = useConvexMutation(api.domain.runbooks.update)
const deleteRunbookMutation = useConvexMutation(api.domain.runbooks.remove)
const createKey = useConvexMutation(api.domain.mcpKeys.create)
const revokeKey = useConvexMutation(api.domain.mcpKeys.revoke)

const { data: workspaceOptions } = await useConvexQuery(api.domain.workspaces.listWorkspaces, {})
const { data: publicRunbooks, pending: publicPending } = await useConvexQuery(
  api.domain.runbooks.listPublic,
  {},
)

const canCreateRunbook = allows(runbookCreate)
const canManageMcp = allows(mcpManage)

const workspaceArgs = computed(() => (tenantId.value ? {} : undefined))
const mcpKeyArgs = computed(() => (tenantId.value && canManageMcp.value ? {} : undefined))

const {
  data: workspaceRunbooks,
  pending: workspaceRunbooksPending,
  error: workspaceRunbooksError,
} = await useConvexQuery(api.domain.runbooks.listWorkspace, workspaceArgs)

const { data: mcpKeys, error: mcpKeysError } = await useConvexQuery(
  api.domain.mcpKeys.list,
  mcpKeyArgs,
)
const { data: mcpKeyUsers, error: mcpKeyUsersError } = await useConvexQuery(
  api.domain.users.listWorkspaceUsersForMcpKeys,
  mcpKeyArgs,
)

const displayName = computed(
  () =>
    ctx.value?.displayName ||
    ctx.value?.email ||
    user.value?.name ||
    user.value?.email ||
    'Signed in user',
)

const endpointBase = computed(() => {
  if (import.meta.client) {
    return window.location.origin
  }

  return requestUrl.origin
})

const workspaceRoleOptions = ['admin', 'member', 'viewer']
const visibilityOptions: Array<'draft' | 'workspace' | 'public'> = ['draft', 'workspace', 'public']

const mcpBoundUserOptions = computed(() =>
  (mcpKeyUsers.value ?? []).map((user: { displayName?: string | null; email?: string | null; authId: string; role: string }) => ({
    label: `${user.displayName || user.email || user.authId} (${user.role})`,
    value: user.authId,
  })),
)

const selectedMcpBoundUser = computed(() =>
  selectMcpBoundUser(mcpKeyUsers.value ?? [], createKeyForm.boundAuthId),
)

const appError = computed(
  () =>
    workspaceRunbooksError.value?.message ||
    mcpKeysError.value?.message ||
    mcpKeyUsersError.value?.message ||
    createRunbookMutation.error.value?.message ||
    updateRunbookMutation.error.value?.message ||
    deleteRunbookMutation.error.value?.message ||
    createKey.error.value?.message ||
    revokeKey.error.value?.message ||
    createWorkspace.error.value?.message ||
    joinWorkspace.error.value?.message ||
    '',
)

async function hashToken(token: string): Promise<string> {
  const encoded = new TextEncoder().encode(token)
  const hash = await crypto.subtle.digest('SHA-256', encoded)
  return Array.from(new Uint8Array(hash))
    .map((value) => value.toString(16).padStart(2, '0'))
    .join('')
}

function generateMcpToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(24))
  const body = Array.from(bytes)
    .map((value) => value.toString(16).padStart(2, '0'))
    .join('')
  return `mcp_${body}`
}

function toTagList(raw: string): string[] {
  return raw
    .split(',')
    .map((tag) => tag.trim())
    .filter(Boolean)
}

function formatKeyUsability(
  value: 'usable' | 'revoked' | 'bound_user_missing' | 'bound_user_workspace_mismatch',
) {
  return value.replaceAll('_', ' ')
}

async function handleSignUp(payload: FormSubmitEvent<SignUpSchema>) {
  if (!client) throw new Error('Auth client unavailable.')
  await authAction.execute(() => client.signUp.email(payload.data), { redirectTo: '/' })
}

async function handleSignIn(payload: FormSubmitEvent<SignInSchema>) {
  if (!client) throw new Error('Auth client unavailable.')
  await authAction.execute(() => client.signIn.email(payload.data), { redirectTo: '/' })
}

async function handleSignOut() {
  await signOut()
}

async function handleCreateWorkspace() {
  await createWorkspace({
    name: createWorkspaceForm.name,
    slug: createWorkspaceForm.slug,
  })
}

async function handleJoinWorkspace() {
  await joinWorkspace({
    slug: joinWorkspaceForm.slug,
    role: joinWorkspaceForm.role,
  })
}

async function handleCreateRunbook() {
  await createRunbookMutation({
    title: createRunbookForm.title,
    summary: createRunbookForm.summary,
    content: createRunbookForm.content,
    visibility: createRunbookForm.visibility,
    tags: toTagList(createRunbookForm.tags),
  })

  createRunbookForm.title = ''
  createRunbookForm.summary = ''
}

async function handleSetVisibility(
  id: Id<'runbooks'>,
  visibility: 'public' | 'workspace' | 'draft',
) {
  await updateRunbookMutation({ id, visibility })
}

async function handleDeleteRunbook(id: Id<'runbooks'>) {
  await deleteRunbookMutation({ id })
}

async function handleCreateMcpKey() {
  const boundAuthId = createKeyForm.boundAuthId.trim()
  if (!boundAuthId || !selectedMcpBoundUser.value) {
    throw new Error('Choose a workspace user before issuing an MCP key.')
  }

  const token = generateMcpToken()
  const hash = await hashToken(token)
  const prefix = `${token.slice(0, 14)}...`

  await createKey({
    name: createKeyForm.name,
    boundAuthId,
    prefix,
    hash,
  })

  createdKeySecret.value = token
}

async function handleVerifyKey() {
  verifyingKey.value = true

  try {
    const token = verifyMcpKeyForm.token.trim()
    if (!token.startsWith('mcp_')) {
      verifyVariant.value = 'error'
      verifyMessage.value = 'Keys in this example always start with mcp_.'
      return
    }

    const result = await useConvex().query(api.domain.mcpKeys.validate, {
      hash: await hashToken(token),
    })

    if (!result) {
      verifyVariant.value = 'error'
      verifyMessage.value = 'No active MCP key matched that token.'
      return
    }

    verifyVariant.value = 'success'
    verifyMessage.value = `Valid key for role ${result.role} in workspace ${result.tenantId}.`
  } finally {
    verifyingKey.value = false
  }
}
</script>
