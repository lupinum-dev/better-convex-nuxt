import type { Id } from '~~/convex/_generated/dataModel'
import {
  createMcpProjectRequestSchema,
  createOrganizationInputSchema,
  createProjectInputSchema,
  createServiceActorInputSchema,
} from '~~/shared/inputSchemas'

import { api } from '#convex/api'

type ServiceActorRole = 'viewer' | 'member' | 'admin'

function readValidationMessage(result: {
  success: false
  error: { issues: Array<{ message: string }> }
}) {
  return result.error.issues[0]?.message ?? 'Invalid input'
}

export async function useMcpDemoWorkspace() {
  const appUserReady = ref(false)
  const bootstrapError = ref<string | null>(null)
  const bootstrapBusy = ref(false)

  const selectedOrganizationId = ref<Id<'organizations'> | ''>('')
  const organizationName = ref('Acme Agent Workspace')
  const projectName = ref('Human launch plan')
  const serviceActorName = ref('Project assistant')
  const serviceActorRole = ref<ServiceActorRole>('member')
  const serviceActorSecret = ref('')
  const mcpProjectName = ref('MCP generated project')
  const actionError = ref<string | null>(null)
  const actionStatus = ref<string | null>(null)
  const actionBusy = ref(false)

  const organizationsArgs = computed(() => (appUserReady.value ? {} : 'skip'))
  const selectedOrganizationArgs = computed(() =>
    appUserReady.value && selectedOrganizationId.value
      ? { organizationId: selectedOrganizationId.value }
      : 'skip',
  )

  const organizationsQuery = useConvexQuery(api.organizations.listMine, organizationsArgs)
  const projectsQuery = useConvexQuery(api.projects.listForCurrentUser, selectedOrganizationArgs)
  const serviceActorsQuery = useConvexQuery(
    api.serviceActors.listForOrganization,
    selectedOrganizationArgs,
  )

  const upsertCurrent = useConvexMutation(api.users.upsertCurrent)
  const createOrganization = useConvexMutation(api.organizations.create)
  const createProject = useConvexMutation(api.projects.createForCurrentUser)
  const createServiceActor = useConvexMutation(api.serviceActors.create)

  const { data: organizations, refresh: refreshOrganizations } = await organizationsQuery
  const { data: projects, refresh: refreshProjects } = await projectsQuery
  const { data: serviceActors, refresh: refreshServiceActors } = await serviceActorsQuery

  const selectedOrganization = computed(() =>
    organizations.value?.find((organization) => organization.id === selectedOrganizationId.value),
  )
  const selectedOrganizationName = computed(
    () => selectedOrganization.value?.name || 'No organization yet',
  )
  const projectEntries = computed(() =>
    (projects.value ?? []).map((project) => ({
      id: project._id,
      name: project.name,
      creator: project.createdBy.kind === 'user' ? 'human' : 'service actor',
      createdAtLabel: new Intl.DateTimeFormat(undefined, {
        hour: '2-digit',
        minute: '2-digit',
        month: 'short',
        day: 'numeric',
      }).format(project.createdAt),
    })),
  )
  const serviceActorEntries = computed(() =>
    (serviceActors.value ?? []).map((actor) => ({
      id: actor.id,
      name: actor.name,
      summary: `${actor.role} · ${actor.status}`,
    })),
  )

  watch(
    organizations,
    (items) => {
      if (!items?.length) {
        selectedOrganizationId.value = ''
        return
      }
      if (
        !selectedOrganizationId.value ||
        !items.some((item) => item.id === selectedOrganizationId.value)
      ) {
        const [firstOrganization] = items
        if (firstOrganization) {
          selectedOrganizationId.value = firstOrganization.id
        }
      }
    },
    { immediate: true },
  )

  watch(selectedOrganizationId, async (organizationId) => {
    if (!organizationId || !appUserReady.value) return

    await nextTick()
    await Promise.all([refreshProjects(), refreshServiceActors()])
  })

  function resetWorkspace() {
    appUserReady.value = false
    selectedOrganizationId.value = ''
    actionStatus.value = null
    actionError.value = null
    serviceActorSecret.value = ''
  }

  async function bootstrapCurrentUser() {
    if (bootstrapBusy.value) return

    bootstrapBusy.value = true
    bootstrapError.value = null
    try {
      await upsertCurrent({})
      appUserReady.value = true
      await nextTick()
      await refreshOrganizations()
    } catch (error) {
      appUserReady.value = false
      bootstrapError.value = error instanceof Error ? error.message : 'User bootstrap failed'
    } finally {
      bootstrapBusy.value = false
    }
  }

  function setActionResult(status: string) {
    actionStatus.value = status
    actionError.value = null
  }

  function setActionError(error: unknown) {
    actionStatus.value = null
    actionError.value = error instanceof Error ? error.message : 'Action failed'
  }

  async function runAction(action: () => Promise<void>) {
    if (actionBusy.value) return

    actionBusy.value = true
    actionError.value = null
    actionStatus.value = null
    try {
      await action()
    } catch (error) {
      setActionError(error)
    } finally {
      actionBusy.value = false
    }
  }

  async function createWorkspace() {
    await runAction(async () => {
      const parsed = createOrganizationInputSchema.safeParse({ name: organizationName.value })
      if (!parsed.success) {
        throw new Error(readValidationMessage(parsed))
      }

      organizationName.value = parsed.data.name
      const organizationId = await createOrganization(parsed.data)
      selectedOrganizationId.value = organizationId
      await refreshOrganizations()
      setActionResult('Organization created')
    })
  }

  async function createHumanProject() {
    const organizationId = selectedOrganizationId.value
    if (!organizationId) return

    await runAction(async () => {
      const parsed = createProjectInputSchema.safeParse({ name: projectName.value })
      if (!parsed.success) {
        throw new Error(readValidationMessage(parsed))
      }

      projectName.value = parsed.data.name
      await createProject({
        organizationId,
        ...parsed.data,
      })
      projectName.value = 'Human launch plan'
      await refreshProjects()
      setActionResult('Human project created through Convex')
    })
  }

  async function createAgentCredential() {
    const organizationId = selectedOrganizationId.value
    if (!organizationId) return

    await runAction(async () => {
      const parsed = createServiceActorInputSchema.safeParse({
        name: serviceActorName.value,
        role: serviceActorRole.value,
      })
      if (!parsed.success) {
        throw new Error(readValidationMessage(parsed))
      }

      serviceActorName.value = parsed.data.name
      serviceActorRole.value = parsed.data.role
      const created = await createServiceActor({
        organizationId,
        ...parsed.data,
      })
      serviceActorSecret.value = created.bearerToken
      await refreshServiceActors()
      setActionResult(
        'Service actor credential created. The bearer secret is shown once in this browser.',
      )
    })
  }

  async function createProjectThroughMcp() {
    if (!selectedOrganizationId.value || !serviceActorSecret.value) return

    await runAction(async () => {
      const parsed = createMcpProjectRequestSchema.safeParse({
        bearerToken: serviceActorSecret.value,
        name: mcpProjectName.value,
      })
      if (!parsed.success) {
        throw new Error(readValidationMessage(parsed))
      }

      mcpProjectName.value = parsed.data.name
      const response = (await $fetch('/api/demo/mcp-projects', {
        method: 'POST',
        body: parsed.data,
      })) as { content: string[] }

      await refreshProjects()
      setActionResult(response.content[0] ?? 'MCP project created')
    })
  }

  return {
    appUserReady,
    bootstrapError,
    bootstrapBusy,
    selectedOrganizationId,
    organizationName,
    projectName,
    serviceActorName,
    serviceActorRole,
    serviceActorSecret,
    mcpProjectName,
    actionError,
    actionStatus,
    actionBusy,
    organizations,
    selectedOrganizationName,
    projectEntries,
    serviceActorEntries,
    resetWorkspace,
    bootstrapCurrentUser,
    createWorkspace,
    createHumanProject,
    createAgentCredential,
    createProjectThroughMcp,
  }
}
