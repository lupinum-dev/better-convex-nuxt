export type DevtoolsTransportKind = 'broadcast-channel' | 'post-message'

const DEVTOOLS_ENVELOPE_FLAG = '__convexDevtoolsBridge'

interface DevtoolsEnvelope {
  [DEVTOOLS_ENVELOPE_FLAG]: true
  payload: unknown
}

export interface DevtoolsTransportMessageEvent {
  data: unknown
  source?: MessageEventSource | null
}

export type DevtoolsTransportListener = (event: DevtoolsTransportMessageEvent) => void

export interface DevtoolsTransport {
  kind: DevtoolsTransportKind
  postMessage: (message: unknown) => void
  addEventListener: (type: 'message', listener: DevtoolsTransportListener) => void
  removeEventListener: (type: 'message', listener: DevtoolsTransportListener) => void
  close: () => void
}

function wrapMessage(payload: unknown): DevtoolsEnvelope {
  return {
    [DEVTOOLS_ENVELOPE_FLAG]: true,
    payload,
  }
}

function unwrapMessage(data: unknown): { matched: boolean; payload?: unknown } {
  if (!data || typeof data !== 'object') {
    return { matched: false }
  }

  const envelope = data as Partial<DevtoolsEnvelope>
  if (envelope[DEVTOOLS_ENVELOPE_FLAG] !== true) {
    return { matched: false }
  }

  return { matched: true, payload: envelope.payload }
}

function createBroadcastChannelTransport(channelName: string): DevtoolsTransport {
  const channel = new BroadcastChannel(channelName)
  const listenerMap = new Map<DevtoolsTransportListener, (event: MessageEvent) => void>()

  return {
    kind: 'broadcast-channel',
    postMessage(message) {
      channel.postMessage(wrapMessage(message))
    },
    addEventListener(type, listener) {
      if (type !== 'message') return
      const wrapped = (event: MessageEvent) => {
        const unwrapped = unwrapMessage(event.data)
        if (!unwrapped.matched) return
        listener({ data: unwrapped.payload, source: event.source })
      }
      listenerMap.set(listener, wrapped)
      channel.addEventListener('message', wrapped)
    },
    removeEventListener(type, listener) {
      if (type !== 'message') return
      const wrapped = listenerMap.get(listener)
      if (!wrapped) return
      listenerMap.delete(listener)
      channel.removeEventListener('message', wrapped)
    },
    close() {
      for (const wrapped of listenerMap.values()) {
        channel.removeEventListener('message', wrapped)
      }
      listenerMap.clear()
      channel.close()
    },
  }
}

function isWindowProxyLike(value: unknown): value is Window {
  return !!value && typeof value === 'object' && 'postMessage' in value
}

function createAppPostMessageTransport(): DevtoolsTransport {
  const listeners = new Set<DevtoolsTransportListener>()
  const targets = new Set<Window>()

  const onMessage = (event: MessageEvent) => {
    if (event.origin !== window.location.origin) return
    const unwrapped = unwrapMessage(event.data)
    if (!unwrapped.matched) return

    if (isWindowProxyLike(event.source)) {
      targets.add(event.source)
    }

    for (const listener of listeners) {
      listener({ data: unwrapped.payload, source: event.source })
    }
  }

  window.addEventListener('message', onMessage)

  return {
    kind: 'post-message',
    postMessage(message) {
      const wrapped = wrapMessage(message)
      for (const target of targets) {
        target.postMessage(wrapped, window.location.origin)
      }
    },
    addEventListener(type, listener) {
      if (type !== 'message') return
      listeners.add(listener)
    },
    removeEventListener(type, listener) {
      if (type !== 'message') return
      listeners.delete(listener)
    },
    close() {
      listeners.clear()
      targets.clear()
      window.removeEventListener('message', onMessage)
    },
  }
}

function createUiPostMessageTransport(): DevtoolsTransport {
  const listeners = new Set<DevtoolsTransportListener>()

  const onMessage = (event: MessageEvent) => {
    if (event.origin !== window.location.origin) return
    const unwrapped = unwrapMessage(event.data)
    if (!unwrapped.matched) return

    for (const listener of listeners) {
      listener({ data: unwrapped.payload, source: event.source })
    }
  }

  window.addEventListener('message', onMessage)

  return {
    kind: 'post-message',
    postMessage(message) {
      window.parent?.postMessage(wrapMessage(message), window.location.origin)
    },
    addEventListener(type, listener) {
      if (type !== 'message') return
      listeners.add(listener)
    },
    removeEventListener(type, listener) {
      if (type !== 'message') return
      listeners.delete(listener)
    },
    close() {
      listeners.clear()
      window.removeEventListener('message', onMessage)
    },
  }
}

export function createAppDevtoolsTransport(channelName = 'convex-devtools'): DevtoolsTransport {
  try {
    if (typeof BroadcastChannel !== 'undefined') {
      return createBroadcastChannelTransport(channelName)
    }
  } catch {
    // Fall through to postMessage fallback
  }
  return createAppPostMessageTransport()
}

export function createUiDevtoolsTransport(channelName = 'convex-devtools'): DevtoolsTransport {
  try {
    if (typeof BroadcastChannel !== 'undefined') {
      return createBroadcastChannelTransport(channelName)
    }
  } catch {
    // Fall through to postMessage fallback
  }
  return createUiPostMessageTransport()
}

export function cloneDevtoolsPayload<T>(value: T): T {
  try {
    if (typeof structuredClone === 'function') {
      return structuredClone(value)
    }
  } catch {
    // Fall back to JSON clone below.
  }
  return JSON.parse(JSON.stringify(value)) as T
}
