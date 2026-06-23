import type { Ref } from 'vue'
import type { Id } from '~~/convex/_generated/dataModel'

import { api } from '#convex/api'

type TeamCapabilities = {
  canViewProjects?: boolean
}

export async function useProjectWorkspace(args: {
  selectedTeamId: Ref<string | null>
  teamCapabilities: Ref<TeamCapabilities | null | undefined>
}) {
  const nuxtApp = useNuxtApp()
  const statusFilter = ref<'active' | 'deleted'>('active')
  const renameProject = useConvexMutation(api.projects.rename)
  const softDeleteProject = useConvexMutation(api.projects.softDelete)
  const restoreProject = useConvexMutation(api.projects.restore)

  const projectArgs = computed(() =>
    args.selectedTeamId.value && args.teamCapabilities.value?.canViewProjects
      ? { teamId: args.selectedTeamId.value, status: statusFilter.value }
      : 'skip',
  )
  const {
    results: projects,
    status: projectStatus,
    isLoading: projectsLoading,
    loadMore,
  } = await nuxtApp.runWithContext(() =>
    useConvexPaginatedQuery(api.projects.list, projectArgs, {
      initialNumItems: 20,
    }),
  )

  function loadMoreProjects() {
    loadMore(20)
  }

  async function renameSelectedProject(projectId: Id<'projects'>, name: string) {
    const nextName = name.trim()
    if (!nextName) return

    await renameProject({ projectId, name: nextName })
  }

  async function deleteSelectedProject(projectId: Id<'projects'>) {
    await softDeleteProject({ projectId })
  }

  async function restoreSelectedProject(projectId: Id<'projects'>) {
    await restoreProject({ projectId })
  }

  return {
    statusFilter,
    projects,
    projectStatus,
    projectsLoading,
    loadMoreProjects,
    renameSelectedProject,
    deleteSelectedProject,
    restoreSelectedProject,
  }
}
