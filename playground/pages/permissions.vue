<template>
  <div class="container">
    <div class="card">
      <header class="header">
        <h1>Permission System Demo</h1>
        <div class="header-actions">
          <span v-if="role" class="role-badge" :class="role">{{ role }}</span>
          <NuxtLink to="/dashboard" class="btn btn-secondary">Dashboard</NuxtLink>
        </div>
      </header>

      <!-- Loading state -->
      <div v-if="isLoading" class="loading">Loading permissions...</div>

      <!-- Not authenticated -->
      <div v-else-if="!isAuthenticated" class="not-auth">
        <p>You need to sign in to try the permission system.</p>
        <NuxtLink to="/auth/signin" class="btn btn-primary">Sign In</NuxtLink>
      </div>

      <!-- No organization - show create org form and pending invites -->
      <div v-else-if="!orgId" class="content">
        <!-- Pending Invites -->
        <section v-if="myInvites?.length" class="section">
          <h2>Pending Invitations</h2>
          <p class="hint">You have been invited to join these organizations:</p>
          <div class="invites-list">
            <div v-for="invite in myInvites" :key="invite._id" class="invite-card">
              <div class="invite-info">
                <span
                  class="invite-org"
                  >{{ getOrgName(invite.organizationId) || 'Organization' }}</span
                >
                <span class="role-badge small" :class="invite.role">{{ invite.role }}</span>
              </div>
              <button
                class="btn btn-primary btn-small"
                :disabled="isAcceptingInvite === invite._id"
                @click="handleAcceptInvite(invite._id)"
              >
                {{ isAcceptingInvite === invite._id ? 'Accepting...' : 'Accept' }}
              </button>
            </div>
          </div>
        </section>

        <!-- Existing Organizations - using status for explicit state handling -->
        <section class="section">
          <h2>Existing Organizations</h2>
          <p class="hint">Browse available organizations:</p>
          <ClientOnly>
            <!-- pending: show skeleton -->
            <div v-if="allOrganizationsStatus === 'pending'" class="organizations-list">
              <div v-for="i in 3" :key="i" class="skeleton-org-card">
                <div class="skeleton-org-info">
                  <div class="skeleton skeleton-org-name" />
                  <div class="skeleton skeleton-org-slug" />
                </div>
                <div class="skeleton skeleton-btn small" />
              </div>
            </div>
            <!-- error: show error message -->
            <div v-else-if="allOrganizationsStatus === 'error'" class="error-box">
              Failed to load organizations: {{ allOrganizationsError?.message }}
            </div>
            <!-- success but empty -->
            <div
              v-else-if="allOrganizationsStatus === 'success' && !allOrganizations?.length"
              class="empty"
            >
              No organizations found.
            </div>
            <!-- success with data -->
            <div v-else-if="allOrganizationsStatus === 'success'" class="organizations-list">
              <div v-for="org in allOrganizations" :key="org._id" class="org-card">
                <div class="org-info">
                  <span class="org-name">{{ org.name }}</span>
                  <span class="org-slug">@{{ org.slug }}</span>
                </div>
                <div class="org-actions">
                  <span v-if="hasInviteForOrg(org._id)" class="hint"
                    >You have a pending invite</span
                  >
                  <button
                    v-else
                    class="btn btn-secondary btn-small"
                    :disabled="isRequestingJoin === org._id"
                    @click="handleRequestJoin(org._id)"
                  >
                    {{ isRequestingJoin === org._id ? 'Requesting...' : 'Request to Join' }}
                  </button>
                </div>
              </div>
            </div>
            <template #fallback>
              <div class="organizations-list">
                <div v-for="i in 3" :key="i" class="skeleton-org-card">
                  <div class="skeleton-org-info">
                    <div class="skeleton skeleton-org-name" />
                    <div class="skeleton skeleton-org-slug" />
                  </div>
                  <div class="skeleton skeleton-btn small" />
                </div>
              </div>
            </template>
          </ClientOnly>
        </section>

        <!-- Create Organization -->
        <section class="section">
          <h2>Create Your Organization</h2>
          <p class="hint">You need an organization to use the permission system.</p>
          <form class="form" @submit.prevent="handleCreateOrg">
            <div class="form-group">
              <label>Organization Name</label>
              <input v-model="newOrgName" type="text" placeholder="My Company" required />
            </div>
            <div class="form-group">
              <label>Slug</label>
              <input v-model="newOrgSlug" type="text" placeholder="my-company" required />
            </div>
            <button type="submit" class="btn btn-primary" :disabled="isCreatingOrg">
              {{ isCreatingOrg ? 'Creating...' : 'Create Organization' }}
            </button>
            <p v-if="createOrgError" class="error-inline">
              {{ createOrgError.message }}
            </p>
          </form>
        </section>
      </div>

      <!-- Main content - has organization -->
      <div v-else class="content">
        <!-- Permission Context Debug -->
        <section class="section">
          <h2>Your Permission Context</h2>
          <div class="info-grid">
            <div class="info-item">
              <span class="label">Role</span>
              <span class="value role" :class="role">{{ role }}</span>
            </div>
            <div class="info-item">
              <span class="label">Organization</span>
              <ClientOnly>
                <span
                  v-if="currentOrgStatus === 'pending'"
                  class="skeleton skeleton-text"
                  style="width: 120px; display: inline-block;"
                />
                <span
                  v-else-if="currentOrgStatus === 'success'"
                  class="value"
                  >{{ currentOrg?.name || orgId }}</span
                >
                <span v-else-if="currentOrgStatus === 'error'" class="value error"
                  >Failed to load</span
                >
                <template #fallback>
                  <span
                    class="skeleton skeleton-text"
                    style="width: 120px; display: inline-block;"
                  />
                </template>
              </ClientOnly>
            </div>
            <div class="info-item">
              <span class="label">User ID</span>
              <span class="value id">{{ user?.userId }}</span>
            </div>
          </div>

          <!-- Leave Organization (non-owners only) -->
          <div v-if="role !== 'owner'" class="leave-org">
            <button class="btn btn-danger" :disabled="isLeavingOrg" @click="handleLeaveOrg">
              {{ isLeavingOrg ? 'Leaving...' : 'Leave Organization' }}
            </button>
          </div>
        </section>

        <!-- Organization Settings (owner only) -->
        <section v-if="can('org.settings')" class="section">
          <h2>Organization Settings</h2>
          <p class="hint">Only the organization owner can edit these settings.</p>

          <div v-if="!isEditingSettings" class="settings-view">
            <div class="info-grid">
              <div class="info-item">
                <span class="label">Name</span>
                <span class="value">{{ currentOrg?.name }}</span>
              </div>
              <div class="info-item">
                <span class="label">Slug</span>
                <span class="value id">@{{ currentOrg?.slug }}</span>
              </div>
            </div>
            <button class="btn btn-secondary" @click="startEditSettings">Edit Settings</button>
          </div>

          <div v-else class="settings-edit">
            <form class="form" @submit.prevent="handleSaveSettings">
              <div class="form-group">
                <label>Organization Name</label>
                <input v-model="editOrgName" type="text" required />
              </div>
              <div class="form-actions">
                <button type="submit" class="btn btn-primary" :disabled="isSavingSettings">
                  {{ isSavingSettings ? 'Saving...' : 'Save Changes' }}
                </button>
                <button type="button" class="btn btn-secondary" @click="cancelEditSettings">
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </section>

        <!-- Permission Matrix -->
        <section class="section">
          <h2>Permission Matrix</h2>
          <p class="hint">Shows what you can do with your current role.</p>
          <div class="permission-grid">
            <div class="permission-item" :class="{ allowed: can('org.settings') }">
              <span class="perm-name">org.settings</span>
              <span class="perm-status">{{ can('org.settings') ? '✓' : '✗' }}</span>
            </div>
            <div class="permission-item" :class="{ allowed: can('org.invite') }">
              <span class="perm-name">org.invite</span>
              <span class="perm-status">{{ can('org.invite') ? '✓' : '✗' }}</span>
            </div>
            <div class="permission-item" :class="{ allowed: can('org.members') }">
              <span class="perm-name">org.members</span>
              <span class="perm-status">{{ can('org.members') ? '✓' : '✗' }}</span>
            </div>
            <div class="permission-item" :class="{ allowed: can('post.create') }">
              <span class="perm-name">post.create</span>
              <span class="perm-status">{{ can('post.create') ? '✓' : '✗' }}</span>
            </div>
            <div class="permission-item" :class="{ allowed: can('post.publish') }">
              <span class="perm-name">post.publish</span>
              <span class="perm-status">{{ can('post.publish') ? '✓' : '✗' }}</span>
            </div>
          </div>
        </section>

        <!-- Posts CRUD Demo -->
        <section class="section">
          <h2>Posts (CRUD Demo)</h2>

          <!-- Create Post Form -->
          <div v-if="can('post.create')" class="create-form">
            <form class="form inline" @submit.prevent="handleCreatePost">
              <input v-model="newPostTitle" type="text" placeholder="New post title..." required />
              <button type="submit" class="btn btn-primary" :disabled="isCreatingPost">
                {{ isCreatingPost ? '...' : 'Create' }}
              </button>
              <span v-if="createPostError" class="error-inline">
                {{ createPostError.message }}
              </span>
            </form>
          </div>
          <div v-else class="hint">You don't have permission to create posts (viewers only)</div>

          <!-- Posts List - using status for explicit state handling -->
          <ClientOnly>
            <!-- pending: show skeleton -->
            <div v-if="postsStatus === 'pending'" class="posts-list">
              <div v-for="i in 3" :key="i" class="skeleton-post-card">
                <div class="skeleton-post-header">
                  <div class="skeleton skeleton-post-title" />
                  <div class="skeleton skeleton-post-status" />
                </div>
                <div class="skeleton skeleton-post-meta" />
                <div class="skeleton-post-actions">
                  <div class="skeleton skeleton-btn small" />
                  <div class="skeleton skeleton-btn small" />
                </div>
              </div>
            </div>
            <!-- error: show error message -->
            <div v-else-if="postsStatus === 'error'" class="error-box">
              Failed to load posts: {{ postsError?.message }}
            </div>
            <!-- success but empty -->
            <div v-else-if="postsStatus === 'success' && !posts?.length" class="empty">
              No posts yet. Create one above!
            </div>
            <!-- success with data -->
            <div v-else-if="postsStatus === 'success'" class="posts-list">
              <div v-for="post in posts" :key="post._id" class="post-card">
                <div class="post-header">
                  <span class="post-title">{{ post.title }}</span>
                  <span class="post-status" :class="post.status">{{ post.status }}</span>
                </div>
                <div class="post-meta">
                  Owner:
                  {{ post.ownerId === user?.userId ? 'You' : post.ownerId.slice(0, 8) + '...' }}
                </div>
                <div class="post-actions">
                  <!-- Edit button - requires post.update permission -->
                  <button
                    v-if="can('post.update', post)"
                    class="btn btn-small"
                    @click="handleEditPost(post)"
                  >
                    Edit
                  </button>
                  <span v-else class="no-permission">No edit</span>

                  <!-- Publish button - requires post.publish permission -->
                  <button
                    v-if="can('post.publish', post) && post.status === 'draft'"
                    class="btn btn-small btn-success"
                    :disabled="isPublishing === post._id"
                    @click="handlePublishPost(post._id)"
                  >
                    {{ isPublishing === post._id ? '...' : 'Publish' }}
                  </button>

                  <!-- Delete button - requires post.delete permission -->
                  <button
                    v-if="can('post.delete', post)"
                    class="btn btn-small btn-danger"
                    :disabled="isDeleting === post._id"
                    @click="handleDeletePost(post._id)"
                  >
                    {{ isDeleting === post._id ? '...' : 'Delete' }}
                  </button>
                  <span v-else class="no-permission">No delete</span>
                </div>
              </div>
            </div>
            <template #fallback>
              <div class="posts-list">
                <div v-for="i in 3" :key="i" class="skeleton-post-card">
                  <div class="skeleton-post-header">
                    <div class="skeleton skeleton-post-title" />
                    <div class="skeleton skeleton-post-status" />
                  </div>
                  <div class="skeleton skeleton-post-meta" />
                  <div class="skeleton-post-actions">
                    <div class="skeleton skeleton-btn small" />
                    <div class="skeleton skeleton-btn small" />
                  </div>
                </div>
              </div>
            </template>
          </ClientOnly>
        </section>

        <!-- Organization Members (Admin+) - using status for explicit state handling -->
        <section v-if="can('org.members')" class="section">
          <h2>Organization Members</h2>
          <ClientOnly>
            <!-- pending: show skeleton -->
            <div v-if="membersStatus === 'pending'" class="members-list">
              <div v-for="i in 3" :key="i" class="skeleton-member-card">
                <div class="skeleton-member-info">
                  <div class="skeleton skeleton-member-name" />
                  <div class="skeleton skeleton-badge small" />
                </div>
                <div class="skeleton skeleton-btn small" />
              </div>
            </div>
            <!-- error: show error message -->
            <div v-else-if="membersStatus === 'error'" class="error-box">
              Failed to load members: {{ membersError?.message }}
            </div>
            <!-- success but empty -->
            <div v-else-if="membersStatus === 'success' && !members?.length" class="empty">
              No members found.
            </div>
            <!-- success with data -->
            <div v-else-if="membersStatus === 'success'" class="members-list">
              <div v-for="member in members" :key="member._id" class="member-card">
                <div class="member-info">
                  <span
                    class="member-name"
                    >{{ member.displayName || member.email || 'Unknown User' }}</span
                  >
                  <span class="role-badge small" :class="member.role">{{ member.role }}</span>
                </div>
                <div class="member-actions">
                  <!-- Role change (owner only for admin promotions) -->
                  <select
                    v-if="member.role !== 'owner' && member.authId !== user?.userId"
                    :value="member.role"
                    class="role-select"
                    :disabled="member.role === 'admin' && role !== 'owner'"
                    @change="handleRoleChange(member._id, ($event.target as HTMLSelectElement).value)"
                  >
                    <option value="admin" :disabled="role !== 'owner'">Admin</option>
                    <option value="member">Member</option>
                    <option value="viewer">Viewer</option>
                  </select>
                  <span v-else-if="member.authId === user?.userId" class="hint">(you)</span>

                  <!-- Remove member button (can't remove owner or yourself) -->
                  <button
                    v-if="member.role !== 'owner' && member.authId !== user?.userId && (role === 'owner' || (role === 'admin' && member.role !== 'admin'))"
                    class="btn btn-small btn-danger"
                    :disabled="isRemovingMember === member._id"
                    @click="handleRemoveMember(member._id)"
                  >
                    {{ isRemovingMember === member._id ? '...' : 'Remove' }}
                  </button>
                </div>
              </div>
            </div>
            <template #fallback>
              <div class="members-list">
                <div v-for="i in 3" :key="i" class="skeleton-member-card">
                  <div class="skeleton-member-info">
                    <div class="skeleton skeleton-member-name" />
                    <div class="skeleton skeleton-badge small" />
                  </div>
                  <div class="skeleton skeleton-btn small" />
                </div>
              </div>
            </template>
          </ClientOnly>
        </section>

        <!-- Invites (Admin+) -->
        <section v-if="can('org.invite')" class="section">
          <h2>Invite Members</h2>
          <form class="form inline" @submit.prevent="handleInvite">
            <input v-model="inviteEmail" type="email" placeholder="email@example.com" required />
            <select v-model="inviteRole" class="role-select">
              <option value="member">Member</option>
              <option value="viewer">Viewer</option>
              <option v-if="role === 'owner'" value="admin">Admin</option>
            </select>
            <button type="submit" class="btn btn-primary" :disabled="isInviting">
              {{ isInviting ? '...' : 'Invite' }}
            </button>
          </form>

          <div v-if="pendingInvites?.length" class="invites-list">
            <h3>Pending Invites</h3>
            <div v-for="invite in pendingInvites" :key="invite._id" class="invite-card">
              <span>{{ invite.email }}</span>
              <span class="role-badge small" :class="invite.role">{{ invite.role }}</span>
              <button class="btn btn-small btn-danger" @click="handleRevokeInvite(invite._id)">
                Revoke
              </button>
            </div>
          </div>
        </section>

        <!-- Error Display -->
        <div v-if="error" class="error-banner">
          {{ error }}
          <button class="close" @click="error = null">&times;</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { api } from '~/convex/_generated/api'
import type { Id } from '~/convex/_generated/dataModel'

// Permissions
const { can, user, role, orgId, isLoading, isAuthenticated } = usePermissions()

// Queries - use status for explicit state management
// status: 'idle' (skipped) | 'pending' (loading) | 'success' (has data) | 'error' (failed)
const {
  data: currentOrg,
  status: currentOrgStatus,
} = useConvexQuery(
  api.organizations.getCurrent,
  computed(() => (orgId.value ? {} : 'skip')),
)

const {
  data: posts,
  status: postsStatus,
  error: postsError,
} = useConvexQuery(
  api.posts.list,
  computed(() => (orgId.value ? {} : 'skip')),
)

const {
  data: members,
  status: membersStatus,
  error: membersError,
} = useConvexQuery(
  api.organizations.getMembers,
  computed(() => (orgId.value && can('org.members') ? {} : 'skip')),
)

const { data: pendingInvites } = useConvexQuery(
  api.invites.listPending,
  computed(() => (orgId.value && can('org.invite') ? {} : 'skip')),
)

// Get my pending invites (when no orgId)
const { data: myInvites, ready: myInvitesReady } = useConvexQuery(
  api.invites.getMyInvites,
  computed(() => (!orgId.value ? {} : 'skip')),
)

// Get organizations for invite display
const orgIdsForInvites = computed(() => {
  if (!myInvites.value?.length) return []
  return myInvites.value.map(invite => invite.organizationId)
})

const { data: allOrgs } = useConvexQuery(
  api.organizations.getByIds,
  computed(() => (orgIdsForInvites.value.length ? { ids: orgIdsForInvites.value } : 'skip')),
)

// Get all organizations (for browsing)
const {
  data: allOrganizations,
  status: allOrganizationsStatus,
  error: allOrganizationsError,
  ready: allOrganizationsReady,
} = useConvexQuery(
  api.organizations.list,
  computed(() => (!orgId.value ? {} : 'skip')),
)

// Wait for initial queries to load before completing navigation
// This blocks client-side navigation until data is ready
await Promise.all([
  myInvitesReady,
  allOrganizationsReady,
])

// Mutations - use pending/error shorthands from new API
const { mutate: createOrg, pending: isCreatingOrg, error: createOrgError } = useConvexMutation(api.organizations.create)
const { mutate: createPost, pending: isCreatingPost, error: createPostError } = useConvexMutation(api.posts.create)
const { mutate: updatePost } = useConvexMutation(api.posts.update)
const { mutate: publishPost } = useConvexMutation(api.posts.publish)
const { mutate: deletePost } = useConvexMutation(api.posts.remove)
const { mutate: changeMemberRole } = useConvexMutation(api.organizations.changeMemberRole)
const { mutate: createInvite, pending: isInviting } = useConvexMutation(api.invites.create)
const { mutate: revokeInvite } = useConvexMutation(api.invites.revoke)
const { mutate: acceptInvite } = useConvexMutation(api.invites.accept)
const { mutate: removeMember } = useConvexMutation(api.organizations.removeMember)
const { mutate: leaveOrg, pending: isLeavingOrg } = useConvexMutation(api.organizations.leave)
const { mutate: updateOrgSettings, pending: isSavingSettings } = useConvexMutation(api.organizations.updateSettings)

// State
const error = ref<string | null>(null)
const newOrgName = ref('')
const newOrgSlug = ref('')
const newPostTitle = ref('')
// ID-based loading refs for per-item tracking (can't use single pending for these)
const isPublishing = ref<Id<'posts'> | null>(null)
const isDeleting = ref<Id<'posts'> | null>(null)
const inviteEmail = ref('')
const inviteRole = ref<'admin' | 'member' | 'viewer'>('member')
const isAcceptingInvite = ref<Id<'invites'> | null>(null)
const isRequestingJoin = ref<Id<'organizations'> | null>(null)
const isRemovingMember = ref<Id<'users'> | null>(null)
const isEditingSettings = ref(false)
const editOrgName = ref('')

// Auto-generate slug from name
watch(newOrgName, (name) => {
  newOrgSlug.value = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
})

// Handlers - pending/error state is automatically tracked by mutations
async function handleCreateOrg() {
  if (!newOrgName.value || !newOrgSlug.value) return
  try {
    await createOrg({ name: newOrgName.value, slug: newOrgSlug.value })
    // Reload page to get new permissions
    window.location.reload()
  }
  catch {
    // Error is automatically tracked by createOrgError shorthand
  }
}

async function handleCreatePost() {
  if (!newPostTitle.value) return
  try {
    await createPost({ title: newPostTitle.value, content: 'Demo content' })
    newPostTitle.value = ''
  }
  catch {
    // Error is automatically tracked by createPostError shorthand
  }
}

async function handleEditPost(post: { _id: Id<'posts'>, title: string }) {
  const newTitle = prompt('New title:', post.title)
  if (!newTitle || newTitle === post.title) return
  error.value = null
  try {
    await updatePost({ id: post._id, title: newTitle })
  }
  catch (e) {
    error.value = e instanceof Error ? e.message : 'Failed to update post'
  }
}

async function handlePublishPost(id: Id<'posts'>) {
  isPublishing.value = id
  error.value = null
  try {
    await publishPost({ id })
  }
  catch (e) {
    error.value = e instanceof Error ? e.message : 'Failed to publish post'
  }
  finally {
    isPublishing.value = null
  }
}

async function handleDeletePost(id: Id<'posts'>) {
  if (!confirm('Delete this post?')) return
  isDeleting.value = id
  error.value = null
  try {
    await deletePost({ id })
  }
  catch (e) {
    error.value = e instanceof Error ? e.message : 'Failed to delete post'
  }
  finally {
    isDeleting.value = null
  }
}

async function handleRoleChange(userId: Id<'users'>, newRole: string) {
  if (!['admin', 'member', 'viewer'].includes(newRole)) return
  error.value = null
  try {
    await changeMemberRole({
      userId,
      newRole: newRole as 'admin' | 'member' | 'viewer',
    })
  }
  catch (e) {
    error.value = e instanceof Error ? e.message : 'Failed to change role'
  }
}

async function handleInvite() {
  if (!inviteEmail.value) return
  error.value = null
  try {
    await createInvite({ email: inviteEmail.value, role: inviteRole.value })
    inviteEmail.value = ''
  }
  catch (e) {
    error.value = e instanceof Error ? e.message : 'Failed to create invite'
  }
}

async function handleRevokeInvite(id: Id<'invites'>) {
  error.value = null
  try {
    await revokeInvite({ id })
  }
  catch (e) {
    error.value = e instanceof Error ? e.message : 'Failed to revoke invite'
  }
}

async function handleAcceptInvite(id: Id<'invites'>) {
  isAcceptingInvite.value = id
  error.value = null
  try {
    await acceptInvite({ id })
    // Reload page to get new permissions
    window.location.reload()
  }
  catch (e) {
    error.value = e instanceof Error ? e.message : 'Failed to accept invite'
  }
  finally {
    isAcceptingInvite.value = null
  }
}

function getOrgName(orgId: Id<'organizations'>): string {
  if (!allOrgs.value) return ''
  const org = allOrgs.value.find(o => o._id === orgId)
  return org?.name || ''
}

function hasInviteForOrg(orgId: Id<'organizations'>): boolean {
  if (!myInvites.value) return false
  return myInvites.value.some(invite => invite.organizationId === orgId)
}

async function handleRequestJoin(orgId: Id<'organizations'>) {
  isRequestingJoin.value = orgId
  error.value = null
  try {
    // For now, just show a message - in a real app, this would send a join request
    // or create an invite request. For simplicity, we'll just show an error message
    // suggesting they contact the organization owner.
    error.value = 'To join this organization, you need to be invited by an admin or owner. Contact the organization owner to request an invite.'
  }
  catch (e) {
    error.value = e instanceof Error ? e.message : 'Failed to request join'
  }
  finally {
    isRequestingJoin.value = null
  }
}

async function handleRemoveMember(userId: Id<'users'>) {
  if (!confirm('Remove this member from the organization?')) return
  isRemovingMember.value = userId
  error.value = null
  try {
    await removeMember({ userId })
  }
  catch (e) {
    error.value = e instanceof Error ? e.message : 'Failed to remove member'
  }
  finally {
    isRemovingMember.value = null
  }
}

async function handleLeaveOrg() {
  if (!confirm('Are you sure you want to leave this organization?')) return
  error.value = null
  try {
    await leaveOrg({})
    // Reload page to get new state
    window.location.reload()
  }
  catch (e) {
    error.value = e instanceof Error ? e.message : 'Failed to leave organization'
  }
}

function startEditSettings() {
  editOrgName.value = currentOrg.value?.name || ''
  isEditingSettings.value = true
}

function cancelEditSettings() {
  isEditingSettings.value = false
}

async function handleSaveSettings() {
  if (!editOrgName.value.trim()) return
  error.value = null
  try {
    await updateOrgSettings({ name: editOrgName.value.trim() })
    isEditingSettings.value = false
  }
  catch (e) {
    error.value = e instanceof Error ? e.message : 'Failed to save settings'
  }
}
</script>

<style scoped>
.container {
  min-height: 100vh;
  padding: 40px 20px;
  background: #f5f5f5;
}

.card {
  background: white;
  border-radius: 12px;
  padding: 30px;
  max-width: 800px;
  margin: 0 auto;
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
}

.header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 30px;
  padding-bottom: 20px;
  border-bottom: 1px solid #e5e7eb;
}

