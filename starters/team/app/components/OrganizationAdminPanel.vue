<script setup lang="ts">
import type { OrganizationSummary, Team } from '~/utils/organizationModels'

const selectedTeamId = defineModel<string | null>('selectedTeamId', { required: true })
const orgName = defineModel<string>('orgName', { required: true })
const teamName = defineModel<string>('teamName', { required: true })
const teamRenameName = defineModel<string>('teamRenameName', { required: true })

defineProps<{
  organization: OrganizationSummary
  role?: string | null
  canManageOrganization?: boolean
  canManageTeams?: boolean
  teams: Team[]
  selectedTeam: Team | null
  teamsPending: boolean
  teamsError: string | null
  orgRenamePending: boolean
  orgRenameError: string | null
  teamRenamePending: boolean
  teamRenameError: string | null
  teamCreatePending: boolean
  teamCreateError: string | null
  onRenameOrganization: () => void
  onRenameTeam: () => void
  onCreateTeam: () => void
}>()
</script>

<template>
  <section class="toolbar">
    <span>Role: {{ role ?? 'member' }}</span>
  </section>

  <form v-if="canManageOrganization" class="toolbar" @submit.prevent="onRenameOrganization">
    <input v-model="orgName" placeholder="Organization name" :disabled="orgRenamePending" />
    <button
      class="button"
      type="submit"
      :disabled="orgRenamePending || !orgName.trim() || orgName === organization.name"
    >
      Rename organization
    </button>
  </form>
  <section v-if="orgRenameError" class="empty">{{ orgRenameError }}</section>

  <section class="toolbar">
    <label>
      Team
      <select v-model="selectedTeamId" :disabled="teamsPending || teams.length === 0">
        <option v-for="team in teams" :key="team.id" :value="team.id">
          {{ team.name }}
        </option>
      </select>
    </label>
  </section>
  <form v-if="canManageTeams && selectedTeam" class="toolbar" @submit.prevent="onRenameTeam">
    <input
      v-model="teamRenameName"
      placeholder="Team name"
      :disabled="teamRenamePending || !selectedTeam"
    />
    <button
      class="button"
      type="submit"
      :disabled="
        teamRenamePending ||
        !teamRenameName.trim() ||
        !selectedTeam ||
        teamRenameName.trim() === selectedTeam.name
      "
    >
      Rename team
    </button>
  </form>
  <section v-if="teamRenameError" class="empty">{{ teamRenameError }}</section>

  <form v-if="canManageTeams" class="toolbar" @submit.prevent="onCreateTeam">
    <input v-model="teamName" placeholder="Team name" :disabled="teamCreatePending" />
    <button class="button" type="submit" :disabled="teamCreatePending || !teamName.trim()">
      Create team
    </button>
  </form>
  <section v-if="teamCreateError" class="empty">{{ teamCreateError }}</section>

  <section v-if="teamsError" class="empty">{{ teamsError }}</section>
  <section v-else-if="teamsPending" class="empty">Loading teams...</section>
  <section v-else-if="!selectedTeam" class="empty">No teams available.</section>
</template>
