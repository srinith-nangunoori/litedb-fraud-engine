import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import LiveOperations from './components/LiveOperations'
import SyndicateExplorer from './components/SyndicateExplorer'

const WS_URL = 'ws://localhost:5001'
const MAX_TRANSACTIONS = 200

const NAV_ITEMS = [
  { id: 'live', label: 'Live Operations' },
  { id: 'syndicate', label: 'Syndicate Intel' },
]

// ─────────────────────────────────────────────────────────────────────────────
// MODULE-LEVEL sequence counter.
//
// WHY NOT useRef: React StrictMode (active in dev) intentionally double-invokes
// effects — mount → unmount → remount — to surface bugs. A useRef(0) lives
// inside the component and gets reset on every remount, so the double-invoke
// causes two WebSocket connections both incrementing the same ref concurrently,
// producing duplicate sequenceIds (1,1,2,2,3,3...) → same color slots → pink
// repeating 3 times.
//
// Module-level variables are initialised exactly once when the JS module is
// first imported and are never touched by React's lifecycle. StrictMode cannot
// reset or duplicate them. This is the only correct place for a counter that
// must be strictly monotonic across the entire session.
// ─────────────────────────────────────────────────────────────────────────────
let _sequenceCounter = 0

function parseAlertMerchant(alertData) {
  try {
    const parts = alertData.split(': ')
    return parts.length > 1 ? parts[parts.length - 1].trim() : null
  } catch {
    return null
  }
}

function ConnectionStatus({ connected }) {
  return (
    <div className="flex items-center gap-2.5 bg-zinc-900/50 px-3 py-1.5 rounded-full border border-white/[0.08]">
      <span
        className="inline-block h-1.5 w-1.5 rounded-full transition-all duration-300"
        style={{
          backgroundColor: connected ? '#10b981' : '#ef4444',
          boxShadow: connected ? '0 0 8px #10b981' : '0 0 8px #ef4444',
        }}
      />
      <span className="text-[10px] font-medium tracking-[0.12em] text-zinc-400 uppercase">
        {connected ? 'System Online' : 'Disconnected'}
      </span>
    </div>
  )
}

export default function App() {
  const [activeTab, setActiveTab] = useState('live')
  const [connected, setConnected] = useState(false)
  const [transactions, setTransactions] = useState([])
  const [alerts, setAlerts] = useState([])
  const [inspectedTxn, setInspectedTxn] = useState(null)

  // Fetch historical syndicates on initial page load
  useEffect(() => {
    fetch('http://localhost:5001/api/syndicates/all')
      .then(res => res.json())
      .then(data => {
        // FIX: Ignore the C++ (nil) response!
        const validData = data.filter(m => m !== '(nil)' && m.trim() !== '');
        const historicalAlerts = validData.map(m => `[ALERT] Fraud Ring Detected: ${m}`);
        setAlerts(prev => [...new Set([...prev, ...historicalAlerts])]);
      })
      .catch(err => console.error("Failed to fetch historical syndicates:", err));
  }, []);
  
  const blacklistedMerchants = useMemo(() => {
    const fromAlerts = alerts.map((a) => parseAlertMerchant(a)).filter(Boolean)
    return [...new Set(fromAlerts)]
  }, [alerts])

  const handleMessage = useCallback((event) => {
    try {
      const payload = JSON.parse(event.data)

      if (payload.type === 'TXN' && payload.data) {
        setTransactions((prev) => {
          // Increment the transaction ticket
          _sequenceCounter += 1

          // Module-level counter: immune to StrictMode double-invoke
          _sequenceCounter += 1

          const newTxn = {
            type: 'TXN',
            sequenceId: _sequenceCounter,
            data: payload.data,
          }

          return [newTxn, ...prev].slice(0, MAX_TRANSACTIONS)
        })
      }

      if (payload.type === 'ALERT' && payload.data) {
        setAlerts((prev) => {
          if (prev.length > 0 && prev[0] === payload.data) return prev
          return [payload.data, ...prev].slice(0, 50)
        })
      }
    } catch {
      // ignore malformed payloads
    }
  }, [])

  useEffect(() => {
    // ── StrictMode-safe WebSocket pattern ──────────────────────────────────
    // StrictMode: effect runs, cleanup runs, effect runs again.
    // The `active` ref tracks whether THIS effect instance is still live.
    // When cleanup fires, active.current = false stops any pending callbacks
    // from the first (discarded) instance from touching state or reconnecting.
    //
    // We use a ref (not a closure variable `let dead`) because the ref object
    // persists across the cleanup/re-run cycle in StrictMode, giving us a
    // single shared flag that both the setup and its cleanup read from.
    const active = { value: true }
    let ws = null
    let reconnectTimer = null

    function connect() {
      if (!active.value) return

      ws = new WebSocket(WS_URL)

      ws.onopen = () => {
        if (active.value) setConnected(true)
      }

      ws.onclose = () => {
        if (!active.value) return
        setConnected(false)
        reconnectTimer = setTimeout(connect, 3000)
      }

      ws.onerror = () => {
        if (ws.readyState !== WebSocket.CLOSED && ws.readyState !== WebSocket.CLOSING) {
          ws.close()
        }
      }

      ws.onmessage = handleMessage
    }

    connect()

    return () => {
      active.value = false
      clearTimeout(reconnectTimer)
      if (ws !== null) {
        // Null out handlers first so onclose doesn't trigger a reconnect
        ws.onclose = null
        ws.onmessage = null
        ws.onerror = null
        if (ws.readyState === WebSocket.CONNECTING || ws.readyState === WebSocket.OPEN) {
          ws.close()
        }
      }
    }
  }, [handleMessage])

  return (
    <div className="min-h-screen bg-black text-white selection:bg-zinc-800">
      {/* ── Navbar ── */}
      <nav className="sticky top-0 z-50 border-b border-white/[0.08] bg-black/90 backdrop-blur-xl">
        <div className="mx-auto flex max-w-[1400px] items-center justify-between px-6 py-4">
          <div>
            <h1 className="text-sm font-medium tracking-tight text-zinc-100">
              LiteDB Engine
            </h1>
            <p className="text-[10px] text-zinc-600 tracking-wide">
              Real-time fraud detection
            </p>
          </div>

          <div className="hidden items-center gap-1 md:flex bg-zinc-950 p-1 rounded-lg border border-white/[0.08]">
            {NAV_ITEMS.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveTab(item.id)}
                className={`rounded-md px-5 py-1.5 text-[12px] font-medium transition-all duration-200 ${
                  activeTab === item.id
                    ? 'bg-zinc-800 text-white shadow-sm'
                    : 'text-zinc-500 hover:text-zinc-300'
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>

          <ConnectionStatus connected={connected} />
        </div>
      </nav>

      {/* ── Alert bar ── */}
      {alerts.length > 0 && (
        <div className="border-b border-red-900/30 bg-red-950/10">
          <div className="mx-auto max-w-[1400px] px-6 py-2.5 flex items-center gap-3">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-red-500 animate-pulse" />
            <p className="font-mono text-[11px] tracking-wide text-red-500">
              SYS_EVENT: {alerts[0]}
            </p>
          </div>
        </div>
      )}

      {/* ── Main content ── */}
      <main className="mx-auto max-w-[1400px] px-6 py-8">
        {activeTab === 'live' && (
          <LiveOperations
            transactions={transactions}
            inspectedTxn={inspectedTxn}
            setInspectedTxn={setInspectedTxn}
          />
        )}
        {activeTab === 'syndicate' && (
          <SyndicateExplorer blacklistedMerchants={blacklistedMerchants} />
        )}
      </main>
    </div>
  )
}