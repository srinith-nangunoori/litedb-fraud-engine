import { useCallback, useEffect, useMemo, useState } from 'react'
import LiveOperations from './components/LiveOperations'
import SyndicateExplorer from './components/SyndicateExplorer'
import Architecture from './components/Architecture'

const WS_URL = 'ws://localhost:5001'
const MAX_TRANSACTIONS = 200

const NAV_ITEMS = [
  { id: 'live', label: 'Live Operations' },
  { id: 'syndicate', label: 'Syndicate Intel' },
  { id: 'architecture', label: 'Architecture' },
]

// Module-level variables are initialised exactly once when the JS module is
// first imported and are never touched by React's lifecycle.
let _sequenceCounter = 0

function parseAlertMerchant(alertData) {
  try {
    const parts = alertData.split(': ')
    return parts.length > 1 ? parts[parts.length - 1].trim() : null
  } catch {
    return null
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// ConnectionStatus — Bespoke radar-sweep instrument
// ─────────────────────────────────────────────────────────────────────────────
function ConnectionStatus({ connected }) {
  const tint = connected ? '#10b981' : '#ef4444'

  return (
    <div className="flex items-center gap-2.5 bg-zinc-900/40 pl-2 pr-3.5 py-1.5 rounded-full border border-white/[0.08] backdrop-blur-sm">
      <span className="relative flex h-5 w-5 items-center justify-center">
        <svg viewBox="0 0 24 24" className="h-5 w-5" style={{ overflow: 'visible' }}>
          <circle cx="12" cy="12" r="9.5" fill="none" stroke={tint} strokeOpacity="0.25" strokeWidth="1" />
          {[0, 90, 180, 270].map((deg) => (
            <line key={deg} x1="12" y1="2.2" x2="12" y2="3.6" stroke={tint} strokeOpacity="0.4" strokeWidth="1" transform={`rotate(${deg} 12 12)`} />
          ))}
          {connected ? (
            <>
              <g className="animate-spin" style={{ transformOrigin: '12px 12px', animationDuration: '2.4s' }}>
                <path d="M 12 12 L 12 2.5 A 9.5 9.5 0 0 1 18.7 5.3 Z" fill={tint} fillOpacity="0.22" />
                <line x1="12" y1="12" x2="12" y2="2.5" stroke={tint} strokeWidth="1" strokeOpacity="0.8" />
              </g>
              <circle cx="14.5" cy="9.5" r="1.15" fill={tint}>
                <animate attributeName="opacity" values="1;0.35;1" dur="1.8s" repeatCount="indefinite" />
              </circle>
            </>
          ) : (
            <>
              <line x1="8" y1="8" x2="16" y2="16" stroke={tint} strokeWidth="1.2" strokeOpacity="0.7" />
              <line x1="16" y1="8" x2="8" y2="16" stroke={tint} strokeWidth="1.2" strokeOpacity="0.7" />
            </>
          )}
          <circle cx="12" cy="12" r="1.4" fill={tint} style={{ filter: `drop-shadow(0 0 3px ${tint})` }} />
        </svg>
      </span>
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
        const validData = data.filter(m => m !== '(nil)' && m.trim() !== '');
        const historicalAlerts = validData.map(m => `[ALERT] Fraud Ring Detected: ${m}`);
        setAlerts(prev => [...new Set([...prev, ...historicalAlerts])]);
      })
      .catch(err => console.error("Failed to fetch historical syndicates:", err));
  }, []);
  
  // --- NEW: AUTO-DISMISS ALERT BAR ---
  useEffect(() => {
    if (alerts.length > 0) {
      const timer = setTimeout(() => {
        setAlerts([]); // Clear the array to hide the banner gracefully after 8 seconds
      }, 8000);
      return () => clearTimeout(timer); 
    }
  }, [alerts]);
  // -----------------------------------

  const blacklistedMerchants = useMemo(() => {
    const fromAlerts = alerts.map((a) => parseAlertMerchant(a)).filter(Boolean)
    return [...new Set(fromAlerts)]
  }, [alerts])

  const handleMessage = useCallback((event) => {
    try {
      const payload = JSON.parse(event.data)

      if (payload.type === 'TXN' && payload.data) {
        setTransactions((prev) => {
          if (prev.length > 0 && prev[0].data.userId === payload.data.userId && prev[0].data.timestamp === payload.data.timestamp) {
            return prev
          }

          _sequenceCounter += 1 // Fixed: Only increment ONCE!

          const newTxn = { type: 'TXN', sequenceId: _sequenceCounter, data: payload.data }
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
      // ignore
    }
  }, [])

  useEffect(() => {
    const active = { value: true }
    let ws = null
    let reconnectTimer = null

    function connect() {
      if (!active.value) return
      ws = new WebSocket(WS_URL)
      ws.onopen = () => { if (active.value) setConnected(true) }
      ws.onclose = () => {
        if (!active.value) return
        setConnected(false)
        reconnectTimer = setTimeout(connect, 3000)
      }
      ws.onerror = () => {
        if (ws.readyState !== WebSocket.CLOSED && ws.readyState !== WebSocket.CLOSING) ws.close()
      }
      ws.onmessage = handleMessage
    }

    connect()

    return () => {
      active.value = false
      clearTimeout(reconnectTimer)
      if (ws !== null) {
        ws.onclose = null
        ws.onmessage = null
        ws.onerror = null
        if (ws.readyState === WebSocket.CONNECTING || ws.readyState === WebSocket.OPEN) ws.close()
      }
    }
  }, [handleMessage])

  return (
    <div className="relative min-h-screen bg-black text-white selection:bg-zinc-800">
      <div className="pointer-events-none fixed inset-0 z-0" aria-hidden="true">
        <div className="absolute inset-0" style={{ backgroundImage: 'linear-gradient(rgba(255,255,255,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.05) 1px, transparent 1px)', backgroundSize: '64px 64px', maskImage: 'radial-gradient(ellipse 65% 55% at 50% 0%, black 0%, transparent 75%)', WebkitMaskImage: 'radial-gradient(ellipse 65% 55% at 50% 0%, black 0%, transparent 75%)' }} />
        <div className="absolute left-1/2 top-0 h-[520px] w-[900px] -translate-x-1/2 -translate-y-1/3" style={{ background: 'radial-gradient(ellipse at center, rgba(255,255,255,0.05) 0%, transparent 68%)' }} />
      </div>

      <div className="relative z-10">
      <nav className="sticky top-0 z-50 border-b border-white/[0.06] bg-black/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-[1400px] items-center justify-between px-6 py-5">
          <div className="flex items-baseline gap-2.5">
            <h1 className="text-[17px] font-semibold tracking-[-0.01em] text-zinc-50">LiteDB Engine</h1>
            <span className="hidden sm:inline text-[11px] text-zinc-600 tracking-wide font-light">Real-time fraud detection</span>
          </div>

          <div className="hidden items-center gap-0.5 md:flex bg-white/[0.03] p-1 rounded-full border border-white/[0.06]">
            {NAV_ITEMS.map((item) => (
              <button key={item.id} type="button" onClick={() => setActiveTab(item.id)} className={`rounded-full px-5 py-1.5 text-[12px] font-medium transition-all duration-300 ${activeTab === item.id ? 'bg-zinc-100 text-black shadow-sm' : 'text-zinc-500 hover:text-zinc-200'}`}>
                {item.label}
              </button>
            ))}
          </div>

          <ConnectionStatus connected={connected} />
        </div>
      </nav>

      {alerts.length > 0 && (
        <div className="border-b border-red-900/30 bg-red-950/10">
          <div className="mx-auto max-w-[1400px] px-6 py-2.5 flex items-center gap-3">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-red-500 animate-pulse" />
            <p className="font-mono text-[11px] tracking-wide text-red-500">SYS_EVENT: {alerts[0]}</p>
          </div>
        </div>
      )}

      <main className="mx-auto max-w-[1400px] px-6 py-8">
        {activeTab === 'live' && <LiveOperations transactions={transactions} inspectedTxn={inspectedTxn} setInspectedTxn={setInspectedTxn} />}
        {activeTab === 'syndicate' && <SyndicateExplorer blacklistedMerchants={blacklistedMerchants} />}
        {activeTab === 'architecture' && <Architecture />}
      </main>
      </div>
    </div>
  )
}