.header-actions {
  display: flex;
  gap: 12px;
  align-items: center;
}

h1 {
  font-size: 1.5rem;
}

h2 {
  font-size: 1.1rem;
  margin-bottom: 16px;
  color: #374151;
}

h3 {
  font-size: 0.95rem;
  margin: 16px 0 8px;
  color: #6b7280;
}

.section {
  margin-bottom: 30px;
  padding-bottom: 20px;
  border-bottom: 1px solid #f3f4f6;
}

.section:last-child {
  border-bottom: none;
  margin-bottom: 0;
  padding-bottom: 0;
}

.loading,
.not-auth,
.empty {
  text-align: center;
  padding: 40px;
  color: #6b7280;
}

.error-box {
  text-align: center;
  padding: 20px;
  background: #fef2f2;
  border: 1px solid #fecaca;
  border-radius: 8px;
  color: #991b1b;
  font-size: 0.9rem;
}

.value.error {
  color: #991b1b;
}

.hint {
  color: #9ca3af;
  font-size: 0.9rem;
  margin-bottom: 12px;
}

/* Role badges */
.role-badge {
  padding: 4px 12px;
  border-radius: 6px;
  font-size: 0.85rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.role-badge.small {
  padding: 2px 8px;
  font-size: 0.75rem;
}

.role-badge.owner {
  background: #fef3c7;
  color: #92400e;
}

.role-badge.admin {
  background: #dbeafe;
  color: #1e40af;
}

.role-badge.member {
  background: #d1fae5;
  color: #065f46;
}

.role-badge.viewer {
  background: #e5e7eb;
  color: #374151;
}

/* Info grid */
.info-grid {
  display: grid;
  gap: 12px;
}

.info-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px;
  background: #f9fafb;
  border-radius: 8px;
}

