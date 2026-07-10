<script setup lang="ts">
import { api } from '#convex/api'

defineOptions({ name: 'AgentApprovalQueuePage' })

type QueueItemId = string
type AuthOrganizationResult = {
  id?: string
}

// The typed Better Auth client comes from `useConvexAuth().client`, itself typed
// from `app/convex-auth.ts` (the `<srcDir>/convex-auth.ts` convention definition
// with `organizationClient()`). Null during SSR / when auth is disabled.
const { signUp, refreshAuth, client: authClient } = useConvexAuth()

const organizationId = ref('')
const queueArgs = computed(() =>
  organizationId.value ? { organizationId: organizationId.value } : 'skip',
)

const { data: drafts } = await useConvexQuery(api.projectDrafts.listPending, queueArgs)
const { data: deletionRequests } = await useConvexQuery(
  api.projectDeletionRequests.listPending,
  queueArgs,
)

const approveDraft = useConvexMutation(api.projectDrafts.approve)
const rejectDraft = useConvexMutation(api.projectDrafts.reject)
const approveDeletionRequest = useConvexMutation(api.projectDeletionRequests.approve)
const rejectDeletionRequest = useConvexMutation(api.projectDeletionRequests.reject)
const startDelegatedRun = useConvexMutation(api.agentRuns.startDelegatedRunWithBetterAuth)
const generateDraftWithTool = useConvexAction(api.agentTools.generateDraftWithTool)

const pendingActionId = ref<string | null>(null)
const setupError = ref<string | null>(null)
const setupStatus = ref<string | null>(null)
const ownerName = ref('Agent Owner')
const ownerEmail = ref(`agent-owner-${Date.now()}@example.com`)
const ownerPassword = ref('password123')
const organizationName = ref('Agentic Proof Org')

function slugify(value: string) {
  const slug = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')

  return `${slug || 'organization'}-${Date.now().toString(36)}`
}

async function runSetupAction(actionId: string, action: () => Promise<string | undefined>) {
  pendingActionId.value = actionId
  setupError.value = null
  setupStatus.value = null
  try {
    const status = await action()
    setupStatus.value = status ?? null
  } catch (e) {
    setupError.value = e instanceof Error ? e.message : 'Action failed'
  } finally {
    pendingActionId.value = null
  }
}

async function signUpOwner() {
  await runSetupAction('sign-up-owner', async () => {
    const { error } = await signUp.email({
      name: ownerName.value.trim(),
      email: ownerEmail.value.trim(),
      password: ownerPassword.value,
    })

    if (error) {
      throw new Error(error.message || 'Sign up failed')
    }

    await refreshAuth()
    return 'Owner session ready'
  })
}

async function createOrganization() {
  await runSetupAction('create-organization', async () => {
    if (!authClient) {
      throw new Error('Auth client is unavailable')
    }

    const result = await authClient.organization.create({
      name: organizationName.value.trim(),
      slug: slugify(organizationName.value),
    })

    if (result.error) {
      throw new Error(result.error.message || 'Organization was not created')
    }

    const organization = result.data as AuthOrganizationResult | null
    if (!organization?.id) {
      throw new Error('Organization response did not include an id')
    }

    organizationId.value = organization.id
    await refreshAuth()
    return 'Organization ready'
  })
}

async function createAgentDraft() {
  await runSetupAction('create-agent-draft', async () => {
    const runId = await startDelegatedRun({
      organizationId: organizationId.value,
      agentName: 'project-assistant',
      capabilities: ['project:read', 'project:draft'],
    })

    await generateDraftWithTool({
      agentRunId: runId,
    })

    return 'Agent draft pending review'
  })
}

async function runQueueAction(actionId: string, action: () => Promise<unknown>) {
  pendingActionId.value = actionId
  try {
    await action()
  } finally {
    pendingActionId.value = null
  }
}

