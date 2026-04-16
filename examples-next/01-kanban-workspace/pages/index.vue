<template>
  <main class="page">
    <div class="stack-lg">
      <header class="stack">
        <p>Example Next 01</p>
        <h1>Kanban Workspace</h1>
        <p>
          Minimal UI, hard concepts: auth, tenant-scoped kanban data, role-gated mutations, ordered
          card movement, and destructive board archive preview.
        </p>
      </header>

      <p v-if="globalError" class="meta">{{ globalError }}</p>

      <section v-if="isPending" class="stack">
        <h2>Checking session</h2>
        <p class="meta">Auth and app actor readiness settle before private queries subscribe.</p>
      </section>

      <AuthPanels
        v-else-if="!isAuthenticated"
        v-model:sign-up="signUpForm"
        v-model:sign-in="signInForm"
        :pending="authAction.pending.value"
        @sign-up="handleSignUp"
        @sign-in="handleSignIn"
      />

      <template v-else>
        <section class="split">
          <div class="stack">
            <h2>{{ user?.name || user?.email || 'Signed in user' }}</h2>
            <p class="meta">
              Workspace:
              <span class="mono">{{ sessionContext?.workspace?.slug || 'none' }}</span>
            </p>
            <p class="meta">
              Role:
              <span class="mono">{{ sessionContext?.actorRole || 'none' }}</span>
            </p>
          </div>

          <div class="toolbar">
            <button type="button" @click="handleSignOut">Sign out</button>
          </div>
        </section>

        <WorkspaceSetup
          v-if="ready && !sessionContext?.workspace"
          v-model:create-form="createWorkspaceForm"
          v-model:join-form="joinWorkspaceForm"
          :create-pending="createWorkspace.pending.value"
          :join-pending="joinWorkspace.pending.value"
          :workspaces="availableWorkspaces || []"
          @create="handleCreateWorkspace"
          @join="handleJoinWorkspace"
        />

        <template v-else-if="boardView?.board">
          <section class="split">
            <div class="stack">
              <h2>{{ boardView.board.title }}</h2>
              <p class="meta">
                {{ boardView.workspace.name }} · {{ boardView.columns.length }} lists
              </p>
            </div>

            <div class="toolbar" v-if="boardView.permissions.archiveBoard">
              <button type="button" @click="openArchivePreview">Preview archive</button>
            </div>
          </section>

          <ArchiveBoardPreview
            v-if="previewOpen"
            :board-id="boardView.board._id"
            :preview="archivePreview ?? null"
            :preview-pending="archivePreviewPending"
            :archive-pending="archiveBoard.pending.value"
            @cancel="closeArchivePreview"
            @confirm="confirmArchive"
          />

          <section class="board-grid">
            <BoardColumn
              v-for="(column, index) in boardView.columns"
              :key="column._id"
              :column="column"
              :cards="column.cards"
              :can-create-cards="boardView.permissions.createCard"
              :can-move-cards="boardView.permissions.moveCard"
              :can-move-left="index > 0"
              :can-move-right="index < boardView.columns.length - 1"
              :pending="createCard.pending.value || moveCard.pending.value"
              @create-card="addCard"
              @move-left="moveLeft"
              @move-right="moveRight"
            />
          </section>
        </template>

        <section v-else-if="boardPending" class="stack">
          <h2>Loading board</h2>
          <p class="meta">Waiting for tenant-scoped board data.</p>
        </section>

        <section v-else class="stack">
          <h2>No active board</h2>
          <p class="meta">
            This usually means the workspace board was archived. Create another workspace or join a
            different one to continue.
          </p>
        </section>
      </template>
    </div>
  </main>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'

import { api } from '#trellis/api'

const { client, isAuthenticated, isPending, signOut, user } = useConvexAuth()
const authAction = useConvexAuthActions()

const signUpForm = ref({
  name: '',
  email: '',
  password: '',
})

const signInForm = ref({
  email: '',
  password: '',
})

const createWorkspaceForm = ref({
  name: '',
  slug: '',
})

const joinWorkspaceForm = ref<{
  slug: string
  role: 'admin' | 'member' | 'viewer'
}>({
  slug: '',
  role: 'member',
})

const enabled = computed(() => isAuthenticated.value)

const {
  data: sessionContext,
  pending: sessionPending,
  error: sessionError,
} = await useConvexQuery(api.workspaces.getSessionContext, computed(() => (enabled.value ? {} : undefined)))

const {
  data: availableWorkspaces,
  error: workspacesError,
} = await useConvexQuery(api.workspaces.listWorkspaces, {})

const createWorkspace = useConvexMutation(api.workspaces.createWorkspace)
const joinWorkspace = useConvexMutation(api.workspaces.joinWorkspace)

const {
  boardView,
  pending: boardPending,
  error: boardError,
  createCard,
  moveCard,
  archiveBoard,
  addCard,
  moveLeft,
  moveRight,
  previewOpen,
  openArchivePreview,
  closeArchivePreview,
  archivePreview,
  archivePreviewPending,
  archivePreviewError,
  confirmArchive,
} = await useKanbanBoard(computed(() => enabled.value && !!sessionContext.value?.workspace))

const ready = computed(() => enabled.value && !sessionPending.value)

const globalError = computed(
  () =>
    authAction.error.value?.message ||
    sessionError.value?.message ||
    workspacesError.value?.message ||
    boardError.value?.message ||
    archivePreviewError.value?.message ||
    createWorkspace.error.value?.message ||
    joinWorkspace.error.value?.message ||
    createCard.error.value?.message ||
    moveCard.error.value?.message ||
    archiveBoard.error.value?.message ||
    '',
)

async function handleSignUp() {
  if (!client) throw new Error('Auth client unavailable.')
  await authAction.execute(() => client.signUp.email(signUpForm.value), { redirectTo: '/' })
}

async function handleSignIn() {
  if (!client) throw new Error('Auth client unavailable.')
  await authAction.execute(() => client.signIn.email(signInForm.value), { redirectTo: '/' })
}

async function handleSignOut() {
  await signOut()
}

async function handleCreateWorkspace() {
  await createWorkspace(createWorkspaceForm.value)
}

async function handleJoinWorkspace() {
  await joinWorkspace(joinWorkspaceForm.value)
}
</script>

