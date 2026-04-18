<template>
  <main class="page">
    <div class="stack-lg">
      <header class="stack">
        <p>Example Next 01</p>
        <h1>Kanban Workspace</h1>
        <p>
          Trellis stress test: auth, memberships, multi-board workspaces, reorder semantics,
          destructive archive preview, MCP parity, and audit visibility.
        </p>
      </header>

      <div v-if="visibleError" class="banner banner--error" role="alert">
        <span class="banner__icon" aria-hidden="true">!</span>
        <div class="banner__body">{{ visibleError }}</div>
        <button
          type="button"
          class="banner__dismiss"
          aria-label="Dismiss error"
          @click="dismissedError = visibleError"
        >
          ×
        </button>
      </div>

      <section v-if="isPending" class="card stack">
        <h2><span class="spinner spinner--inline" aria-hidden="true" />Checking session</h2>
        <p class="meta">Auth and active workspace state settle before private queries subscribe.</p>
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
        <section class="card stack">
          <div class="split">
            <div class="stack-sm">
              <h2>{{ user?.name || user?.email || 'Signed in user' }}</h2>
              <div class="cluster">
                <span class="chip chip--brand">
                  Workspace: {{ sessionContext?.activeWorkspace?.slug || 'none' }}
                </span>
                <span class="chip">
                  Role: {{ sessionContext?.activeRole || 'none' }}
                </span>
              </div>
            </div>

            <div class="toolbar">
              <button type="button" class="btn btn--ghost" @click="handleSignOut">Sign out</button>
            </div>
          </div>

          <form class="stack" @submit.prevent="handleCreateWorkspace">
            <h3>Create workspace</h3>
            <div class="form-grid form-grid-2">
              <label>
                <span>Name</span>
                <input v-model="createWorkspaceForm.name" type="text" required />
              </label>
              <label>
                <span>Slug</span>
                <input v-model="createWorkspaceForm.slug" type="text" required />
              </label>
            </div>
            <div>
              <button
                type="submit"
                class="btn btn--primary"
                :disabled="createWorkspace.pending.value"
              >
                <span
                  v-if="createWorkspace.pending.value"
                  class="spinner spinner--inline"
                  aria-hidden="true"
                />
                Create workspace
              </button>
            </div>
          </form>

          <div v-if="sessionContext?.memberships?.length" class="stack">
            <h3>Accessible workspaces</h3>
            <div class="cluster">
              <button
                v-for="workspace in sessionContext.memberships"
                :key="workspace.workspaceId"
                type="button"
                class="btn btn--sm"
                :class="{
                  'is-active':
                    workspace.workspaceId === sessionContext?.activeWorkspace?._id,
                }"
                :disabled="switchWorkspace.pending.value"
                @click="handleSwitchWorkspace(workspace.workspaceId)"
              >
                {{ workspace.name }} · {{ workspace.role }}
              </button>
            </div>
          </div>
        </section>

        <template v-if="sessionContext?.activeWorkspace">
          <section class="workspace-grid">
            <section class="card stack">
              <div class="split">
                <div class="stack-sm">
                  <h2>Members</h2>
                  <p class="meta">Explicit workspace memberships, not self-join shortcuts.</p>
                </div>
              </div>

              <form
                v-if="sessionContext.permissions.manageMembers"
                class="stack"
                @submit.prevent="handleAddMember"
              >
                <div class="form-grid form-grid-2">
                  <label>
                    <span>Email</span>
                    <input v-model="addMemberForm.email" type="email" required />
                  </label>
                  <label>
                    <span>Role</span>
                    <select v-model="addMemberForm.role">
                      <option value="admin">admin</option>
                      <option value="member">member</option>
                      <option value="viewer">viewer</option>
                    </select>
                  </label>
                </div>
                <div>
                  <button
                    type="submit"
                    class="btn btn--primary"
                    :disabled="addMember.pending.value"
                  >
                    <span
                      v-if="addMember.pending.value"
                      class="spinner spinner--inline"
                      aria-hidden="true"
                    />
                    Add member
                  </button>
                </div>
              </form>

              <ul v-if="(members || []).length" class="stack-sm">
                <li v-for="member in members || []" :key="member._id" class="split">
                  <span>{{ member.displayName || member.email || member.userId }}</span>
                  <span class="chip">{{ member.role }}</span>
                </li>
              </ul>
              <div v-else class="empty-state">
                <span class="empty-state__title">No members yet</span>
                <span class="empty-state__hint">
                  Invite teammates by email. They must have an account to be added.
                </span>
              </div>
            </section>

            <section class="card stack">
              <div class="split">
                <div class="stack-sm">
                  <h2>Boards</h2>
                  <p class="meta">Multiple boards per workspace. No implicit “first board”.</p>
                </div>
              </div>

              <form
                v-if="sessionContext.permissions.manageBoards"
                class="stack"
                @submit.prevent="handleCreateBoard"
              >
                <label>
                  <span>Board title</span>
                  <input v-model="createBoardForm.title" type="text" required />
                </label>
                <div>
                  <button
                    type="submit"
                    class="btn btn--primary"
                    :disabled="createBoard.pending.value"
                  >
                    <span
                      v-if="createBoard.pending.value"
                      class="spinner spinner--inline"
                      aria-hidden="true"
                    />
                    Create board
                  </button>
                </div>
              </form>

              <div v-if="(boards || []).length" class="cluster">
                <button
                  v-for="board in boards || []"
                  :key="board._id"
                  type="button"
                  class="btn btn--sm"
                  :class="{ 'is-active': board._id === selectedBoardId }"
                  :disabled="board.archived"
                  @click="selectedBoardId = board._id"
                >
                  {{ board.title }}<span v-if="board.archived"> (archived)</span>
                </button>
              </div>
              <div v-else-if="!boardsPending" class="empty-state">
                <span class="empty-state__title">No boards yet</span>
                <span class="empty-state__hint">
                  Create a board above to start adding columns and cards.
                </span>
              </div>
            </section>
          </section>

          <section v-if="!selectedBoardId && (boards?.length || 0) > 0" class="empty-state">
            <span class="empty-state__title">Select a board</span>
            <span class="empty-state__hint">
              Board selection is explicit — this example does not silently reopen the first board.
            </span>
          </section>

          <template v-if="selectedBoardId && boardView">
            <section class="split">
              <div class="stack-sm">
                <h2>{{ boardView.board.title }}</h2>
                <p class="meta">
                  {{ boardView.workspace.name }} · {{ boardView.columns.length }} columns
                </p>
              </div>

              <div class="toolbar">
                <button
                  v-if="boardView.permissions.archiveBoard && !boardView.board.archived"
                  type="button"
                  class="btn btn--danger"
                  @click="previewOpen = true"
                >
                  Preview archive
                </button>
              </div>
            </section>

            <div v-if="previewOpen" class="modal-backdrop" @click.self="previewOpen = false">
              <div class="modal-panel" role="dialog" aria-modal="true" aria-labelledby="archive-title">
                <ArchiveBoardPreview
                  :preview="archivePreview ?? null"
                  :preview-pending="archivePreviewPending"
                  :archive-pending="archiveBoard.pending.value"
                  @cancel="previewOpen = false"
                  @confirm="handleConfirmArchive"
                />
              </div>
            </div>

            <section class="board-grid">
              <BoardColumn
                v-for="(column, index) in boardView.columns"
                :key="column._id"
                :column="column"
                :all-columns="boardView.columns"
                :column-index="index"
                :column-count="boardView.columns.length"
                :can-manage-board-structure="boardView.permissions.manageBoardStructure"
                :can-write-cards="boardView.permissions.writeCards"
                :pending="boardPending"
                @create-card="handleCreateCard"
                @rename-column="handleRenameColumn"
                @move-column-earlier="handleMoveColumnEarlier"
                @move-column-later="handleMoveColumnLater"
                @rename-card="handleRenameCard"
                @move-card-up="handleMoveCardUp"
                @move-card-down="handleMoveCardDown"
                @move-card-to-column="handleMoveCardToColumn"
              />
            </section>

            <form
              v-if="boardView.permissions.manageBoardStructure"
              class="card stack"
              @submit.prevent="handleCreateColumn"
            >
              <h3>Add column</h3>
              <label>
                <span>Column title</span>
                <input v-model="createColumnForm.title" type="text" required />
              </label>
              <div>
                <button
                  type="submit"
                  class="btn btn--primary"
                  :disabled="createColumn.pending.value"
                >
                  <span
                    v-if="createColumn.pending.value"
                    class="spinner spinner--inline"
                    aria-hidden="true"
                  />
                  Add column
                </button>
              </div>
            </form>
          </template>

          <section class="card stack">
            <div class="split">
              <div class="stack-sm">
                <h2>Audit events</h2>
                <p class="meta">Visible evidence for UI and MCP-driven actions.</p>
              </div>
              <span v-if="(auditEvents || []).length" class="chip">
                {{ (auditEvents || []).length }} events
              </span>
            </div>
            <ul v-if="(auditEvents || []).length" class="stack-sm">
              <li v-for="event in auditEvents || []" :key="event._id" class="stack-sm">
                <div class="split">
                  <strong>{{ event.summary }}</strong>
                  <span class="chip">{{ event.origin }}</span>
                </div>
                <span class="meta">
                  {{ formatTimestamp(event.createdAt) }} · {{ event.action }}
                </span>
              </li>
            </ul>
            <div v-else class="empty-state">
              <span class="empty-state__title">No audit events yet</span>
              <span class="empty-state__hint">
                Creating a board, column, or card will emit an audit entry here.
              </span>
            </div>
          </section>
        </template>
      </template>
    </div>
  </main>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'