async function approveDraftItem(draftId: QueueItemId) {
  await runQueueAction(`approve-draft:${draftId}`, () =>
    approveDraft({
      draftId,
    }),
  )
}

async function rejectDraftItem(draftId: QueueItemId) {
  await runQueueAction(`reject-draft:${draftId}`, () =>
    rejectDraft({
      draftId,
    }),
  )
}

async function approveDeletionItem(deletionRequestId: QueueItemId) {
  await runQueueAction(`approve-delete:${deletionRequestId}`, () =>
    approveDeletionRequest({
      deletionRequestId,
    }),
  )
}

async function rejectDeletionItem(deletionRequestId: QueueItemId) {
  await runQueueAction(`reject-delete:${deletionRequestId}`, () =>
    rejectDeletionRequest({
      deletionRequestId,
    }),
  )
}
</script>

<template>
  <main class="shell">
    <header class="topbar">
      <div>
        <p class="eyebrow">Agentic SaaS</p>
        <h1>Approval Queue</h1>
      </div>

      <label class="org-control">
        <span>Organization ID</span>
        <input v-model="organizationId" autocomplete="off" placeholder="org_..." />
      </label>
    </header>

    <section class="setup-panel" aria-label="Agentic SaaS setup">
      <form class="setup-column" @submit.prevent="signUpOwner">
        <h2>Owner</h2>
        <label>
          Name
          <input v-model="ownerName" autocomplete="name" required />
        </label>
        <label>
          Email
          <input v-model="ownerEmail" autocomplete="email" required type="email" />
        </label>
        <label>
          Password
          <input
            v-model="ownerPassword"
            autocomplete="new-password"
            minlength="8"
            required
            type="password"
          />
        </label>
        <button :disabled="pendingActionId !== null" type="submit">Sign Up</button>
      </form>

      <form class="setup-column" @submit.prevent="createOrganization">
        <h2>Organization</h2>
        <label>
          Name
          <input v-model="organizationName" autocomplete="organization" required />
        </label>
        <button :disabled="pendingActionId !== null" type="submit">Create Org</button>
      </form>

      <div class="setup-column">
        <h2>Agent</h2>
        <button
          :disabled="pendingActionId !== null || !organizationId"
          type="button"
          @click="createAgentDraft"
        >
          Draft
        </button>
        <p v-if="setupStatus" class="setup-status">{{ setupStatus }}</p>
        <p v-if="setupError" class="setup-error">{{ setupError }}</p>
      </div>
    </section>

    <section class="queue-grid" aria-label="Agent review queue">
      <section class="queue-section" aria-labelledby="drafts-heading">
        <div class="section-header">
          <h2 id="drafts-heading">Drafts</h2>
          <span>{{ drafts?.length ?? 0 }}</span>
        </div>

        <article v-for="draft in drafts ?? []" :key="draft._id" class="review-item">
          <div>
            <h3>{{ draft.title }}</h3>
            <p>{{ draft.body }}</p>
          </div>

          <div class="actions">
            <button
              class="secondary"
              :disabled="pendingActionId !== null"
              @click="rejectDraftItem(draft._id)"
            >
              Reject
            </button>
            <button :disabled="pendingActionId !== null" @click="approveDraftItem(draft._id)">
              Approve
            </button>
          </div>
        </article>
      </section>

      <section class="queue-section" aria-labelledby="deletions-heading">
        <div class="section-header">
          <h2 id="deletions-heading">Deletion Requests</h2>
          <span>{{ deletionRequests?.length ?? 0 }}</span>
        </div>

        <article
          v-for="request in deletionRequests ?? []"
          :key="request._id"
          class="review-item destructive"
        >
          <div>
            <h3>{{ request.productRecordId }}</h3>
            <p>{{ request.reason }}</p>
          </div>

          <div class="actions">
            <button
              class="secondary"
              :disabled="pendingActionId !== null"
              @click="rejectDeletionItem(request._id)"
            >
              Reject
            </button>
            <button
              class="danger"
              :disabled="pendingActionId !== null"
              @click="approveDeletionItem(request._id)"
            >
              Delete
            </button>
          </div>
        </article>
      </section>
    </section>
  </main>
