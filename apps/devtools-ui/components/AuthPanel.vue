<script setup lang="ts">
import { computed } from 'vue'

import type {
  EnhancedAuthState,
  AuthWaterfall,
  AccessContextState,
  AuthBootstrapState,
  AuthProxyStats,
  AuthProxyRequest,
  DecisionTraceState,
} from '../../../src/runtime/devtools/types'
import type { TrellisObservationEvent } from '../../../src/runtime/observability/types'

const props = defineProps<{
  authState: EnhancedAuthState | null
  waterfall?: AuthWaterfall | null
  accessState?: AccessContextState | null
  authBootstrapState?: AuthBootstrapState | null
  decisionTrace?: DecisionTraceState | null
  observations?: TrellisObservationEvent[]
  proxyStats?: AuthProxyStats | null
  proxyLoading?: boolean
}>()

defineEmits<{
  clearProxy: []
}>()

const expirationDisplay = computed(() => {
  if (props.authState?.expiresInSeconds === undefined) return '-'
  const mins = Math.floor(props.authState.expiresInSeconds / 60)
  const secs = props.authState.expiresInSeconds % 60
  return `${mins}:${secs.toString().padStart(2, '0')}`
})

// Waterfall helpers
const phaseColors: Record<string, string> = {
  'session-check': '#3b82f6',
  'cache-lookup': '#06b6d4',
  'token-exchange': '#f59e0b',
  'jwt-decode': '#10b981',
  'cache-store': '#ec4899',
}

const phaseNames: Record<string, string> = {
  'session-check': 'Session',
  'cache-lookup': 'Cache',
  'token-exchange': 'Token Exchange',
  'jwt-decode': 'JWT Decode',
  'cache-store': 'Cache Store',
}

function getPhaseColor(phase: { name: string; result: string }): string {
  if (phase.result === 'skipped') return 'var(--un-preset-theme-colors-gray-400, #9ca3af)'
  if (phase.result === 'error') return 'var(--un-preset-theme-colors-red-500, #ef4444)'
  return phaseColors[phase.name] || '#6b7280'
}

function getProxyStatusClass(req: AuthProxyRequest): string {
  if (!req.success) return 'red'
  return 'green'
}

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}

function formatMs(ms: number): string {
  if (ms < 1) return '<1ms'
  if (ms < 1000) return `${Math.round(ms)}ms`
  return `${(ms / 1000).toFixed(2)}s`
}

const permissionEntries = computed(() => {
  const inventory = props.accessState?.inventory ?? []
  const ctx = props.accessState?.ctx
  const can =
    ctx && typeof ctx === 'object' && 'can' in ctx && typeof ctx.can === 'object' && ctx.can
      ? (ctx.can as Record<string, boolean | undefined>)
      : {}

  return inventory.map((key) => ({
    key,
    allowed: Boolean(can[key]),
  }))
})

const permissionContextJson = computed(() =>
  props.accessState ? JSON.stringify(props.accessState, null, 2) : '',
)
const authBootstrapJson = computed(() =>
  props.authBootstrapState ? JSON.stringify(props.authBootstrapState, null, 2) : '',
)

function getDecisionStatusClass(
  status: TrellisObservationEvent['status'] | null | undefined,
): string {
  if (status === 'deny' || status === 'error') return 'red'
  if (status === 'allow' || status === 'ok') return 'green'
  return 'gray'
}

function getDecisionReason(trace: DecisionTraceState): string {
  return (
    trace.denialExplanation?.reason ??
    trace.denialExplanation?.policy ??
    trace.lastEventName ??
    'No explicit explanation'
  )
}
</script>