import { api } from '#trellis/api'
import type { Id } from '~/convex/_generated/dataModel'
import { reconcileSelectedBoardId } from '../shared/board-selection'

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

const addMemberForm = ref<{
  email: string
  role: 'admin' | 'member' | 'viewer'
}>({
  email: '',
  role: 'member',
})

const createBoardForm = ref({
  title: '',
})

const createColumnForm = ref({
  title: '',
})

const selectedBoardId = ref<Id<'boards'> | null>(null)
const previewOpen = ref(false)
const dismissedError = ref<string>('')

const enabled = computed(() => isAuthenticated.value)

const {
  data: sessionContext,
  error: sessionError,
} = await useConvexQuery(api.workspaces.getSessionContext, computed(() => (enabled.value ? {} : undefined)))

const {
  data: boards,
  pending: boardsPending,
  error: boardsError,
} = await useConvexQuery(
  api.boards.listBoards,
  computed(() =>
    enabled.value && sessionContext.value?.activeWorkspace ? { includeArchived: true } : undefined,
  ),
)

const { data: members, error: membersError } = await useConvexQuery(
  api.workspaces.listMembers,
  computed(() => (enabled.value && sessionContext.value?.activeWorkspace ? {} : undefined)),
)

const { data: auditEvents, error: auditError } = await useConvexQuery(
  api.workspaces.listAuditEvents,
  computed(() => (enabled.value && sessionContext.value?.activeWorkspace ? {} : undefined)),
)