.label {
  color: #6b7280;
  font-size: 0.9rem;
}

.value {
  font-weight: 500;
}

.value.id {
  font-family: monospace;
  font-size: 0.8rem;
  color: #6b7280;
}

/* Permission grid */
.permission-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
  gap: 8px;
}

.permission-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 12px;
  background: #fef2f2;
  border-radius: 6px;
  border: 1px solid #fecaca;
}

.permission-item.allowed {
  background: #f0fdf4;
  border-color: #86efac;
}

.perm-name {
  font-family: monospace;
  font-size: 0.85rem;
}

.perm-status {
  font-weight: bold;
}

/* Forms */
.form {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.form.inline {
  flex-direction: row;
  align-items: center;
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.form-group label {
  font-size: 0.9rem;
  color: #374151;
}

input,
select {
  padding: 10px 12px;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  font-size: 0.95rem;
}

input:focus,
select:focus {
  outline: none;
  border-color: #3b82f6;
  box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
}

.role-select {
  padding: 6px 10px;
  font-size: 0.85rem;
}

/* Buttons */
.btn {
  padding: 10px 20px;
  border-radius: 6px;
  font-size: 0.95rem;
  font-weight: 500;
  cursor: pointer;
  border: none;
  white-space: nowrap;
}

.btn-small {
  padding: 6px 12px;
  font-size: 0.85rem;
}

.btn-primary {
  background: #3b82f6;
  color: white;
}

.btn-secondary {
  background: #e5e7eb;
  color: #374151;
  text-decoration: none;
}

.btn-success {
  background: #10b981;
  color: white;
}

.btn-danger {
  background: #ef4444;
  color: white;
}

.btn:hover:not(:disabled) {
  opacity: 0.9;
}

.btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

/* Posts list */
.create-form {
  margin-bottom: 16px;
}

.posts-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.post-card {
  padding: 16px;
  background: #f9fafb;
  border-radius: 8px;
  border: 1px solid #e5e7eb;
}

.post-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}

.post-title {
  font-weight: 600;
}

.post-status {
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 0.75rem;
  text-transform: uppercase;
}

.post-status.draft {
  background: #fef3c7;
  color: #92400e;
}

.post-status.published {
  background: #d1fae5;
  color: #065f46;
}

.post-meta {
  font-size: 0.85rem;
  color: #6b7280;
  margin-bottom: 12px;
}

.post-actions {
  display: flex;
  gap: 8px;
  align-items: center;
}

.no-permission {
  font-size: 0.8rem;
  color: #9ca3af;
  font-style: italic;
}

/* Members list */
.members-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.member-card {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px;
  background: #f9fafb;
  border-radius: 8px;
}

.member-info {
  display: flex;
  align-items: center;
  gap: 12px;
}

.member-name {
  font-weight: 500;
}

.member-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

/* Invites */
.invites-list {
  margin-top: 16px;
}

.invite-card {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  padding: 12px;
  background: #fffbeb;
  border-radius: 8px;
  margin-bottom: 8px;
  border: 1px solid #fef3c7;
}

.invite-info {
  display: flex;
  align-items: center;
  gap: 12px;
  flex: 1;
}

.invite-org {
  font-weight: 500;
  color: #374151;
}

/* Organizations list */
.organizations-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 16px;
}

