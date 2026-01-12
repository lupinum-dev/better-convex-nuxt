/**
 * Server handler for DevTools UI.
 * Serves a simple HTML page that communicates with the main app via postMessage.
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
      --scrollbar-bg: #1e1e1e;
      --scrollbar-thumb: #424242;
    }

    /* Light mode */
    @media (prefers-color-scheme: light) {
      :root {
        --bg: #ffffff;
        --bg-secondary: #f5f5f5;
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
        --scrollbar-bg: #f5f5f5;
        --scrollbar-thumb: #c4c4c4;
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
      padding: 16px;
      line-height: 1.5;
    }

    /* Custom scrollbar */
    ::-webkit-scrollbar {
      width: 8px;
      height: 8px;
    }
    ::-webkit-scrollbar-track {
      background: var(--scrollbar-bg);
    }
    ::-webkit-scrollbar-thumb {
      background: var(--scrollbar-thumb);
      border-radius: 4px;
    }
    ::-webkit-scrollbar-thumb:hover {
      background: var(--text-secondary);
    }

    h1, h2, h3 {
      font-weight: 600;
      margin-bottom: 12px;
    }

    h1 {
      font-size: 15px;
      display: flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 16px;
      color: var(--text);
    }

    h2 {
      font-size: 12px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      color: var(--text-secondary);
      margin-bottom: 10px;
    }

    .section {
      background: var(--bg-secondary);
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 14px;
      margin-bottom: 16px;
    }

    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
      gap: 16px;
    }

    .status-indicator {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      font-weight: 500;
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

    .stat {
      display: flex;
      justify-content: space-between;
      padding: 6px 0;
      border-bottom: 1px solid var(--border);
    }

    .stat:last-child {
      border-bottom: none;
    }

    .stat-label {
      color: var(--text-secondary);
      font-size: 12px;
    }

    .stat-value {
      font-weight: 500;
      font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, monospace;
      font-size: 12px;
    }

    .user-info {
      display: flex;
      align-items: center;
      gap: 12px;
      margin-top: 10px;
    }

    .avatar {
      width: 36px;
      height: 36px;
      border-radius: 50%;
      background: var(--accent);
      color: white;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 14px;
      font-weight: 600;
    }

    .query-list {
      max-height: 280px;
      overflow-y: auto;
    }

    .query-item {
      padding: 10px 12px;
      border-bottom: 1px solid var(--border);
      display: flex;
      justify-content: space-between;
      align-items: center;
      transition: background 0.15s;
    }

    .query-item:hover {
      background: var(--bg-hover);
    }

    .query-item:last-child {
      border-bottom: none;
    }

    .query-name {
      font-weight: 500;
      color: var(--accent);
      font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, monospace;
      font-size: 12px;
    }

    .query-status {
      font-size: 10px;
      padding: 3px 8px;
      border-radius: 10px;
      font-weight: 500;
      text-transform: uppercase;
      letter-spacing: 0.3px;
    }

    .query-status.success { background: var(--success-bg); color: var(--success); }
    .query-status.error { background: var(--error-bg); color: var(--error); }
    .query-status.pending { background: var(--warning-bg); color: var(--warning); }

    .event-log {
      max-height: 220px;
      overflow-y: auto;
      font-size: 11px;
      font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, monospace;
    }

    .event-item {
      padding: 6px 10px;
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
      min-width: 120px;
      font-weight: 500;
    }

    .event-details {
      color: var(--text-secondary);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

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
      transition: background 0.15s, opacity 0.15s;
    }

    .btn:hover {
      background: var(--accent-hover);
    }

    .btn-secondary {
      background: var(--bg-secondary);
      border: 1px solid var(--border);
      color: var(--text);
    }

    .btn-secondary:hover {
      background: var(--bg-hover);
    }

    .empty-state {
      text-align: center;
      padding: 20px;
      color: var(--text-secondary);
      font-size: 12px;
    }

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

    @keyframes spin {
      to { transform: rotate(360deg); }
    }

    /* Logo icon color */
    .logo-icon {
      color: var(--accent);
    }
  </style>
</head>
<body>
  <div id="app">
    <h1>
      <svg class="logo-icon" width="20" height="20" viewBox="0 0 32 32" fill="currentColor">
        <path d="M16 2L4 9v14l12 7 12-7V9L16 2zm0 2.5l9.5 5.5v11L16 26.5 6.5 21V10L16 4.5z"/>
      </svg>
      Convex DevTools
    </h1>

    <div id="loading" class="loading">
      <div class="spinner"></div>
      <span>Connecting to application...</span>
    </div>

    <div id="content" style="display: none;">
      <div class="grid">
        <!-- Connection Status -->
        <div class="section">
          <h2>Connection</h2>
          <div class="status-indicator">
            <span id="connection-dot" class="status-dot disconnected"></span>
            <span id="connection-status">Disconnected</span>
          </div>
          <div style="margin-top: 8px;">
            <div class="stat">
              <span class="stat-label">Retries</span>
              <span id="connection-retries" class="stat-value">0</span>
            </div>
            <div class="stat">
              <span class="stat-label">Inflight</span>
              <span id="connection-inflight" class="stat-value">0</span>
            </div>
          </div>
        </div>

        <!-- Auth Status -->
        <div class="section">
          <h2>Authentication</h2>
          <div id="auth-state">
            <div class="status-indicator">
              <span id="auth-dot" class="status-dot disconnected"></span>
              <span id="auth-status">Not authenticated</span>
            </div>
          </div>
          <div id="user-section" style="margin-top: 8px; display: none;">
            <div class="user-info">
              <div class="avatar" id="user-avatar">?</div>
              <div>
                <div id="user-name" style="font-weight: 500;">-</div>
                <div id="user-email" style="color: var(--text-secondary); font-size: 12px;">-</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Active Queries -->
      <div class="section">
        <h2>Active Queries (<span id="query-count">0</span>)</h2>
        <div id="query-list" class="query-list">
          <div class="empty-state">No active queries</div>
        </div>
      </div>

      <!-- Event Log -->
      <div class="section">
        <h2>Event Log</h2>
        <div id="event-log" class="event-log">
          <div class="empty-state">No events yet</div>
        </div>
      </div>

      <!-- Actions -->
      <div style="display: flex; gap: 8px;">
        <a id="dashboard-link" class="btn" target="_blank" rel="noopener">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
            <polyline points="15 3 21 3 21 9"></polyline>
            <line x1="10" y1="14" x2="21" y2="3"></line>
          </svg>
          Open Convex Dashboard
        </a>
        <button id="clear-events" class="btn btn-secondary">Clear Events</button>
      </div>
    </div>
  </div>

  <script>
    // DevTools client script using BroadcastChannel for reliable same-origin communication
    (function() {
      const MAX_EVENTS = 50;
      let events = [];
      let connected = false;
      let messageId = 0;
      const pendingRequests = new Map();

      // BroadcastChannel for communication with main app
      const channel = new BroadcastChannel('convex-devtools');

      // Handle messages from main app
      channel.onmessage = (event) => {
        const data = event.data;
        if (!data || typeof data !== 'object') return;

        if (data.type === 'CONVEX_DEVTOOLS_RESPONSE') {
          const pending = pendingRequests.get(data.id);
          if (pending) {
            pendingRequests.delete(data.id);
            if (data.error) {
              pending.reject(new Error(data.error));
            } else {
              pending.resolve(data.result);
            }
          }
        } else if (data.type === 'CONVEX_DEVTOOLS_EVENT') {
          // Real-time event from main app
          events.push(data.event);
          if (events.length > MAX_EVENTS) events.shift();
          renderEvents();
        } else if (data.type === 'CONVEX_DEVTOOLS_QUERIES') {
          // Query list update from main app
          renderQueries(data.queries);
        } else if (data.type === 'CONVEX_DEVTOOLS_READY') {
          // Main app responded to our init
          if (!connected) {
            connected = true;
            console.log('[Convex DevTools] Connected via BroadcastChannel');
            initializeDevTools();
          }
        }
      };

      // Bridge for calling methods on main app
      function callBridge(method, ...args) {
        return new Promise((resolve, reject) => {
          const id = ++messageId;
          pendingRequests.set(id, { resolve, reject });

          channel.postMessage({
            type: 'CONVEX_DEVTOOLS_REQUEST',
            id,
            method,
            args
          });

          // Timeout after 5 seconds
          setTimeout(() => {
            if (pendingRequests.has(id)) {
              pendingRequests.delete(id);
              reject(new Error('Request timeout'));
            }
          }, 5000);
        });
      }

      // Start connection
      function connectToBridge() {
        // Send init message via BroadcastChannel
        channel.postMessage({ type: 'CONVEX_DEVTOOLS_INIT' });

        // Wait for ready signal or timeout
        setTimeout(() => {
          if (!connected) {
            console.log('[Convex DevTools] Initializing without confirmation (main app may not be ready yet)');
            initializeDevTools();
          }
        }, 2000);
      }

      async function initializeDevTools() {
        document.getElementById('loading').style.display = 'none';
        document.getElementById('content').style.display = 'block';

        // Setup dashboard link
        try {
          const dashboardUrl = await callBridge('getDashboardUrl');
          const dashboardLink = document.getElementById('dashboard-link');
          if (dashboardUrl) {
            dashboardLink.href = dashboardUrl;
          } else {
            dashboardLink.style.display = 'none';
          }
        } catch (e) {
          document.getElementById('dashboard-link').style.display = 'none';
        }

        // Get initial events
        try {
          const initialEvents = await callBridge('getEvents');
          events = (initialEvents || []).slice(-MAX_EVENTS);
          renderEvents();
        } catch (e) {
          console.debug('Could not get initial events:', e);
        }

        // Get initial queries
        try {
          const initialQueries = await callBridge('getQueries');
          renderQueries(initialQueries || []);
        } catch (e) {
          console.debug('Could not get initial queries:', e);
        }

        // Initial render
        updateConnectionState();
        updateAuthState();

        // Poll for connection/auth/queries state updates
        setInterval(() => {
          updateConnectionState();
          updateAuthState();
          refreshQueries();
        }, 1000);

        // Clear events button
        document.getElementById('clear-events').addEventListener('click', () => {
          events = [];
          renderEvents();
        });
      }

      async function refreshQueries() {
        try {
          const queries = await callBridge('getQueries');
          renderQueries(queries || []);
        } catch (e) {
          // Ignore polling errors
        }
      }

      async function updateConnectionState() {
        try {
          const state = await callBridge('getConnectionState');
          if (!state) return;

          const dot = document.getElementById('connection-dot');
          const status = document.getElementById('connection-status');

          if (state.isConnected) {
            dot.className = 'status-dot connected';
            status.textContent = 'Connected';
          } else {
            dot.className = 'status-dot disconnected';
            status.textContent = state.hasEverConnected ? 'Reconnecting...' : 'Disconnected';
          }

          document.getElementById('connection-retries').textContent = state.connectionRetries || 0;
          document.getElementById('connection-inflight').textContent = state.inflightRequests || 0;
        } catch (e) {
          // Ignore polling errors
        }
      }

      async function updateAuthState() {
        try {
          const state = await callBridge('getAuthState');
          if (!state) return;

          const dot = document.getElementById('auth-dot');
          const status = document.getElementById('auth-status');
          const userSection = document.getElementById('user-section');

          if (state.isPending) {
            dot.className = 'status-dot pending';
            status.textContent = 'Loading...';
            userSection.style.display = 'none';
          } else if (state.isAuthenticated) {
            dot.className = 'status-dot connected';
            status.textContent = 'Authenticated';
            userSection.style.display = 'block';

            if (state.user) {
              document.getElementById('user-name').textContent = state.user.name || 'Unknown';
              document.getElementById('user-email').textContent = state.user.email || '-';
              document.getElementById('user-avatar').textContent =
                (state.user.name || state.user.email || '?').charAt(0).toUpperCase();
            }
          } else {
            dot.className = 'status-dot disconnected';
            status.textContent = 'Not authenticated';
            userSection.style.display = 'none';
          }
        } catch (e) {
          // Ignore polling errors
        }
      }

      function renderQueries(queries) {
        const container = document.getElementById('query-list');
        const countEl = document.getElementById('query-count');

        countEl.textContent = queries.length;

        if (queries.length === 0) {
          container.innerHTML = '<div class="empty-state">No active queries</div>';
          return;
        }

        container.innerHTML = queries.map(q => {
          const statusClass = q.status === 'success' ? 'success' :
                              q.status === 'error' ? 'error' :
                              q.status === 'pending' ? 'pending' : '';
          const source = q.dataSource === 'ssr' ? ' (SSR)' :
                        q.dataSource === 'websocket' ? ' (WS)' : '';
          return \`
            <div class="query-item">
              <div>
                <div class="query-name">\${q.name}\${source}</div>
                <div style="color: var(--text-secondary); font-size: 11px;">
                  Updates: \${q.updateCount}
                </div>
              </div>
              <span class="query-status \${statusClass}">\${q.status}</span>
            </div>
          \`;
        }).join('');
      }

      function renderEvents() {
        const container = document.getElementById('event-log');

        if (events.length === 0) {
          container.innerHTML = '<div class="empty-state">No events yet</div>';
          return;
        }

        container.innerHTML = events.slice().reverse().map(e => {
          const time = new Date().toLocaleTimeString();
          let details = '';

          if (e.event === 'operation:complete') {
            details = \`\${e.name} \${e.outcome} \${e.duration_ms}ms\`;
          } else if (e.event === 'auth:change') {
            details = \`\${e.from} → \${e.to}\`;
          } else if (e.event === 'subscription:change') {
            details = \`\${e.name} \${e.state}\`;
          } else if (e.event === 'connection:change') {
            details = \`\${e.from} → \${e.to}\`;
          }

          return \`
            <div class="event-item">
              <span class="event-time">\${time}</span>
              <span class="event-type">\${e.event}</span>
              <span class="event-details">\${details}</span>
            </div>
          \`;
        }).join('');

        // Scroll to top (newest events)
        container.scrollTop = 0;
      }

      // Start connection
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