watch(
  boards,
  (nextBoards) => {
    selectedBoardId.value = reconcileSelectedBoardId(selectedBoardId.value, nextBoards)
  },
  { immediate: true },
)

const {
  data: boardView,
  pending: boardQueryPending,
  error: boardError,
} = await useConvexQuery(
  api.boards.getBoardView,
  computed(() =>
    enabled.value && sessionContext.value?.activeWorkspace && selectedBoardId.value
      ? { boardId: selectedBoardId.value }
      : undefined,
  ),
)

const {
  data: archivePreview,
  pending: archivePreviewPending,
  error: archivePreviewError,
} = await useConvexQuery(
  api.boards.previewArchiveBoard,
  computed(() =>
    enabled.value && previewOpen.value && selectedBoardId.value
      ? { boardId: selectedBoardId.value }
      : undefined,
  ),
)

type BoardViewData = NonNullable<typeof boardView.value>
type BoardViewColumn = BoardViewData['columns'][number]
type BoardViewCard = BoardViewColumn['cards'][number]

const createWorkspace = useConvexMutation(api.workspaces.createWorkspace)
const switchWorkspace = useConvexMutation(api.workspaces.switchWorkspace)
const addMember = useConvexMutation(api.workspaces.addWorkspaceMember)
const createBoard = useConvexMutation(api.boards.createBoard)
const createColumn = useConvexMutation(api.boards.createColumn)
const renameColumn = useConvexMutation(api.boards.renameColumn)
const reorderColumn = useConvexMutation(api.boards.reorderColumn)
const createCard = useConvexMutation(api.boards.createCard)
const updateCard = useConvexMutation(api.boards.updateCard)
const moveCard = useConvexMutation(api.boards.moveCard)
const archiveBoard = useConvexMutation(api.boards.archiveBoard)

const boardPending = computed(
  () =>
    boardsPending.value ||
    boardQueryPending.value ||
    createBoard.pending.value ||
    createColumn.pending.value ||
    renameColumn.pending.value ||
    reorderColumn.pending.value ||
    createCard.pending.value ||
    updateCard.pending.value ||
    moveCard.pending.value,
)

const globalError = computed(
  () =>
    authAction.error.value?.message ||
    sessionError.value?.message ||
    boardsError.value?.message ||
    membersError.value?.message ||
    boardError.value?.message ||
    auditError.value?.message ||
    archivePreviewError.value?.message ||
    createWorkspace.error.value?.message ||
    switchWorkspace.error.value?.message ||
    addMember.error.value?.message ||
    createBoard.error.value?.message ||
    createColumn.error.value?.message ||
    renameColumn.error.value?.message ||
    reorderColumn.error.value?.message ||
    createCard.error.value?.message ||
    updateCard.error.value?.message ||
    moveCard.error.value?.message ||
    archiveBoard.error.value?.message ||
    '',
)