.org-card {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px;
  background: #f9fafb;
  border-radius: 8px;
  border: 1px solid #e5e7eb;
}

.org-info {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.org-name {
  font-weight: 500;
  color: #374151;
}

.org-slug {
  font-size: 0.85rem;
  color: #6b7280;
  font-family: monospace;
}

.org-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

/* Skeleton loaders */
.skeleton {
  background: linear-gradient(90deg, #f0f0f0 25%, #e0e0e0 50%, #f0f0f0 75%);
  background-size: 200% 100%;
  animation: shimmer 1.5s infinite;
  border-radius: 4px;
}

@keyframes shimmer {
  0% {
    background-position: 200% 0;
  }
  100% {
    background-position: -200% 0;
  }
}

.skeleton-text {
  height: 1em;
  width: 100%;
}

.skeleton-text.short {
  width: 60%;
}

.skeleton-text.tiny {
  width: 40%;
}

.skeleton-badge {
  height: 24px;
  width: 60px;
  border-radius: 6px;
}

.skeleton-badge.small {
  height: 20px;
  width: 50px;
}

.skeleton-btn {
  height: 32px;
  width: 70px;
  border-radius: 6px;
}

.skeleton-btn.small {
  height: 28px;
  width: 50px;
}

/* Skeleton cards */
.skeleton-post-card {
  padding: 16px;
  background: #f9fafb;
  border-radius: 8px;
  border: 1px solid #e5e7eb;
}

.skeleton-post-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}

.skeleton-post-title {
  height: 1.1em;
  width: 180px;
}

.skeleton-post-status {
  height: 20px;
  width: 60px;
  border-radius: 4px;
}

.skeleton-post-meta {
  height: 0.85em;
  width: 120px;
  margin-bottom: 12px;
}

.skeleton-post-actions {
  display: flex;
  gap: 8px;
}

.skeleton-member-card {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px;
  background: #f9fafb;
  border-radius: 8px;
}

.skeleton-member-info {
  display: flex;
  align-items: center;
  gap: 12px;
}

.skeleton-member-name {
  height: 1em;
  width: 120px;
}

.skeleton-org-card {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px;
  background: #f9fafb;
  border-radius: 8px;
  border: 1px solid #e5e7eb;
}

.skeleton-org-info {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.skeleton-org-name {
  height: 1em;
  width: 140px;
}

.skeleton-org-slug {
  height: 0.85em;
  width: 100px;
}

.skeleton-invite-card {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  padding: 12px;
  background: #fffbeb;
  border-radius: 8px;
  margin-bottom: 8px;
  border: 1px solid #fef3c7;
}

.skeleton-invite-info {
  display: flex;
  align-items: center;
  gap: 12px;
  flex: 1;
}

.skeleton-invite-org {
  height: 1em;
  width: 120px;
}

/* Inline error - uses mutation error shorthand */
.error-inline {
  color: #991b1b;
  font-size: 0.85rem;
  margin-top: 8px;
}

/* Error banner */
.error-banner {
  position: fixed;
  bottom: 20px;
  left: 50%;
  transform: translateX(-50%);
  background: #fef2f2;
  border: 1px solid #fecaca;
  color: #991b1b;
  padding: 12px 40px 12px 16px;
  border-radius: 8px;
  font-size: 0.9rem;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
}

.error-banner .close {
  position: absolute;
  right: 12px;
  top: 50%;
  transform: translateY(-50%);
  background: none;
  border: none;
  font-size: 1.2rem;
  cursor: pointer;
  color: #991b1b;
}

/* Leave org */
.leave-org {
  margin-top: 20px;
  padding-top: 20px;
  border-top: 1px solid #fecaca;
}

/* Settings */
.settings-view {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.settings-view .btn {
  align-self: flex-start;
}

.settings-edit .form-actions {
  display: flex;
  gap: 12px;
  margin-top: 8px;
}
</style>
