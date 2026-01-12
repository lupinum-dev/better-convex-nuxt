/**
 * Server handler for DevTools UI.
 * Serves a full-featured debugging interface with:
 * - Query Data Explorer (master-detail view)
 * - Mutation Timeline
 * - Auth Inspector with JWT claims
 * - Event Log
 */
import { defineEventHandler, setHeader } from 'h3'

const DEVTOOLS_HTML = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Convex DevTools</title>
  <style>
    /* Dark mode (default) */
    :root {
      --bg: #1e1e1e;
      --bg-secondary: #252526;
      --bg-tertiary: #1a1a1a;
      --bg-hover: #2a2d2e;
      --border: #3c3c3c;
      --text: #cccccc;
      --text-secondary: #8b8b8b;
      --accent: #ee8944;
      --accent-hover: #f59e0b;
      --success: #4ade80;
      --success-bg: rgba(74, 222, 128, 0.15);
      --error: #f87171;
      --error-bg: rgba(248, 113, 113, 0.15);
      --warning: #fbbf24;
      --warning-bg: rgba(251, 191, 36, 0.15);
      --info: #60a5fa;
      --info-bg: rgba(96, 165, 250, 0.15);
      --scrollbar-bg: #1e1e1e;
      --scrollbar-thumb: #424242;
      --json-key: #9cdcfe;
      --json-string: #ce9178;
      --json-number: #b5cea8;
      --json-boolean: #569cd6;
      --json-null: #569cd6;
    }

    /* Light mode */
    @media (prefers-color-scheme: light) {
      :root {
        --bg: #ffffff;
        --bg-secondary: #f5f5f5;
        --bg-tertiary: #fafafa;
        --bg-hover: #ebebeb;
        --border: #e0e0e0;
        --text: #1f1f1f;
        --text-secondary: #6b6b6b;
        --accent: #d97706;
        --accent-hover: #b45309;
        --success: #16a34a;
        --success-bg: rgba(22, 163, 74, 0.1);
        --error: #dc2626;
        --error-bg: rgba(220, 38, 38, 0.1);
        --warning: #ca8a04;
        --warning-bg: rgba(202, 138, 4, 0.1);
        --info: #2563eb;
        --info-bg: rgba(37, 99, 235, 0.1);
        --scrollbar-bg: #f5f5f5;
        --scrollbar-thumb: #c4c4c4;
        --json-key: #0451a5;
        --json-string: #a31515;
        --json-number: #098658;
        --json-boolean: #0000ff;
        --json-null: #0000ff;
      }
    }

    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }

    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
      font-size: 13px;
      background: var(--bg);
      color: var(--text);
      line-height: 1.5;
      height: 100vh;
      overflow: hidden;
    }

    /* Custom scrollbar */
    ::-webkit-scrollbar { width: 8px; height: 8px; }
    ::-webkit-scrollbar-track { background: var(--scrollbar-bg); }
    ::-webkit-scrollbar-thumb { background: var(--scrollbar-thumb); border-radius: 4px; }
    ::-webkit-scrollbar-thumb:hover { background: var(--text-secondary); }

    /* App Shell */
    .app-shell {
      display: flex;
      flex-direction: column;
      height: 100vh;
    }

    /* Header */
    .header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 12px 16px;
      border-bottom: 1px solid var(--border);
      background: var(--bg-secondary);
      flex-shrink: 0;
    }

    .header-left {
      display: flex;
      align-items: center;
      gap: 10px;
    }

    .logo {
      display: flex;
      align-items: center;
      gap: 8px;
      font-weight: 600;
      font-size: 14px;
    }

    .logo-icon { color: var(--accent); }

    .status-bar {
      display: flex;
      align-items: center;
      gap: 16px;
      font-size: 12px;
    }

    .status-item {
      display: flex;
      align-items: center;
      gap: 6px;
    }

    .status-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      flex-shrink: 0;
    }

    .status-dot.connected { background: var(--success); box-shadow: 0 0 6px var(--success); }
    .status-dot.disconnected { background: var(--error); }
    .status-dot.pending { background: var(--warning); animation: pulse 1.5s infinite; }

    @keyframes pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.4; }
    }

    /* Tabs */
    .tabs {
      display: flex;
      gap: 0;
      border-bottom: 1px solid var(--border);
      background: var(--bg-secondary);
      flex-shrink: 0;
      overflow-x: auto;
    }

    .tab {
      padding: 10px 20px;
      background: transparent;
      border: none;
      border-bottom: 2px solid transparent;
      color: var(--text-secondary);
      cursor: pointer;
      font-size: 13px;
      font-weight: 500;
      font-family: inherit;
      white-space: nowrap;
      transition: all 0.15s;
    }

    .tab:hover {
      color: var(--text);
      background: var(--bg-hover);
    }

    .tab.active {
      color: var(--accent);
      border-bottom-color: var(--accent);
    }

    .tab-badge {
      margin-left: 6px;
      padding: 1px 6px;
      background: var(--bg-hover);
      border-radius: 10px;
      font-size: 11px;
      font-weight: 600;
    }

    .tab.active .tab-badge {
      background: var(--accent);
      color: white;
    }

    /* Tab Content */
    .tab-content {
      flex: 1;
      overflow: hidden;
      display: none;
    }

    .tab-content.active {
      display: flex;
      flex-direction: column;
    }

    /* Master-Detail Layout */
    .master-detail {
      display: flex;
      flex: 1;
      overflow: hidden;
    }

    .master-list {
      width: 280px;
      min-width: 200px;
      border-right: 1px solid var(--border);
      overflow-y: auto;
      flex-shrink: 0;
    }

    .detail-panel {
      flex: 1;
      overflow-y: auto;
      background: var(--bg-tertiary);
    }

    /* List Items */
    .list-item {
      padding: 12px 14px;
      border-bottom: 1px solid var(--border);
      cursor: pointer;
      transition: background 0.15s;
    }

    .list-item:hover {
      background: var(--bg-hover);
    }

    .list-item.selected {
      background: var(--bg-hover);
      border-left: 3px solid var(--accent);
      padding-left: 11px;
    }

    .list-item-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 4px;
    }

    .list-item-name {
      font-weight: 500;
      color: var(--accent);
      font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, monospace;
      font-size: 12px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .list-item-meta {
      font-size: 11px;
      color: var(--text-secondary);
      display: flex;
      gap: 8px;
    }

    /* Status Badges */
    .badge {
      font-size: 10px;
      padding: 2px 6px;
      border-radius: 4px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.3px;
    }

    .badge.success { background: var(--success-bg); color: var(--success); }
    .badge.error { background: var(--error-bg); color: var(--error); }
    .badge.pending { background: var(--warning-bg); color: var(--warning); }
    .badge.optimistic { background: var(--info-bg); color: var(--info); }

    /* Detail Sections */
    .detail-section {
      padding: 16px;
      border-bottom: 1px solid var(--border);
    }

    .detail-section:last-child {
      border-bottom: none;
    }

    .detail-title {
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      color: var(--text-secondary);
      margin-bottom: 10px;
      font-weight: 600;
    }

    .detail-row {
      display: flex;
      justify-content: space-between;
      padding: 6px 0;
    }

    .detail-label {
      color: var(--text-secondary);
      font-size: 12px;
    }

    .detail-value {
      font-weight: 500;
      font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, monospace;
      font-size: 12px;
    }

    /* JSON Viewer */
    .json-viewer {
      font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, monospace;
      font-size: 11px;
      background: var(--bg);
      padding: 12px;
      border-radius: 6px;
      max-height: 200px;
      overflow: auto;
      white-space: pre-wrap;
      word-break: break-all;
      border: 1px solid var(--border);
    }

    .json-key { color: var(--json-key); }
    .json-string { color: var(--json-string); }
    .json-number { color: var(--json-number); }
    .json-boolean { color: var(--json-boolean); }
    .json-null { color: var(--json-null); }

    /* Options Grid */
    .options-grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 8px;
    }

    .option-item {
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: 12px;
    }

    .option-icon {
      width: 14px;
      height: 14px;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .option-icon.enabled { color: var(--success); }
    .option-icon.disabled { color: var(--text-secondary); }

    /* Timeline */
    .timeline {
      padding: 0;
      overflow-y: auto;
      flex: 1;
    }

    .timeline-item {
      padding: 14px 16px;
      border-bottom: 1px solid var(--border);
      cursor: pointer;
      transition: background 0.15s;
    }

    .timeline-item:hover {
      background: var(--bg-hover);
    }

    .timeline-item.expanded {
      background: var(--bg-secondary);
    }

    .timeline-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin-bottom: 6px;
    }

    .timeline-name {
      font-weight: 500;
      color: var(--accent);
      font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, monospace;
      font-size: 12px;
    }

    .timeline-time {
      font-size: 11px;
      color: var(--text-secondary);
    }

    .timeline-meta {
      display: flex;
      align-items: center;
      gap: 10px;
      font-size: 11px;
      color: var(--text-secondary);
    }

    .timeline-state {
      display: flex;
      align-items: center;
      gap: 6px;
    }

    .timeline-details {
      margin-top: 12px;
      display: none;
    }

    .timeline-item.expanded .timeline-details {
      display: block;
    }

    /* Auth Section */
    .auth-card {
      padding: 20px;
      margin: 16px;
      background: var(--bg-secondary);
      border: 1px solid var(--border);
      border-radius: 8px;
    }

    .auth-user {
      display: flex;
      align-items: center;
      gap: 14px;
      margin-bottom: 16px;
    }

    .avatar {
      width: 48px;
      height: 48px;
      border-radius: 50%;
      background: var(--accent);
      color: white;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 18px;
      font-weight: 600;
      flex-shrink: 0;
    }

    .avatar img {
      width: 100%;
      height: 100%;
      border-radius: 50%;
      object-fit: cover;
    }

    .user-details {
      flex: 1;
      min-width: 0;
    }

    .user-name {
      font-weight: 600;
      font-size: 14px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .user-email {
      color: var(--text-secondary);
      font-size: 12px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .token-info {
      display: flex;
      gap: 16px;
      margin-bottom: 16px;
      padding: 12px;
      background: var(--bg);
      border-radius: 6px;
    }

    .token-stat {
      text-align: center;
    }

    .token-stat-value {
      font-size: 18px;
      font-weight: 600;
      font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, monospace;
    }

    .token-stat-label {
      font-size: 11px;
      color: var(--text-secondary);
      text-transform: uppercase;
    }

    .claims-section {
      margin-top: 16px;
    }

    /* Event Log */
    .event-log {
      overflow-y: auto;
      flex: 1;
      font-size: 11px;
      font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, monospace;
    }

    .event-item {
      padding: 8px 14px;
      border-bottom: 1px solid var(--border);
      display: flex;
      gap: 12px;
      transition: background 0.15s;
    }

    .event-item:hover {
      background: var(--bg-hover);
    }

    .event-time {
      color: var(--text-secondary);
      flex-shrink: 0;
      min-width: 70px;
    }

    .event-type {
      color: var(--accent);
      flex-shrink: 0;
      min-width: 130px;
      font-weight: 500;
    }

    .event-details {
      color: var(--text-secondary);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    /* Buttons */
    .btn {
      padding: 8px 14px;
      background: var(--accent);
      color: white;
      border: none;
      border-radius: 6px;
      cursor: pointer;
      font-size: 12px;
      font-weight: 500;
      font-family: inherit;
      display: inline-flex;
      align-items: center;
      gap: 6px;
      text-decoration: none;
      transition: background 0.15s;
    }

    .btn:hover { background: var(--accent-hover); }

    .btn-secondary {
      background: var(--bg-secondary);
      border: 1px solid var(--border);
      color: var(--text);
    }

    .btn-secondary:hover { background: var(--bg-hover); }

    .btn-small {
      padding: 4px 8px;
      font-size: 11px;
    }

    /* Empty States */
    .empty-state {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 40px 20px;
      color: var(--text-secondary);
      text-align: center;
    }

    .empty-state-icon {
      font-size: 32px;
      margin-bottom: 12px;
      opacity: 0.5;
    }

    /* Loading */
    .loading {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 10px;
      padding: 32px;
      color: var(--text-secondary);
    }

    .spinner {
      width: 18px;
      height: 18px;
      border: 2px solid var(--border);
      border-top-color: var(--accent);
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
    }

    @keyframes spin { to { transform: rotate(360deg); } }

    /* Actions Bar */
    .actions-bar {
      padding: 12px 16px;
      border-top: 1px solid var(--border);
      display: flex;
      gap: 8px;
      flex-shrink: 0;
    }

    /* Responsive */
    @media (max-width: 600px) {
      .master-detail {
        flex-direction: column;
      }

      .master-list {
        width: 100%;
        max-height: 200px;
        border-right: none;
        border-bottom: 1px solid var(--border);
      }

      .status-bar {
        display: none;
      }
    }
  </style>
</head>
<body>
  <div class="app-shell">
    <!-- Header -->
    <header class="header">
      <div class="header-left">
        <div class="logo">
          <svg class="logo-icon" width="18" height="18" viewBox="0 0 32 32" fill="currentColor">
            <path d="M16 2L4 9v14l12 7 12-7V9L16 2zm0 2.5l9.5 5.5v11L16 26.5 6.5 21V10L16 4.5z"/>
          </svg>
          Convex DevTools
        </div>
      </div>
      <div class="status-bar">
        <div class="status-item">
          <span id="conn-dot" class="status-dot disconnected"></span>
          <span id="conn-text">Disconnected</span>
        </div>
        <div class="status-item">
          <span id="auth-dot" class="status-dot disconnected"></span>
          <span id="auth-text">Not authenticated</span>
        </div>
      </div>
    </header>

    <!-- Loading -->
    <div id="loading" class="loading">
      <div class="spinner"></div>
      <span>Connecting to application...</span>
    </div>

    <!-- Main Content -->
    <div id="main-content" style="display: none; flex: 1; display: flex; flex-direction: column; overflow: hidden;">
      <!-- Tabs -->
      <nav class="tabs">
        <button class="tab active" data-tab="queries">
          Queries <span id="query-badge" class="tab-badge">0</span>
        </button>
        <button class="tab" data-tab="mutations">
          Mutations <span id="mutation-badge" class="tab-badge">0</span>
        </button>
        <button class="tab" data-tab="auth">Auth</button>
        <button class="tab" data-tab="events">
          Events <span id="event-badge" class="tab-badge">0</span>
        </button>
      </nav>

      <!-- Queries Tab -->
      <div id="tab-queries" class="tab-content active">
        <div class="master-detail">
          <div id="query-list" class="master-list">
            <div class="empty-state">
              <div class="empty-state-icon">Q</div>
              <div>No active queries</div>
            </div>
          </div>
          <div id="query-detail" class="detail-panel">
            <div class="empty-state">
              <div>Select a query to view details</div>
            </div>
          </div>
        </div>
      </div>

      <!-- Mutations Tab -->
      <div id="tab-mutations" class="tab-content">
        <div id="mutation-list" class="timeline">
          <div class="empty-state">
            <div class="empty-state-icon">M</div>
            <div>No mutations yet</div>
            <div style="font-size: 11px; margin-top: 4px;">Mutations will appear here when triggered</div>
          </div>
        </div>
      </div>

      <!-- Auth Tab -->
      <div id="tab-auth" class="tab-content" style="overflow-y: auto;">
        <div id="auth-content">
          <div class="empty-state">
            <div class="empty-state-icon">A</div>
            <div>Loading authentication state...</div>
          </div>
        </div>
      </div>

      <!-- Events Tab -->
      <div id="tab-events" class="tab-content">
        <div id="event-log" class="event-log">
          <div class="empty-state">
            <div class="empty-state-icon">E</div>
            <div>No events yet</div>
          </div>
        </div>
        <div class="actions-bar">
          <button id="clear-events" class="btn btn-secondary btn-small">Clear Events</button>
          <a id="dashboard-link" class="btn btn-small" target="_blank" rel="noopener" style="margin-left: auto;">
            Open Dashboard
          </a>
        </div>
      </div>
    </div>
  </div>

  <script>
    (function() {
      const MAX_EVENTS = 100;
      let events = [];
      let queries = [];
      let mutations = [];
      let selectedQueryId = null;
      let connected = false;
      let messageId = 0;
      const pendingRequests = new Map();

      // BroadcastChannel for communication
      const channel = new BroadcastChannel('convex-devtools');

      // Handle messages from main app
      channel.onmessage = (event) => {
        const data = event.data;
        if (!data || typeof data !== 'object') return;

        if (data.type === 'CONVEX_DEVTOOLS_RESPONSE') {
          const pending = pendingRequests.get(data.id);
          if (pending) {
            pendingRequests.delete(data.id);
            if (data.error) pending.reject(new Error(data.error));
            else pending.resolve(data.result);
          }
        } else if (data.type === 'CONVEX_DEVTOOLS_EVENT') {
          events.push(data.event);
          if (events.length > MAX_EVENTS) events.shift();
          renderEvents();
        } else if (data.type === 'CONVEX_DEVTOOLS_QUERIES') {
          queries = data.queries || [];
          renderQueryList();
          if (selectedQueryId) renderQueryDetail(selectedQueryId);
        } else if (data.type === 'CONVEX_DEVTOOLS_MUTATIONS') {
          mutations = data.mutations || [];
          renderMutations();
        } else if (data.type === 'CONVEX_DEVTOOLS_READY') {
          if (!connected) {
            connected = true;
            initializeDevTools();
          }
        }
      };

      // Bridge call helper
      function callBridge(method, ...args) {
        return new Promise((resolve, reject) => {
          const id = ++messageId;
          pendingRequests.set(id, { resolve, reject });
          channel.postMessage({ type: 'CONVEX_DEVTOOLS_REQUEST', id, method, args });
          setTimeout(() => {
            if (pendingRequests.has(id)) {
              pendingRequests.delete(id);
              reject(new Error('Request timeout'));
            }
          }, 5000);
        });
      }

      // Connect to bridge
      function connectToBridge() {
        channel.postMessage({ type: 'CONVEX_DEVTOOLS_INIT' });
        setTimeout(() => {
          if (!connected) initializeDevTools();
        }, 2000);
      }

      // Initialize
      async function initializeDevTools() {
        document.getElementById('loading').style.display = 'none';
        document.getElementById('main-content').style.display = 'flex';

        // Setup tabs
        document.querySelectorAll('.tab').forEach(tab => {
          tab.addEventListener('click', () => switchTab(tab.dataset.tab));
        });

        // Setup dashboard link
        try {
          const url = await callBridge('getDashboardUrl');
          const link = document.getElementById('dashboard-link');
          if (url) link.href = url;
          else link.style.display = 'none';
        } catch { document.getElementById('dashboard-link').style.display = 'none'; }

        // Initial data
        try {
          events = ((await callBridge('getEvents')) || []).slice(-MAX_EVENTS);
          renderEvents();
        } catch {}

        try {
          queries = (await callBridge('getQueries')) || [];
          renderQueryList();
        } catch {}

        try {
          mutations = (await callBridge('getMutations')) || [];
          renderMutations();
        } catch {}

        // Start polling
        updateConnectionState();
        updateAuthState();
        setInterval(() => {
          updateConnectionState();
          updateAuthState();
        }, 1000);

        // Clear events
        document.getElementById('clear-events').addEventListener('click', () => {
          events = [];
          renderEvents();
        });
      }

      function switchTab(tabId) {
        document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
        document.querySelector(\`[data-tab="\${tabId}"]\`).classList.add('active');
        document.getElementById(\`tab-\${tabId}\`).classList.add('active');
      }

      async function updateConnectionState() {
        try {
          const state = await callBridge('getConnectionState');
          if (!state) return;
          const dot = document.getElementById('conn-dot');
          const text = document.getElementById('conn-text');
          if (state.isConnected) {
            dot.className = 'status-dot connected';
            text.textContent = 'Connected';
          } else {
            dot.className = 'status-dot disconnected';
            text.textContent = 'Disconnected';
          }
        } catch {}
      }

      async function updateAuthState() {
        try {
          const state = await callBridge('getEnhancedAuthState');
          if (!state) return;
          const dot = document.getElementById('auth-dot');
          const text = document.getElementById('auth-text');

          if (state.isPending) {
            dot.className = 'status-dot pending';
            text.textContent = 'Loading...';
          } else if (state.isAuthenticated) {
            dot.className = 'status-dot connected';
            text.textContent = state.user?.name || 'Authenticated';
          } else {
            dot.className = 'status-dot disconnected';
            text.textContent = 'Not authenticated';
          }

          renderAuthPanel(state);
        } catch {}
      }

      function renderQueryList() {
        const container = document.getElementById('query-list');
        document.getElementById('query-badge').textContent = queries.length;

        if (queries.length === 0) {
          container.innerHTML = '<div class="empty-state"><div class="empty-state-icon">Q</div><div>No active queries</div></div>';
          return;
        }

        container.innerHTML = queries.map(q => {
          const statusClass = q.status === 'success' ? 'success' : q.status === 'error' ? 'error' : 'pending';
          const selected = selectedQueryId === q.id ? ' selected' : '';
          const source = q.dataSource === 'ssr' ? 'SSR' : q.dataSource === 'websocket' ? 'WS' : 'Cache';
          return \`
            <div class="list-item\${selected}" data-id="\${q.id}">
              <div class="list-item-header">
                <span class="list-item-name">\${q.name}</span>
                <span class="badge \${statusClass}">\${q.status}</span>
              </div>
              <div class="list-item-meta">
                <span>\${source}</span>
                <span>Updates: \${q.updateCount}</span>
              </div>
            </div>
          \`;
        }).join('');

        container.querySelectorAll('.list-item').forEach(item => {
          item.addEventListener('click', () => {
            selectedQueryId = item.dataset.id;
            renderQueryList();
            renderQueryDetail(selectedQueryId);
          });
        });
      }

      function renderQueryDetail(id) {
        const container = document.getElementById('query-detail');
        const query = queries.find(q => q.id === id);

        if (!query) {
          container.innerHTML = '<div class="empty-state"><div>Select a query to view details</div></div>';
          return;
        }

        const statusClass = query.status === 'success' ? 'success' : query.status === 'error' ? 'error' : 'pending';
        const opts = query.options || {};
        const checkIcon = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>';
        const crossIcon = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';

        container.innerHTML = \`
          <div class="detail-section">
            <div class="detail-title">Query Info</div>
            <div class="detail-row">
              <span class="detail-label">Name</span>
              <span class="detail-value" style="color: var(--accent);">\${query.name}</span>
            </div>
            <div class="detail-row">
              <span class="detail-label">Status</span>
              <span class="badge \${statusClass}">\${query.status}</span>
            </div>
            <div class="detail-row">
              <span class="detail-label">Data Source</span>
              <span class="detail-value">\${query.dataSource}</span>
            </div>
            <div class="detail-row">
              <span class="detail-label">Updates</span>
              <span class="detail-value">\${query.updateCount}</span>
            </div>
            <div class="detail-row">
              <span class="detail-label">Last Updated</span>
              <span class="detail-value">\${new Date(query.lastUpdated).toLocaleTimeString()}</span>
            </div>
          </div>
          <div class="detail-section">
            <div class="detail-title">Options</div>
            <div class="options-grid">
              <div class="option-item">
                <span class="option-icon \${opts.lazy ? 'enabled' : 'disabled'}">\${opts.lazy ? checkIcon : crossIcon}</span>
                <span>lazy</span>
              </div>
              <div class="option-item">
                <span class="option-icon \${opts.server ? 'enabled' : 'disabled'}">\${opts.server ? checkIcon : crossIcon}</span>
                <span>server</span>
              </div>
              <div class="option-item">
                <span class="option-icon \${opts.subscribe ? 'enabled' : 'disabled'}">\${opts.subscribe ? checkIcon : crossIcon}</span>
                <span>subscribe</span>
              </div>
              <div class="option-item">
                <span class="option-icon \${opts.public ? 'enabled' : 'disabled'}">\${opts.public ? checkIcon : crossIcon}</span>
                <span>public</span>
              </div>
            </div>
          </div>
          <div class="detail-section">
            <div class="detail-title">Cache Key</div>
            <div class="json-viewer" style="max-height: 60px;">\${query.id}</div>
          </div>
          <div class="detail-section">
            <div class="detail-title">Arguments</div>
            <div class="json-viewer">\${formatJSON(query.args)}</div>
          </div>
          <div class="detail-section">
            <div class="detail-title">Result</div>
            <div class="json-viewer">\${query.error ? '<span class="json-string">' + escapeHtml(query.error) + '</span>' : formatJSON(query.data)}</div>
          </div>
        \`;
      }

      function renderMutations() {
        const container = document.getElementById('mutation-list');
        document.getElementById('mutation-badge').textContent = mutations.length;

        if (mutations.length === 0) {
          container.innerHTML = '<div class="empty-state"><div class="empty-state-icon">M</div><div>No mutations yet</div><div style="font-size: 11px; margin-top: 4px;">Mutations will appear here when triggered</div></div>';
          return;
        }

        container.innerHTML = mutations.map(m => {
          const stateClass = m.state === 'success' ? 'success' : m.state === 'error' ? 'error' : m.state === 'optimistic' ? 'optimistic' : 'pending';
          const duration = m.duration ? \`\${m.duration}ms\` : 'pending...';
          const time = new Date(m.startedAt).toLocaleTimeString();
          const typeLabel = m.type === 'action' ? '[Action]' : '';

          return \`
            <div class="timeline-item" data-id="\${m.id}">
              <div class="timeline-header">
                <span class="timeline-name">\${typeLabel} \${m.name}</span>
                <span class="timeline-time">\${time}</span>
              </div>
              <div class="timeline-meta">
                <div class="timeline-state">
                  \${m.hasOptimisticUpdate ? '<span class="badge optimistic">OPT</span>' : ''}
                  <span class="badge \${stateClass}">\${m.state}</span>
                </div>
                <span>\${duration}</span>
              </div>
              <div class="timeline-details">
                <div style="margin-bottom: 8px;">
                  <div class="detail-title">Arguments</div>
                  <div class="json-viewer">\${formatJSON(m.args)}</div>
                </div>
                \${m.state === 'success' ? \`<div><div class="detail-title">Result</div><div class="json-viewer">\${formatJSON(m.result)}</div></div>\` : ''}
                \${m.state === 'error' ? \`<div><div class="detail-title">Error</div><div class="json-viewer"><span class="json-string">\${escapeHtml(m.error || 'Unknown error')}</span></div></div>\` : ''}
              </div>
            </div>
          \`;
        }).join('');

        container.querySelectorAll('.timeline-item').forEach(item => {
          item.addEventListener('click', () => {
            item.classList.toggle('expanded');
          });
        });
      }

      function renderAuthPanel(state) {
        const container = document.getElementById('auth-content');

        if (!state.isAuthenticated) {
          container.innerHTML = \`
            <div class="auth-card">
              <div style="text-align: center; padding: 20px;">
                <div style="font-size: 32px; margin-bottom: 12px; opacity: 0.5;">A</div>
                <div style="font-weight: 500; margin-bottom: 4px;">Not Authenticated</div>
                <div style="color: var(--text-secondary); font-size: 12px;">Log in to see authentication details</div>
              </div>
            </div>
          \`;
          return;
        }

        const user = state.user || {};
        const avatarContent = user.image
          ? \`<img src="\${escapeHtml(user.image)}" alt="">\`
          : (user.name || user.email || '?').charAt(0).toUpperCase();

        let expirationDisplay = '-';
        if (state.expiresInSeconds !== undefined) {
          const mins = Math.floor(state.expiresInSeconds / 60);
          const secs = state.expiresInSeconds % 60;
          expirationDisplay = \`\${mins}:\${secs.toString().padStart(2, '0')}\`;
        }

        container.innerHTML = \`
          <div class="auth-card">
            <div class="auth-user">
              <div class="avatar">\${avatarContent}</div>
              <div class="user-details">
                <div class="user-name">\${escapeHtml(user.name || 'Unknown')}</div>
                <div class="user-email">\${escapeHtml(user.email || '-')}</div>
              </div>
            </div>
            <div class="token-info">
              <div class="token-stat">
                <div class="token-stat-value badge success">Valid</div>
                <div class="token-stat-label">Token</div>
              </div>
              <div class="token-stat">
                <div class="token-stat-value">\${expirationDisplay}</div>
                <div class="token-stat-label">Expires</div>
              </div>
            </div>
            <div class="claims-section">
              <div class="detail-title">JWT Claims</div>
              <div class="json-viewer" style="max-height: 300px;">\${formatJSON(state.claims)}</div>
            </div>
          </div>
        \`;
      }

      function renderEvents() {
        const container = document.getElementById('event-log');
        document.getElementById('event-badge').textContent = events.length;

        if (events.length === 0) {
          container.innerHTML = '<div class="empty-state"><div class="empty-state-icon">E</div><div>No events yet</div></div>';
          return;
        }

        container.innerHTML = events.slice().reverse().map(e => {
          const time = new Date().toLocaleTimeString();
          let details = '';
          if (e.event === 'operation:complete') {
            details = \`\${e.name} \${e.outcome} \${e.duration_ms}ms\`;
          } else if (e.event === 'auth:change') {
            details = \`\${e.from} -> \${e.to}\`;
          } else if (e.event === 'subscription:change') {
            details = \`\${e.name} \${e.state}\`;
          } else if (e.event === 'connection:change') {
            details = \`\${e.from} -> \${e.to}\`;
          } else if (e.event === 'plugin:init') {
            details = \`\${e.outcome} \${e.duration_ms}ms\`;
          }
          return \`
            <div class="event-item">
              <span class="event-time">\${time}</span>
              <span class="event-type">\${e.event}</span>
              <span class="event-details">\${escapeHtml(details)}</span>
            </div>
          \`;
        }).join('');
      }

      function formatJSON(obj) {
        if (obj === undefined) return '<span class="json-null">undefined</span>';
        if (obj === null) return '<span class="json-null">null</span>';
        try {
          const json = JSON.stringify(obj, (k, v) => typeof v === 'bigint' ? v.toString() + 'n' : v, 2);
          return json.replace(/("(\\\\u[a-zA-Z0-9]{4}|\\\\[^u]|[^\\\\"])*"(\\s*:)?|\\b(true|false|null)\\b|-?\\d+(?:\\.\\d*)?(?:[eE][+\\-]?\\d+)?)/g, (match) => {
            let cls = 'json-number';
            if (/^"/.test(match)) {
              if (/:$/.test(match)) cls = 'json-key';
              else cls = 'json-string';
            } else if (/true|false/.test(match)) cls = 'json-boolean';
            else if (/null/.test(match)) cls = 'json-null';
            return '<span class="' + cls + '">' + escapeHtml(match) + '</span>';
          });
        } catch {
          return '<span class="json-null">[Circular]</span>';
        }
      }

      function escapeHtml(str) {
        if (typeof str !== 'string') return str;
        return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
      }

      // Start
      connectToBridge();
    })();
  </script>
</body>
</html>
`;

export default defineEventHandler((event) => {
  setHeader(event, 'Content-Type', 'text/html')
  return DEVTOOLS_HTML
})
