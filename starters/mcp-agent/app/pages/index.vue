<script setup lang="ts">
import AuthSection from '../components/demo/AuthSection.vue'
import ResultsSection from '../components/demo/ResultsSection.vue'
import WorkspaceActionsSection from '../components/demo/WorkspaceActionsSection.vue'

defineOptions({ name: 'McpAgentStarterPage' })

const workspacePromise = useMcpDemoWorkspace()
let resolvedWorkspace: Awaited<typeof workspacePromise> | undefined
const auth = useMcpDemoAuth({
  onSignedIn: async () => {
    resolvedWorkspace ??= await workspacePromise
    await resolvedWorkspace.bootstrapCurrentUser()
  },
  onSignedOut: () => {
    resolvedWorkspace?.resetWorkspace()
  },
})
const authState = reactive(auth)
const workspace = await workspacePromise
resolvedWorkspace = workspace
const workspaceState = reactive(workspace)
</script>

<template>
  <main class="page-shell">
    <header class="page-header">
      <div>
        <p class="eyebrow">Better Convex Nuxt</p>
        <h1>MCP agent starter</h1>
      </div>
      <div class="header-status" data-testid="auth-status">
        <span :class="['status-dot', authState.isAuthenticated ? 'online' : 'idle']" />
        {{ authState.isAuthenticated ? authState.userEmail || 'Signed in' : 'Signed out' }}
      </div>
    </header>

    <AuthSection
      v-if="!authState.isAuthenticated"
      v-model:mode="authState.mode"
      v-model:name="authState.name"
      v-model:email="authState.email"
      v-model:password="authState.password"
      :auth-busy="authState.authBusy"
      :can-submit-auth="authState.canSubmitAuth"
      :auth-submit-label="authState.authSubmitLabel"
      :password-autocomplete="authState.passwordAutocomplete"
      :auth-form-error="authState.authFormError"
      :auth-error="authState.authError"
      :auth-message="authState.authMessage"
      @submit="authState.submitAuth"
    />

    <section v-else class="workspace">
      <div class="toolbar">
        <div>
          <p class="eyebrow">Signed-in workspace</p>
          <h2>{{ workspaceState.selectedOrganizationName }}</h2>
        </div>
        <button
          class="secondary-button"
          data-testid="sign-out"
          type="button"
          @click="authState.handleSignOut"
        >
          Sign out
        </button>
      </div>

      <p
        v-if="workspaceState.bootstrapBusy || authState.isPending"
        class="muted-text"
        data-testid="bootstrap-status"
      >
        Preparing user session...
      </p>
      <p v-if="workspaceState.bootstrapError" class="error-text" data-testid="bootstrap-error">
        {{ workspaceState.bootstrapError }}
      </p>

      <WorkspaceActionsSection
        v-model:selected-organization-id="workspaceState.selectedOrganizationId"
        v-model:organization-name="workspaceState.organizationName"
        v-model:project-name="workspaceState.projectName"
        v-model:service-actor-name="workspaceState.serviceActorName"
        v-model:service-actor-role="workspaceState.serviceActorRole"
        v-model:service-actor-secret="workspaceState.serviceActorSecret"
        v-model:mcp-project-name="workspaceState.mcpProjectName"
        :app-user-ready="workspaceState.appUserReady"
        :organizations="workspaceState.organizations ?? []"
        :action-busy="workspaceState.actionBusy"
        @create-workspace="workspaceState.createWorkspace"
        @create-human-project="workspaceState.createHumanProject"
        @create-agent-credential="workspaceState.createAgentCredential"
        @create-project-through-mcp="workspaceState.createProjectThroughMcp"
      />

      <p v-if="workspaceState.actionError" class="error-text feedback" data-testid="action-error">
        {{ workspaceState.actionError }}
      </p>
      <p
        v-if="workspaceState.actionStatus"
        class="success-text feedback"
        data-testid="action-status"
      >
        {{ workspaceState.actionStatus }}
      </p>

      <ResultsSection
        :projects="workspaceState.projectEntries"
        :service-actors="workspaceState.serviceActorEntries"
      />
    </section>
  </main>
</template>

<style>
.page-shell {
  width: min(1180px, calc(100% - 32px));
  margin: 0 auto;
  padding: 32px 0 56px;
}

.page-shell .page-header,
.page-shell .toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 24px;
}

.page-shell .page-header h1,
.page-shell .toolbar h2,
.page-shell .intro-copy h2 {
  margin: 0;
  color: #151515;
  letter-spacing: 0;
  text-wrap: balance;
}

.page-shell .page-header h1 {
  font-size: clamp(32px, 5vw, 54px);
  line-height: 0.96;
}

.page-shell .toolbar h2,
.page-shell .intro-copy h2 {
  font-size: 28px;
  line-height: 1.08;
}

.page-shell .eyebrow {
  margin: 0 0 8px;
  color: #72531f;
  font-size: 12px;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.page-shell .header-status {
  display: inline-flex;
  align-items: center;
  min-height: 40px;
  gap: 8px;
  padding: 0 12px;
  border-radius: 999px;
  background: #fff;
  color: #3f3f46;
  box-shadow:
    0 1px 2px rgba(0, 0, 0, 0.08),
    0 12px 30px rgba(0, 0, 0, 0.06);
  font-size: 14px;
}

.page-shell .status-dot {
  width: 8px;
  height: 8px;
  border-radius: 999px;
  background: #a1a1aa;
}

.page-shell .status-dot.online {
  background: #12805c;
}

.page-shell .section-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px;
}

