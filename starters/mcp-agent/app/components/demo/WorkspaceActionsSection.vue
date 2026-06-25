<script setup lang="ts">
type OrganizationOption = {
  id: string
  name: string
  role: string
}

const selectedOrganizationId = defineModel<string>('selectedOrganizationId', { required: true })
const organizationName = defineModel<string>('organizationName', { required: true })
const projectName = defineModel<string>('projectName', { required: true })
const serviceActorName = defineModel<string>('serviceActorName', { required: true })
const serviceActorRole = defineModel<'viewer' | 'member' | 'admin'>('serviceActorRole', {
  required: true,
})
const serviceActorSecret = defineModel<string>('serviceActorSecret', { required: true })
const mcpProjectName = defineModel<string>('mcpProjectName', { required: true })

defineProps<{
  appUserReady: boolean
  organizations?: OrganizationOption[]
  actionBusy: boolean
}>()

defineEmits<{
  createWorkspace: []
  createHumanProject: []
  createAgentCredential: []
  createProjectThroughMcp: []
}>()
</script>

<template>
  <div class="section-grid">
    <section class="panel">
      <div class="panel-heading">
        <span class="step">1</span>
        <div>
          <h3>Organization</h3>
          <p>Create an app-owned organization and owner membership.</p>
        </div>
      </div>

      <label>
        Organization name
        <input v-model="organizationName" data-testid="org-name" />
      </label>
      <button
        class="primary-button"
        data-testid="create-org"
        :disabled="actionBusy || !appUserReady"
        type="button"
        @click="$emit('createWorkspace')"
      >
        Create organization
      </button>

      <label v-if="organizations?.length" class="select-label">
        Active organization
        <select v-model="selectedOrganizationId" data-testid="org-select">
          <option
            v-for="organization in organizations"
            :key="organization.id"
            :value="organization.id"
          >
            {{ organization.name }} · {{ organization.role }}
          </option>
        </select>
      </label>
    </section>

    <section class="panel">
      <div class="panel-heading">
        <span class="step">2</span>
        <div>
          <h3>Human project</h3>
          <p>Call the human wrapper with membership enforcement.</p>
        </div>
      </div>

      <label>
        Project name
        <input v-model="projectName" data-testid="human-project-name" />
      </label>
      <button
        class="primary-button"
        data-testid="create-human-project"
        :disabled="actionBusy || !selectedOrganizationId"
        type="button"
        @click="$emit('createHumanProject')"
      >
        Create as user
      </button>
    </section>

    <section class="panel">
      <div class="panel-heading">
        <span class="step">3</span>
        <div>
          <h3>Service actor</h3>
          <p>Mint a bearer secret in Convex and store only its hash.</p>
        </div>
      </div>

      <label>
        Actor name
        <input v-model="serviceActorName" data-testid="service-actor-name" />
      </label>
      <label>
        Role
        <select v-model="serviceActorRole" data-testid="service-actor-role">
          <option value="viewer">viewer</option>
          <option value="member">member</option>
          <option value="admin">admin</option>
        </select>
      </label>
      <div class="secret-row">
        <input
          v-model="serviceActorSecret"
          aria-label="Bearer secret"
          data-testid="service-actor-secret"
          readonly
          placeholder="Create a service actor to mint a bearer secret"
        />
      </div>
      <button
        class="primary-button"
        data-testid="create-service-actor"
        :disabled="actionBusy || !selectedOrganizationId"
        type="button"
        @click="$emit('createAgentCredential')"
      >
        Create service actor
      </button>
    </section>

    <section class="panel">
      <div class="panel-heading">
        <span class="step">4</span>
        <div>
          <h3>MCP call</h3>
          <p>Call <code>projects.create</code> through this app's real MCP route.</p>
        </div>
      </div>

      <label>
        MCP project name
        <input v-model="mcpProjectName" data-testid="mcp-project-name" />
      </label>
      <button
        class="primary-button"
        data-testid="create-mcp-project"
        :disabled="actionBusy || !selectedOrganizationId || !serviceActorSecret"
        type="button"
        @click="$emit('createProjectThroughMcp')"
      >
        Create through MCP
      </button>
    </section>
  </div>
</template>