</template>

<style>
body {
  margin: 0;
  background: #f7f7f4;
  color: #18181b;
  font-family: Inter, ui-sans-serif, system-ui, sans-serif;
}

button,
input {
  font: inherit;
}

.shell {
  max-width: 1120px;
  margin: 0 auto;
  padding: 32px 24px 48px;
}

.topbar {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(280px, 360px);
  gap: 24px;
  align-items: end;
  margin-bottom: 28px;
}

.eyebrow {
  margin: 0 0 4px;
  color: #6b7280;
  font-size: 0.82rem;
  font-weight: 700;
  letter-spacing: 0;
  text-transform: uppercase;
}

h1,
h2,
h3,
p {
  margin: 0;
}

h1 {
  font-size: 2rem;
  line-height: 1.1;
}

h2 {
  font-size: 1rem;
}

h3 {
  margin-bottom: 8px;
  font-size: 0.98rem;
  line-height: 1.25;
  overflow-wrap: anywhere;
}

.org-control {
  display: grid;
  gap: 8px;
  color: #3f3f46;
  font-size: 0.9rem;
  font-weight: 600;
}

.org-control input {
  width: 100%;
  box-sizing: border-box;
  height: 42px;
  border: 1px solid #d4d4d8;
  border-radius: 6px;
  background: #fff;
  color: #18181b;
  padding: 0 12px;
}

.setup-panel {
  display: grid;
  grid-template-columns: 1.2fr 1fr 0.8fr;
  gap: 18px;
  align-items: start;
  margin-bottom: 28px;
  padding: 18px 0 24px;
  border-top: 1px solid #deded8;
  border-bottom: 1px solid #deded8;
}

.setup-column {
  display: grid;
  gap: 12px;
  min-width: 0;
}

.setup-column label {
  display: grid;
  gap: 6px;
  color: #3f3f46;
  font-size: 0.86rem;
  font-weight: 600;
}

.setup-column input {
  width: 100%;
  box-sizing: border-box;
  height: 38px;
  border: 1px solid #d4d4d8;
  border-radius: 6px;
  background: #fff;
  color: #18181b;
  padding: 0 10px;
}

.setup-column button {
  justify-self: start;
}

.setup-status,
.setup-error {
  font-size: 0.88rem;
  line-height: 1.4;
}

.setup-status {
  color: #166534;
}

.setup-error {
  color: #b42318;
}

.queue-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 18px;
}

.queue-section {
  min-width: 0;
}

.section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 10px;
}

.section-header span {
  min-width: 32px;
  height: 24px;
  border-radius: 999px;
  background: #e4e4e7;
  color: #3f3f46;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 0.82rem;
  font-variant-numeric: tabular-nums;
  font-weight: 700;
}

.review-item {
  display: grid;
  gap: 18px;
  min-height: 156px;
  padding: 18px;
  border: 1px solid #deded8;
  border-radius: 8px;
  background: #fff;
}

.review-item + .review-item {
  margin-top: 12px;
}

.review-item p {
  color: #52525b;
  line-height: 1.5;
  overflow-wrap: anywhere;
}

.review-item.destructive {
  border-color: #f0c9c9;
}

.actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  align-self: end;
}

button {
  min-width: 88px;
  height: 38px;
  border: 0;
  border-radius: 6px;
  background: #155eef;
  color: #fff;
  cursor: pointer;
  font-weight: 700;
}

button.secondary {
  border: 1px solid #d4d4d8;
  background: #fff;
  color: #27272a;
}

button.danger {
  background: #b42318;
}

button:disabled {
  cursor: not-allowed;
  opacity: 0.56;
}

@media (max-width: 780px) {
  .topbar,
  .setup-panel,
  .queue-grid {
    grid-template-columns: 1fr;
  }
}
</style>