const visibleError = computed(() =>
  globalError.value && globalError.value !== dismissedError.value ? globalError.value : '',
)

function findCard(cardId: string) {
  for (const column of boardView.value?.columns || []) {
    const card = column.cards.find((entry: BoardViewCard) => entry._id === cardId)
    if (card) return { card, column }
  }
  return null
}

function formatTimestamp(value: number) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(value)
}

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
  const workspaceId = await createWorkspace(createWorkspaceForm.value)
  createWorkspaceForm.value = { name: '', slug: '' }
  selectedBoardId.value = null
  await switchWorkspace({ workspaceId })
}

async function handleSwitchWorkspace(workspaceId: Id<'workspaces'>) {
  previewOpen.value = false
  selectedBoardId.value = null
  await switchWorkspace({ workspaceId })
}

async function handleAddMember() {
  await addMember(addMemberForm.value)
  addMemberForm.value = { email: '', role: 'member' }
}

async function handleCreateBoard() {
  const boardId = (await createBoard(createBoardForm.value)) as Id<'boards'>
  createBoardForm.value = { title: '' }
  selectedBoardId.value = boardId
}

async function handleCreateColumn() {
  if (!selectedBoardId.value) return
  await createColumn({
    boardId: selectedBoardId.value,
    title: createColumnForm.value.title,
  })
  createColumnForm.value = { title: '' }
}

async function handleRenameColumn(columnId: Id<'columns'>) {
  const current = boardView.value?.columns.find((column: BoardViewColumn) => column._id === columnId)
  if (!current) return
  const nextTitle = window.prompt('Column title', current.title)?.trim()
  if (!nextTitle) return
  await renameColumn({ columnId, title: nextTitle })
}

async function handleMoveColumnEarlier(columnId: Id<'columns'>) {
  const columns = boardView.value?.columns || []
  const index = columns.findIndex((column: BoardViewColumn) => column._id === columnId)
  if (index <= 0) return
  await reorderColumn({
    columnId,
    beforeColumnId: columns[index - 1]?._id,
  })
}

async function handleMoveColumnLater(columnId: Id<'columns'>) {
  const columns = boardView.value?.columns || []
  const index = columns.findIndex((column: BoardViewColumn) => column._id === columnId)
  if (index === -1 || index >= columns.length - 1) return
  const afterNext = columns[index + 2]?._id
  await reorderColumn({
    columnId,
    ...(afterNext ? { beforeColumnId: afterNext } : {}),
  })
}

async function handleCreateCard(payload: { columnId: Id<'columns'>; title: string }) {
  await createCard({
    columnId: payload.columnId,
    title: payload.title,
  })
}

async function handleRenameCard(cardId: Id<'cards'>) {
  const found = findCard(cardId)
  if (!found) return
  const nextTitle = window.prompt('Card title', found.card.title)?.trim()
  if (!nextTitle) return
  const nextDescription = window.prompt('Card description', found.card.description || '') ?? ''
  await updateCard({
    cardId,
    title: nextTitle,
    description: nextDescription.trim() || undefined,
  })
}

async function handleMoveCardUp(cardId: Id<'cards'>) {
  const found = findCard(cardId)
  if (!found) return
  const index = found.column.cards.findIndex((card: BoardViewCard) => card._id === cardId)
  if (index <= 0) return
  await moveCard({
    cardId,
    toColumnId: found.column._id,
    beforeCardId: found.column.cards[index - 1]?._id,
  })
}

async function handleMoveCardDown(cardId: Id<'cards'>) {
  const found = findCard(cardId)
  if (!found) return
  const index = found.column.cards.findIndex((card: BoardViewCard) => card._id === cardId)
  if (index === -1 || index >= found.column.cards.length - 1) return
  const afterNext = found.column.cards[index + 2]?._id
  await moveCard({
    cardId,
    toColumnId: found.column._id,
    ...(afterNext ? { beforeCardId: afterNext } : {}),
  })
}

async function handleMoveCardToColumn(payload: {
  cardId: Id<'cards'>
  toColumnId: Id<'columns'>
  beforeCardId?: Id<'cards'>
}) {
  await moveCard({
    cardId: payload.cardId,
    toColumnId: payload.toColumnId,
    ...(payload.beforeCardId ? { beforeCardId: payload.beforeCardId } : {}),
  })
}

async function handleConfirmArchive() {
  if (!selectedBoardId.value) return
  await archiveBoard({ boardId: selectedBoardId.value })
  previewOpen.value = false
}
</script>