<template>
  <div class="p-4 space-y-4 overflow-y-auto">
    <!-- Auth State -->
    <SectionBlock text="Auth State" icon="i-carbon-user">
      <div v-if="!authState?.isAuthenticated" class="text-center py-6 op-50">
        <NIcon icon="i-carbon-locked" class="text-3xl mb-2" />
        <div class="text-sm">Not Authenticated</div>
      </div>
      <template v-else>
        <div class="flex items-center gap-4 mb-4">
          <div
            class="w-10 h-10 rounded-full bg-purple-500/20 flex items-center justify-center text-purple-500 font-bold"
          >
            {{
              (authState.sessionUser?.displayName || authState.sessionUser?.email || '?')
                .charAt(0)
                .toUpperCase()
            }}
          </div>
          <div>
            <div class="font-medium">{{ authState.sessionUser?.displayName || 'Unknown' }}</div>
            <div class="text-xs op-50">{{ authState.sessionUser?.email || '' }}</div>
          </div>
        </div>
        <div class="flex gap-4 text-xs mb-4">
          <div class="text-center">
            <NBadge n="green xs">Valid</NBadge>
            <div class="op-50 mt-1">Token</div>
          </div>
          <div class="text-center font-mono">
            <div class="font-bold">{{ expirationDisplay }}</div>
            <div class="op-50 mt-1">Expires</div>
          </div>
        </div>
      </template>
    </SectionBlock>

    <!-- JWT Claims -->
    <SectionBlock v-if="authState?.claims" text="JWT Claims" icon="i-carbon-certificate">
      <NCodeBlock :code="JSON.stringify(authState.claims, null, 2)" lang="json" class="text-xs" />
    </SectionBlock>

    <!-- SSR Auth Waterfall -->
    <SectionBlock v-if="waterfall" text="SSR Auth Waterfall" icon="i-carbon-chart-waterfall">
      <div class="flex gap-4 text-xs mb-3">
        <div>
          <span class="op-50">Total: </span
          ><span class="font-mono font-bold">{{ formatMs(waterfall.totalDuration) }}</span>
        </div>
        <div>
          <span class="op-50">Cache: </span
          ><span
            :class="waterfall.cacheHit ? 'text-green-500' : 'text-amber-500'"
            class="font-bold"
            >{{ waterfall.cacheHit ? 'HIT' : 'MISS' }}</span
          >
        </div>
        <div>
          <span class="op-50">Result: </span><span class="font-bold">{{ waterfall.outcome }}</span>
        </div>
      </div>

      <!-- Bar chart -->
      <div class="flex h-5 rounded overflow-hidden bg-gray/10 mb-3">
        <div
          v-for="(phase, i) in waterfall.phases"
          :key="i"
          class="h-full min-w-1 transition-opacity hover:opacity-80"
          :style="{
            width: Math.max(2, (phase.duration / waterfall.totalDuration) * 100) + '%',
            backgroundColor: getPhaseColor(phase),
          }"
          :title="`${phaseNames[phase.name] || phase.name}: ${formatMs(phase.duration)}`"
        />
      </div>

      <!-- Legend -->
      <div class="space-y-1">
        <div
          v-for="(phase, i) in waterfall.phases"
          :key="i"
          class="flex items-center gap-2 text-xs"
        >
          <span
            class="w-2 h-2 rounded-sm flex-shrink-0"
            :style="{ backgroundColor: getPhaseColor(phase) }"
          />
          <span class="w-28 font-medium">{{ phaseNames[phase.name] || phase.name }}</span>
          <span class="font-mono op-50">{{ formatMs(phase.duration) }}</span>
          <span v-if="phase.details" class="op-40 truncate">{{ phase.details }}</span>
        </div>
      </div>

      <div v-if="waterfall.error" class="mt-3 p-2 rounded bg-red-500/10 text-red-500 text-xs">
        {{ waterfall.error }}
      </div>
    </SectionBlock>

    <!-- Access Context -->
    <SectionBlock v-if="accessState" text="Access Context" icon="i-carbon-security">
      <div class="flex gap-4 text-xs mb-2">
        <div>
          <span class="op-50">Status: </span>
          <span class="font-medium">
            {{ accessState.pending ? 'Loading' : accessState.ready ? 'Ready' : 'Idle' }}
          </span>
        </div>
        <div>
          <span class="op-50">Query: </span>
          <span class="font-mono">{{ accessState.queryName || '-' }}</span>
        </div>
      </div>

      <div v-if="permissionEntries.length > 0" class="mb-3">
        <div class="text-xs op-50 uppercase tracking-wide mb-2">Projected inventory</div>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-2">
          <div
            v-for="permission in permissionEntries"
            :key="permission.key"
            class="flex items-center justify-between gap-3 rounded border border-base bg-gray/5 px-3 py-2 text-xs"
          >
            <span class="font-mono break-all">{{ permission.key }}</span>
            <NBadge :n="`xs ${permission.allowed ? 'green' : 'gray'}`">
              {{ permission.allowed ? 'allowed' : 'denied' }}
            </NBadge>
          </div>
        </div>
      </div>

      <NCodeBlock :code="permissionContextJson" lang="json" class="text-xs" />
    </SectionBlock>

    <!-- Latest Decision Trace -->
    <SectionBlock
      v-if="decisionTrace || (observations?.length ?? 0) > 0"
      text="Latest Decision Trace"
      icon="i-carbon-flow-connection"
    >
      <div v-if="!decisionTrace" class="text-xs op-50">No correlated decision trace yet.</div>

      <template v-else>
        <div class="flex flex-wrap items-center gap-2 text-xs mb-3">
          <NBadge :n="`xs ${getDecisionStatusClass(decisionTrace.lastEventStatus)}`">
            {{ decisionTrace.lastEventStatus || 'unknown' }}
          </NBadge>
          <span v-if="decisionTrace.handler" class="font-mono">{{ decisionTrace.handler }}</span>
          <span v-if="decisionTrace.tool" class="op-60">tool: {{ decisionTrace.tool }}</span>
          <span v-if="decisionTrace.operation" class="op-60"
            >operation: {{ decisionTrace.operation }}</span
          >
          <span v-if="decisionTrace.correlationId" class="font-mono op-40 break-all">{{
            decisionTrace.correlationId
          }}</span>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs mb-3">
          <div class="rounded border border-base bg-gray/5 px-3 py-2">
            <div class="op-50 uppercase tracking-wide mb-1">Identity</div>
            <div>Principal: {{ decisionTrace.principalKind || '-' }}</div>
            <div>AppIdentity: {{ decisionTrace.actorKind || '-' }}</div>
            <div>Tenant: {{ decisionTrace.tenantId || '-' }}</div>
          </div>

          <div class="rounded border border-base bg-gray/5 px-3 py-2 md:col-span-2">
            <div class="op-50 uppercase tracking-wide mb-1">Explanation</div>
            <div class="font-medium">{{ getDecisionReason(decisionTrace) }}</div>
            <div v-if="decisionTrace.denialExplanation?.suggestedAction" class="op-60 mt-1">
              {{ decisionTrace.denialExplanation?.suggestedAction }}
            </div>
          </div>
        </div>

        <div class="text-xs op-50 uppercase tracking-wide mb-2">Trace events</div>
        <div class="space-y-2">
          <div
            v-for="(event, index) in decisionTrace.events"
            :key="`${event.name}-${index}-${event.timestamp}`"
            class="rounded border border-base bg-gray/5 px-3 py-2"
          >
            <div class="flex flex-wrap items-center gap-2 text-xs mb-1">
              <NBadge :n="`xs ${getDecisionStatusClass(event.status)}`">{{ event.status }}</NBadge>
              <span class="font-mono">{{ event.name }}</span>
              <span v-if="event.handler" class="op-60">{{ event.handler }}</span>
              <span class="op-40">{{ formatTime(event.timestamp) }}</span>
            </div>
            <div
              v-if="event.details?.message || event.details?.explanation?.reason"
              class="text-xs op-70"
            >
              {{ event.details?.message || event.details?.explanation?.reason }}
            </div>
          </div>
        </div>
      </template>
    </SectionBlock>

    <!-- Auth Bootstrap -->
    <SectionBlock v-if="authBootstrapState" text="Auth Bootstrap" icon="i-carbon-launch">
      <NCodeBlock :code="authBootstrapJson" lang="json" class="text-xs" />
    </SectionBlock>

    <!-- Auth Proxy Stats -->
    <SectionBlock text="Auth Proxy (SSR)" icon="i-carbon-arrow-right">
      <template #actions>
        <NButton
          v-if="proxyStats && proxyStats.totalRequests > 0"
          n="xs red"
          icon="i-carbon-trash-can"
          @click="$emit('clearProxy')"
        >
          Clear
        </NButton>
      </template>

      <div v-if="proxyLoading" class="text-center py-4 op-50">
        <NLoading />
      </div>

      <div
        v-else-if="!proxyStats || proxyStats.totalRequests === 0"
        class="text-center py-4 op-50 text-xs"
      >
        No proxy requests yet
      </div>

      <template v-else>
        <div class="flex gap-4 text-xs mb-3 p-3 rounded bg-gray/5 border border-base">
          <div class="text-center flex-1">
            <div class="text-lg font-bold font-mono">{{ proxyStats.totalRequests }}</div>
            <div class="op-50 uppercase text-xs">Requests</div>
          </div>
          <div class="text-center flex-1">
            <div class="text-lg font-bold font-mono text-green-500">
              {{ proxyStats.successCount }}
            </div>
            <div class="op-50 uppercase text-xs">Success</div>
          </div>
          <div class="text-center flex-1">
            <div class="text-lg font-bold font-mono text-red-500">{{ proxyStats.errorCount }}</div>
            <div class="op-50 uppercase text-xs">Errors</div>
          </div>
          <div class="text-center flex-1">
            <div class="text-lg font-bold font-mono">{{ proxyStats.avgDuration }}ms</div>
            <div class="op-50 uppercase text-xs">Avg</div>
          </div>
        </div>

        <div class="border border-base rounded overflow-hidden max-h-50 overflow-y-auto">
          <div
            v-for="req in proxyStats.recentRequests"
            :key="req.id"
            class="flex items-center gap-3 px-3 py-2 text-xs font-mono border-b border-base last:border-0 hover:bg-hover"
          >
            <span
              class="font-bold min-w-12"
              :class="req.method === 'GET' ? 'text-green-500' : 'text-blue-500'"
              >{{ req.method }}</span
            >
            <span class="flex-1 truncate">{{ req.path }}</span>
            <NBadge :n="`xs ${getProxyStatusClass(req)}`">{{ req.status || 'ERR' }}</NBadge>
            <span class="op-50 min-w-12 text-right">{{ req.duration }}ms</span>
            <span class="op-40 min-w-16 text-right">{{ formatTime(req.timestamp) }}</span>
          </div>
        </div>
      </template>
    </SectionBlock>
  </div>
</template>
