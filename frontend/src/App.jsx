import { useCallback, useEffect, useMemo, useState } from 'react'
import LiveOperations from './components/LiveOperations'
import SyndicateExplorer from './components/SyndicateExplorer'

const WS_URL = 'ws://localhost:5001'
const MAX_TRANSACTIONS = 100

const NAV_ITEMS = [
  { id: 'live', label: 'Live Operations' },
  { id: 'syndicate', label: 'Syndicate Intel' },
]

// FIX: Safely parse the C++ alert string regardless of what the merchant is named
function parseAlertMerchant(alertData) {
  try {
    // Expected format: "[ALERT] Fraud Ring Detected: merch_zara"
    const parts = alertData.split(': ');
    return parts.length > 1 ? parts[1].trim() : null;
  } catch {
    return null;
  }
}

function ConnectionStatus({ connected }) {
  return (
    <div className="flex items-center gap-3 bg-zinc-900/50 px-3 py-1.5 rounded-full border border-zinc-800/50">
      <span
        className="inline-block h-2 w-2 rounded-full transition-all duration-300 ease-in-out"
        style={{ backgroundColor: connected ? '#10b981' : '#ef4444', boxShadow: connected ? '0 0 8px #10b981' : '0 0 8px #ef4444' }}
      />
      <span className="text-[10px] font-medium tracking-widest text-zinc-400 uppercase">
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
  
  // NEW: State to freeze a clicked transaction for the Inspector Panel
  const [inspectedTxn, setInspectedTxn] = useState(null)

  const blacklistedMerchants = useMemo(() => {
    const fromAlerts = alerts
      .map((alert) => parseAlertMerchant(alert))
      .filter(Boolean)
    return [...new Set(fromAlerts)]
  }, [alerts])

  const handleMessage = useCallback((event) => {
    try {
      const payload = JSON.parse(event.data)

      if (payload.type === 'TXN' && payload.data) {
        setTransactions((prev) => {
          // DEDUPLICATION FIX: If the new transaction has the exact same ID & Timestamp as the very top one, drop it!
          if (prev.length > 0 && prev[0].data.userId === payload.data.userId && prev[0].data.timestamp === payload.data.timestamp) {
            return prev;
          }
          return [{ type: 'TXN', data: payload.data }, ...prev].slice(0, MAX_TRANSACTIONS);
        });
      }

      if (payload.type === 'ALERT' && payload.data) {
        setAlerts((prev) => {
          // Prevent duplicate alerts from stacking up
          if (prev.length > 0 && prev[0] === payload.data) return prev;
          return [payload.data, ...prev].slice(0, 50);
        });
      }
    } catch {
      // ignore malformed payloads
    }
  }, [])

  useEffect(() => {
    let ws;
    let reconnectTimer;

    function connect() {
      ws = new WebSocket(WS_URL)
      ws.onopen = () => setConnected(true)
      ws.onclose = () => {
        setConnected(false)
        reconnectTimer = setTimeout(connect, 3000)
      }
      ws.onerror = () => ws.close()
      ws.onmessage = handleMessage
    }

    connect()

    return () => {
      clearTimeout(reconnectTimer)
      if (ws) ws.close()
    }
  }, [handleMessage])

  return (
    <div className="min-h-screen bg-black text-white selection:bg-zinc-800">
      {/* APPLE MINIMALIST NAVBAR */}
      <nav className="sticky top-0 z-50 border-b border-zinc-900 bg-black/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-[1400px] items-center justify-between px-6 py-4">
          <div>
            <h1 className="text-base font-medium tracking-tight text-zinc-100">
              LiteDB Engine
            </h1>
          </div>

          <div className="hidden items-center gap-1 md:flex bg-zinc-950 p-1 rounded-lg border border-zinc-900">
            {NAV_ITEMS.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveTab(item.id)}
                className={`rounded-md px-6 py-1.5 text-[13px] font-medium transition-all duration-300 ease-in-out ${
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

      {/* TOP NOTIFICATION BAR FOR ALERTS */}
      {alerts.length > 0 && (
        <div className="border-b border-red-900/30 bg-red-950/10">
          <div className="mx-auto max-w-[1400px] px-6 py-3 flex items-center justify-between">
            <p className="font-mono text-[11px] tracking-wide text-red-500">
              LATEST SYS_EVENT: {alerts[0]}
            </p>
          </div>
        </div>
      )}

      {/* MAIN CONTENT AREA */}
      <main className="mx-auto max-w-[1400px] px-6 py-8 transition-all duration-300 ease-in-out">
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