.page-shell .auth-layout {
  align-items: start;
}

.page-shell .intro-copy {
  padding: 20px 0;
}

.page-shell .intro-copy p:last-child,
.page-shell .panel p,
.page-shell .muted-text {
  color: #52525b;
  line-height: 1.55;
  text-wrap: pretty;
}

.page-shell .panel {
  display: grid;
  align-content: start;
  gap: 14px;
  padding: 18px;
  border-radius: 8px;
  background: #fff;
  box-shadow:
    0 1px 2px rgba(0, 0, 0, 0.08),
    0 18px 45px rgba(0, 0, 0, 0.07);
}

.page-shell .panel-heading {
  display: flex;
  align-items: flex-start;
  gap: 12px;
}

.page-shell .panel-heading h3,
.page-shell .panel-heading p {
  margin: 0;
}

.page-shell .panel-heading h3 {
  color: #18181b;
  font-size: 17px;
}

.page-shell .step {
  display: grid;
  place-items: center;
  flex: 0 0 auto;
  width: 30px;
  height: 30px;
  border-radius: 999px;
  background: #18181b;
  color: #fff;
  font-size: 13px;
  font-weight: 800;
  font-variant-numeric: tabular-nums;
}

.page-shell .segmented {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 4px;
  padding: 4px;
  border-radius: 8px;
  background: #eceff3;
}

.page-shell .segmented button {
  min-height: 40px;
  border: 0;
  border-radius: 5px;
  background: transparent;
  color: #52525b;
  cursor: pointer;
  font: inherit;
  font-weight: 700;
  transition-property: background-color, color, transform;
  transition-duration: 150ms;
}

.page-shell .segmented button.active {
  background: #fff;
  color: #18181b;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.08);
}

.page-shell label {
  display: grid;
  gap: 6px;
  color: #3f3f46;
  font-size: 13px;
  font-weight: 700;
}

.page-shell input,
.page-shell select {
  width: 100%;
  min-height: 42px;
  box-sizing: border-box;
  border: 1px solid #d4d4d8;
  border-radius: 6px;
  background: #fff;
  color: #18181b;
  font: inherit;
  padding: 0 11px;
}

.page-shell input:focus,
.page-shell select:focus {
  border-color: #2563eb;
  outline: 3px solid rgba(37, 99, 235, 0.18);
}

.page-shell .primary-button,
.page-shell .secondary-button {
  min-height: 42px;
  border: 0;
  border-radius: 6px;
  cursor: pointer;
  font: inherit;
  font-weight: 800;
  transition-property: opacity, transform, background-color;
  transition-duration: 150ms;
}

.page-shell .primary-button {
  background: #18181b;
  color: #fff;
  padding: 0 16px;
}

.page-shell .secondary-button {
  background: #e8edf2;
  color: #18181b;
  padding: 0 14px;
}

.page-shell .primary-button:active,
.page-shell .secondary-button:active,
.page-shell .segmented button:active {
  transform: scale(0.96);
}

.page-shell .primary-button:disabled,
.page-shell .secondary-button:disabled {
  cursor: not-allowed;
  opacity: 0.52;
}

.page-shell .workspace {
  display: grid;
  gap: 16px;
}

.page-shell .secret-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 8px;
}

.page-shell .feedback {
  margin: 0;
}

.page-shell .error-text,
.page-shell .success-text,
.page-shell .empty-state {
  margin: 0;
  border-radius: 6px;
  padding: 10px 12px;
  font-size: 14px;
}

.page-shell .error-text {
  background: #fff0ef;
  color: #b42318;
}

.page-shell .success-text {
  background: #ecfdf3;
  color: #087443;
}

.page-shell .results-layout {
  display: grid;
  grid-template-columns: minmax(0, 1.25fr) minmax(280px, 0.75fr);
  gap: 16px;
}

.page-shell .results-panel {
  min-height: 220px;
}

.page-shell .item-list {
  display: grid;
  gap: 8px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.page-shell .item-list li {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  min-height: 44px;
  padding: 10px 12px;
  border-radius: 6px;
  background: #f6f7f9;
}

.page-shell .item-list strong,
.page-shell .item-list span {
  min-width: 0;
}

.page-shell .item-list strong {
  overflow-wrap: anywhere;
}

.page-shell .item-list span {
  flex: 0 0 auto;
  color: #71717a;
  font-size: 13px;
  font-variant-numeric: tabular-nums;
}

.page-shell .empty-state {
  background: #f6f7f9;
  color: #71717a;
}

.page-shell code {
  border-radius: 5px;
  background: #f1f5f9;
  color: #1f2937;
  padding: 2px 5px;
  font-size: 0.92em;
}

@media (max-width: 820px) {
  .page-shell .page-header,
  .page-shell .toolbar {
    align-items: flex-start;
    flex-direction: column;
  }

  .page-shell .section-grid,
  .page-shell .results-layout {
    grid-template-columns: 1fr;
  }
}
</style>
