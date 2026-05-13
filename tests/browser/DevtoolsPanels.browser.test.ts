import { expect, test } from 'vitest'
import { render } from 'vitest-browser-vue'
import { page } from 'vitest/browser'
import { defineComponent, h } from 'vue'

import AuthPanel from '../../apps/devtools-ui/components/AuthPanel.vue'
import OverviewPanel from '../../apps/devtools-ui/components/OverviewPanel.vue'

const NBadgeStub = defineComponent({
  props: { n: { type: String, default: '' } },
  setup(props, { slots }) {
    return () => h('span', { 'data-variant': props.n }, slots.default?.())
  },
})

const NCodeBlockStub = defineComponent({
  setup() {
    return () => h('pre', { 'data-code-block': 'true' })
  },
})

const NButtonStub = defineComponent({
  emits: ['click'],
  setup(_props, { slots, emit }) {
    return () => h('button', { type: 'button', onClick: () => emit('click') }, slots.default?.())
  },
})

const NIconStub = defineComponent({
  setup() {
    return () => h('span')
  },
})

const NLoadingStub = defineComponent({
  setup() {
    return () => h('span', 'loading')
  },
})

const NCardStub = defineComponent({
  setup(_props, { slots }) {
    return () => h('section', slots.default?.())
  },
})

const SectionBlockStub = defineComponent({
  props: {
    text: { type: String, default: '' },
  },
  setup(props, { slots }) {
    return () => h('section', [props.text ? h('h2', props.text) : null, slots.default?.()])
  },
})

const globalConfig = {
  components: {
    NBadge: NBadgeStub,
    NCodeBlock: NCodeBlockStub,
    NButton: NButtonStub,
    NIcon: NIconStub,
    NLoading: NLoadingStub,
    NCard: NCardStub,
    SectionBlock: SectionBlockStub,
  },
}

test('AuthPanel renders projected permission inventory and latest decision trace', async () => {
  render(AuthPanel, {
    props: {
      authState: {
        isAuthenticated: true,
        isPending: false,
        tokenStatus: 'valid',
        user: { id: 'u1', name: 'Owner User', email: 'owner@example.com' },
        expiresInSeconds: 120,
      },
      accessState: {
        queryName: 'permissions/context.getAccessContext',
        pending: false,
        ready: true,
        ctx: {
          userId: 'u1',
          workspaceId: 'workspace-1',
          role: 'owner',
          can: {
            'todo.read': true,
            'todo.create': false,
          },
        },
        inventory: ['todo.read', 'todo.create'],
        error: null,
      },
      decisionTrace: {
        correlationId: 'corr-1',
        handler: 'domain.todos.setCompleted',
        operation: null,
        tool: null,
        principalKind: 'user',
        actorKind: 'workspace_user',
        workspaceId: 'workspace-1',
        lastEventName: 'authorize.denied',
        lastEventStatus: 'deny',
        denialExplanation: {
          policy: 'todo.update',
          reason: 'Only owners may update this todo.',
          suggestedAction: 'Sign in as the owner or ask an owner to update it.',
        },
        events: [
          {
            name: 'caller.resolved',
            status: 'ok',
            timestamp: 1,
            correlationId: 'corr-1',
            principalKind: 'user',
          },
          {
            name: 'authorize.denied',
            status: 'deny',
            timestamp: 2,
            correlationId: 'corr-1',
            handler: 'domain.todos.setCompleted',
            details: {
              explanation: {
                policy: 'todo.update',
                reason: 'Only owners may update this todo.',
              },
            },
          },
        ],
      },
      observations: [],
      authBootstrapState: null,
      waterfall: null,
      proxyStats: null,
      proxyLoading: false,
    },
    global: globalConfig,
  })

  await expect.element(page.getByText('Projected inventory')).toBeInTheDocument()
  await expect.element(page.getByText('todo.read')).toBeInTheDocument()
  await expect.element(page.getByText('todo.create')).toBeInTheDocument()
  await expect.element(page.getByText('Latest Decision Trace')).toBeInTheDocument()
  await expect
    .element(page.getByText('Only owners may update this todo.').first())
    .toBeInTheDocument()
})

test('OverviewPanel renders a latest decision summary card', async () => {
  render(OverviewPanel, {
    props: {
      queries: [],
      mutations: [],
      authState: null,
      connectionState: {
        isConnected: true,
        hasEverConnected: true,
        connectionRetries: 0,
        inflightRequests: 0,
      },
      errorCount: 0,
      decisionTrace: {
        correlationId: 'corr-2',
        handler: 'domain.runbooks.destroy',
        operation: 'runbook.destroy',
        tool: 'delete-runbook',
        principalKind: 'agent',
        actorKind: 'workspace_user',
        workspaceId: 'workspace-1',
        lastEventName: 'operation.confirm.validated',
        lastEventStatus: 'allow',
        denialExplanation: null,
        events: [],
      },
    },
    global: globalConfig,
  })

  await expect.element(page.getByText('Latest Decision Trace')).toBeInTheDocument()
  await expect.element(page.getByText('domain.runbooks.destroy')).toBeInTheDocument()
  await expect.element(page.getByText('tool: delete-runbook')).toBeInTheDocument()
})
