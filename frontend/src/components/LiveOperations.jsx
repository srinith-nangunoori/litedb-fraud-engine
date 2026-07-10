import React, { useEffect, useMemo, useRef, useState } from 'react'
import { ComposableMap, Geographies, Geography, Marker, Line, ZoomableGroup } from 'react-simple-maps'
import { ResponsiveContainer, LineChart, Line as RechartsLine, XAxis, YAxis, Tooltip, BarChart, Bar, Cell } from 'recharts'
import InfoDrawer, { InfoDrawerTrigger } from './InfoDrawer'

const geoUrl = 'https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json'
const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:5001'

const USER_COLORS = ['#22d3ee', '#e879f9', '#fbbf24', '#818cf8', '#a78bfa']

function getColorForIndex(sequenceId) {
  if (sequenceId === undefined || sequenceId === null) return '#52525b'
  return USER_COLORS[sequenceId % USER_COLORS.length]
}

// ─────────────────────────────────────────────────────────────
// MEMOIZED WORLD MAP (GPU Accelerated)
// ─────────────────────────────────────────────────────────────
const MemoizedWorld = React.memo(() => (
  <Geographies geography={geoUrl}>
    {({ geographies }) =>
      geographies.map((geo) => (
        <Geography
          key={geo.rsmKey}
          geography={geo}
          fill="#0d0d0f"
          stroke="#1e1e24" // Extremely faint boundaries
          strokeWidth={0.5}
          style={{
            default: { outline: 'none', vectorEffect: 'non-scaling-stroke' },
            hover: { outline: 'none', vectorEffect: 'non-scaling-stroke' },
            pressed: { outline: 'none', vectorEffect: 'non-scaling-stroke' }
          }}
        />
      ))
    }
  </Geographies>
));

function StatusPill({ status }) {
  const approved = status === 'APPROVED'
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[9px] font-semibold tracking-widest uppercase ${approved ? 'bg-emerald-950/60 text-emerald-400' : 'bg-red-950/60 text-red-400'}`}>
      <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ backgroundColor: approved ? '#10b981' : '#ef4444', boxShadow: `0 0 5px ${approved ? '#10b981' : '#ef4444'}` }} />
      {status}
    </span>
  )
}

function MonoRow({ label, value }) {
  return (
    <div className="flex items-center justify-between border-b border-zinc-800/40 py-2.5 last:border-0">
      <span className="font-mono text-[9px] tracking-[0.12em] text-zinc-500 uppercase">{label}</span>
      <span className="font-mono text-xs text-zinc-300 tabular-nums">
        {typeof value === 'number' ? value.toLocaleString() : value} µs
      </span>
    </div>
  )
}

function SpeedBar({ label, value, max, color }) {
  const pct = max > 0 ? Math.min((value / max) * 100, 100) : 0
  return (
    <div className="space-y-1">
      <div className="flex justify-between items-center">
        <span className="font-mono text-[9px] tracking-widest text-zinc-500 uppercase">{label}</span>
        <span className="font-mono text-[10px] text-zinc-400 tabular-nums">{value?.toLocaleString()} µs</span>
      </div>
      <div className="h-1.5 w-full rounded-full bg-zinc-900 overflow-hidden">
        <div className="h-full rounded-full transition-all duration-700" style={{ width: `${pct}%`, backgroundColor: color }} />
      </div>
    </div>
  )
}

// Minimalist Apple-style Tooltip for Recharts
function ChartTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-zinc-800 bg-black/95 px-3 py-2 text-[10px] font-mono text-zinc-400">
      <p className="text-white font-bold">{payload[0].name}: {Math.round(payload[0].value)} µs</p>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// MAIN COMPONENT
// ─────────────────────────────────────────────────────────────
export default function LiveOperations({ transactions, inspectedTxn, setInspectedTxn }) {
  const [zoom, setZoom] = useState(1)
  const [center, setCenter] = useState([0, 20])
  const [velocityPaths, setVelocityPaths] = useState([])
  const fetchedUsersRef = useRef(new Set())

  // NEW: Info Drawer open/close state
  const [infoOpen, setInfoOpen] = useState(false)

  // NEW: Force Recharts to wait until the DOM is 100% stable!
  const [isMounted, setIsMounted] = useState(false);
  useEffect(() => {
    setIsMounted(true);
  }, []);
  // Deduplicate live stream
  const txnList = useMemo(() => {
    const seen = new Set()
    return transactions.filter((item) => item.type === 'TXN').filter((item) => {
        const key = `${item.data.userId}-${item.data.timestamp}`
        if (seen.has(key)) return false
        seen.add(key); return true
      })
  }, [transactions])

  const windowedTxns = txnList.slice(0, 5) 

  // Watch for Velocity Declines to draw laser paths
  useEffect(() => {
    windowedTxns.forEach((txn) => {
      const { status, reason, userId, lat, lon } = txn.data
      if (status === 'DECLINED' && reason && reason.toLowerCase().includes('velocity')) {
        const cacheKey = `${userId}-${txn.data.timestamp}`
        if (fetchedUsersRef.current.has(cacheKey)) return
        fetchedUsersRef.current.add(cacheKey)

        fetch(`${API_BASE}/api/history/${encodeURIComponent(userId)}`)
          .then((res) => res.ok ? res.json() : [])
          .then((history) => {
            if (history.length > 0) {
              const fullPath = [...history, { lat, lon }]
              const newPath = { id: cacheKey, path: fullPath, color: getColorForIndex(txn.sequenceId) }
              setVelocityPaths((prev) => [...prev, newPath])
              setTimeout(() => setVelocityPaths((prev) => prev.filter((p) => p.id !== cacheKey)), 8000)
            }
          }).catch(console.error)
      }
    })
  }, [windowedTxns])

  // --- RECHARTS MATH DATA PREPARATION ---
  
  // 1. Line Chart Data (Last 15 total execution latencies reversed chronologically)
  const lineChartData = useMemo(() => {
    const reversed = [...windowedTxns].reverse();
    return reversed.map((txn) => ({
      name: 'Total Latency',
      t_total: txn.data.t_total
    }));
  }, [windowedTxns]);

  // 2. Bar Chart Data (Rolling average of RAM vs SSD speeds over the last 15 transactions)
  const barChartData = useMemo(() => {
    const activeSlice = txnList.slice(0, 15);
    if (activeSlice.length === 0) {
      return [{ name: 'RAM', value: 0 }, { name: 'SSD', value: 0 }];
    }
    const memSum = activeSlice.reduce((acc, t) => acc + (t.data.t_bloom ?? 0) + (t.data.t_velocity ?? 0), 0);
    const diskSum = activeSlice.reduce((acc, t) => acc + (t.data.t_disk ?? 0), 0);
    const count = activeSlice.length;

    return [
      { name: 'RAM Speed', value: Math.round(memSum / count) },
      { name: 'SSD Speed', value: Math.round(diskSum / count) }
    ];
  }, [txnList]);

  const dotR = 3 / zoom
  const strokeW = 1.2 / zoom

  const d = inspectedTxn?.data
  const memTime = d ? (d.t_bloom ?? 0) + (d.t_velocity ?? 0) : 0
  const diskTime = d ? (d.t_disk ?? 0) : 0
  const maxTime = Math.max(memTime, diskTime, 1)

  return (
    <div className="relative grid grid-cols-1 lg:grid-cols-12 gap-6 h-[calc(100vh-120px)] min-h-[700px]">

      {/* ════ INFO DRAWER PANEL ════ */}
      <InfoDrawer open={infoOpen} onClose={() => setInfoOpen(false)} type="live" />

      {/* ════ COLUMN 1: LIVE FEED ════ */}
      <div className="lg:col-span-3 flex flex-col h-full overflow-hidden">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-[10px] font-medium tracking-[0.12em] text-zinc-500 uppercase">Live Feed</h2>
          <span className="font-mono text-[9px] text-zinc-700 tabular-nums">{txnList.length} events</span>
        </div>
        <div className="flex gap-[3px] mb-4 px-0.5">
          {USER_COLORS.map((c, i) => (
            <span key={i} className="flex-1 h-0.5 rounded-full" style={{ backgroundColor: c, opacity: 0.5 }} />
          ))}
        </div>
        <div className="flex-1 overflow-y-auto pr-1 space-y-2 custom-scrollbar">
          {txnList.map((txn) => {
            const { data } = txn
            const color = getColorForIndex(txn.sequenceId)
            const isSelected = inspectedTxn?.data?.userId === data.userId && inspectedTxn?.data?.timestamp === data.timestamp
            return (
              <button
                key={`${data.userId}-${data.timestamp}`}
                onClick={() => setInspectedTxn(txn)}
                className={`group w-full text-left p-3.5 rounded-2xl border backdrop-blur-sm transition-all duration-300 ${
                  isSelected
                    ? 'bg-zinc-900/70 shadow-[0_0_0_1px_rgba(255,255,255,0.02)]'
                    : 'bg-zinc-950/60 hover:bg-zinc-900/40 hover:border-zinc-700'
                }`}
                style={{ borderColor: isSelected ? color : 'rgba(255,255,255,0.06)' }}
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="inline-block h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: color, boxShadow: `0 0 6px ${color}` }} />
                    <StatusPill status={data.status} />
                  </div>
                  <span className="font-mono text-[9px] text-zinc-500 tabular-nums">{data.t_total?.toLocaleString()} µs</span>
                </div>
                <p className="font-mono text-[10px] text-zinc-200 truncate">{data.userId}</p>
                <p className="text-[9px] text-zinc-500 mt-0.5 truncate">{data.merchantId}</p>
              </button>
            )
          })}
        </div>
      </div>

      {/* ════ COLUMN 2: VECTOR MAP & TELEMETRY CHARTS ════ */}
      <div className="lg:col-span-6 flex flex-col h-full gap-5">
        
        {/* MAP CONTAINER (60% height) */}
        <div className="flex-grow flex flex-col min-h-[350px]">
          <div className="flex items-center justify-between mb-2.5">
            <h2 className="text-[10px] font-medium tracking-[0.12em] text-zinc-500 uppercase">Geospatial Vector Map</h2>
            <div className="flex gap-1.5">
              <button onClick={() => setZoom(z => Math.min(z * 1.5, 200))} className="px-2.5 py-0.5 rounded-full bg-white/[0.03] text-[10px] text-zinc-400 hover:text-white hover:bg-white/[0.06] border border-white/[0.06] transition-all duration-200">+</button>
              <button onClick={() => setZoom(z => Math.max(z / 1.5, 1))} className="px-2.5 py-0.5 rounded-full bg-white/[0.03] text-[10px] text-zinc-400 hover:text-white hover:bg-white/[0.06] border border-white/[0.06] transition-all duration-200">−</button>
              <button onClick={() => { setZoom(1); setCenter([0, 20]) }} className="px-2.5 py-0.5 rounded-full bg-white/[0.03] text-[10px] text-zinc-400 hover:text-white hover:bg-white/[0.06] border border-white/[0.06] transition-all duration-200">Reset</button>
            </div>
          </div>

          <div className="flex-1 bg-zinc-950/60 backdrop-blur-sm rounded-2xl border border-white/[0.08] hover:border-zinc-700 transition-colors duration-500 overflow-hidden relative min-h-[400px]">
            <ComposableMap projection="geoMercator" projectionConfig={{ scale: 130 }} style={{ width: '100%', height: '100%' }}>
              <ZoomableGroup zoom={zoom} center={center} maxZoom={200} onMoveEnd={({ zoom: z, coordinates }) => { setZoom(z); setCenter(coordinates); }}>
                
                <MemoizedWorld />

                {/* Laser Paths */}
                {velocityPaths.map((entry) => {
                  const { id, path, color } = entry
                  return (
                    <g key={id}>
                      {path.map((point, i) => {
                        if (i === 0) return null;
                        const prev = path[i - 1];
                        const isFinal = i === path.length - 1;
                        return (
                          <Line key={`${id}-seg-${i}`} from={[prev.lon, prev.lat]} to={[point.lon, point.lat]} stroke={isFinal ? '#ef4444' : color} strokeWidth={strokeW * (isFinal ? 1.8 : 1)} strokeLinecap="round" style={isFinal ? { strokeDasharray: `${4/zoom} ${4/zoom}`, animation: 'dash 1s linear infinite' } : {}} />
                        )
                      })}
                      {path.map((point, i) => {
                        const isFinal = i === path.length - 1;
                        return (
                          <Marker key={`${id}-dot-${i}`} coordinates={[point.lon, point.lat]}>
                            <circle r={dotR * (isFinal ? 1.5 : 1)} fill={isFinal ? '#ef4444' : color} />
                          </Marker>
                        )
                      })}
                    </g>
                  )
                })}

                {/* Live Dots */}
                {windowedTxns.map((txn, i) => {
                  const { lat, lon, status, userId } = txn.data
                  const isDeclined = status === 'DECLINED'
                  const color = getColorForIndex(txn.sequenceId)
                  return (
                    <Marker key={`live-${userId}-${txn.data.timestamp}`} coordinates={[lon, lat]}>
                      <circle r={dotR * 2} fill={color} opacity={1 - i * 0.15} />
                      {isDeclined && <circle r={dotR * 4} fill="none" stroke="#ef4444" strokeWidth={strokeW} className="animate-ping" />}
                    </Marker>
                  )
                })}
              </ZoomableGroup>
            </ComposableMap>
          </div>
        </div>

        {/* MINIMALIST TELEMETRY CHARTS (40% height) */}
        <div className="grid grid-cols-2 gap-4 h-[200px] shrink-0">
          
          {/* CHART 1: TOTAL LATENCY TREND */}
          <div className="bg-zinc-950/60 backdrop-blur-sm rounded-2xl border border-white/[0.08] hover:border-zinc-700 transition-colors duration-500 p-4 flex flex-col justify-between">
            <p className="text-[9px] tracking-widest text-zinc-500 font-bold uppercase mb-2">REAL-TIME C++ LATENCY (T_TOTAL)</p>
            <div className="flex-1 w-full" style={{ minHeight: '120px' }}>
              {lineChartData.length === 0 ? (
                <div className="h-full flex items-center justify-center text-xs text-zinc-700">Awaiting stream...</div>
              ) : (
                // FIX: Only render Recharts after mounting is complete!
                isMounted && (
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={lineChartData}>
                      <XAxis dataKey="name" hide={true} />
                      <YAxis hide={true} domain={['auto', 'auto']} />
                      <Tooltip content={<ChartTooltip />} cursor={{ stroke: '#27272a', strokeWidth: 1 }} />
                      <RechartsLine type="monotone" dataKey="t_total" name="Total Latency" stroke="#ffffff" strokeWidth={1} dot={false} animationDuration={700} />
                    </LineChart>
                  </ResponsiveContainer>
                )
              )}
            </div>
          </div>

          {/* CHART 2: MEMORY VS DISK COMPARISON */}
          <div className="bg-zinc-950/60 backdrop-blur-sm rounded-2xl border border-white/[0.08] hover:border-zinc-700 transition-colors duration-500 p-4 flex flex-col justify-between">
            <p className="text-[9px] tracking-widest text-zinc-500 font-bold uppercase mb-2">COMPUTATION (RAM) VS STORAGE (SSD)</p>
            <div className="flex-1 w-full" style={{ minHeight: '120px' }}>
              {txnList.length === 0 ? (
                <div className="h-full flex items-center justify-center text-xs text-zinc-700">Awaiting telemetry...</div>
              ) : (
                // FIX: Only render Recharts after mounting is complete!
                isMounted && (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={barChartData} barSize={28}>
                      <XAxis dataKey="name" tick={{ fill: '#71717a', fontSize: 10 }} axisLine={false} tickLine={false} />
                      <YAxis hide={true} />
                      <Tooltip content={<ChartTooltip />} cursor={{ fill: 'transparent' }} />
                      <Bar dataKey="value" name="Avg Latency" radius={[4, 4, 0, 0]} animationDuration={700}>
                        {barChartData.map((entry, index) => (
                          <Cell key={`bar-cell-${index}`} fill={index === 0 ? '#38bdf8' : '#fbbf24'} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                )
              )}
            </div>
          </div>

        </div>

      </div>

      {/* ════ COLUMN 3: INSPECTOR PANE ════ */}
      <div className="lg:col-span-3 flex flex-col h-full">
        <h2 className="text-[10px] font-medium tracking-[0.12em] text-zinc-500 uppercase mb-4">Inspector Pane</h2>
        <div className="flex-1 bg-zinc-950/60 backdrop-blur-sm rounded-2xl border border-white/[0.08] hover:border-zinc-700 transition-colors duration-500 overflow-y-auto">
          {!inspectedTxn ? (
            <div className="h-full flex flex-col items-center justify-center text-center px-6 gap-3">
              <div className="h-px w-12 bg-zinc-800" />
              <p className="text-[11px] leading-relaxed text-zinc-600">Click a transaction in the live feed to freeze its metrics here.</p>
              <div className="h-px w-12 bg-zinc-800" />
            </div>
          ) : (
            <div className="p-5 space-y-7">
              <div>
                <div className="flex items-center gap-3 mb-3">
                  <span className="inline-block h-3 w-3 rounded-full shrink-0" style={{ backgroundColor: getColorForIndex(inspectedTxn.sequenceId), boxShadow: `0 0 8px ${getColorForIndex(inspectedTxn.sequenceId)}` }} />
                  <StatusPill status={d.status} />
                </div>
                {d.reason && (
                  <div className="mt-2 rounded-xl bg-red-950/20 backdrop-blur-sm border border-red-900/30 p-3">
                    <p className="text-[10px] text-red-400/90 leading-relaxed font-mono">{d.reason}</p>
                  </div>
                )}
              </div>
              <div>
                <p className="text-[9px] tracking-[0.14em] text-zinc-600 uppercase mb-2">Payload Data</p>
                <div className="space-y-1 bg-white/[0.02] backdrop-blur-sm rounded-xl border border-white/[0.06] p-3.5">
                  <p className="font-mono text-[10px] text-zinc-300 break-all">{d.userId}</p>
                  <p className="font-mono text-[10px] text-zinc-500 mt-1">{d.merchantId}</p>
                  <p className="font-mono text-[9px] text-zinc-600 mt-2">LAT: {d.lat?.toFixed(4)} &nbsp; LON: {d.lon?.toFixed(4)}</p>
                </div>
              </div>
              <div>
                <p className="text-[9px] tracking-[0.14em] text-zinc-600 uppercase mb-2">C++ Engine Profiling</p>
                <div className="bg-white/[0.02] backdrop-blur-sm rounded-xl border border-white/[0.06] px-4">
                  <MonoRow label="T_TOTAL" value={d.t_total} />
                  <MonoRow label="T_LOCK" value={d.t_lock} />
                  <MonoRow label="T_BLOOM" value={d.t_bloom} />
                  <MonoRow label="T_VELOCITY" value={d.t_velocity} />
                  <MonoRow label="T_DISK" value={d.t_disk} />
                </div>
              </div>
              <div>
                <p className="text-[9px] tracking-[0.14em] text-zinc-600 uppercase mb-3">Memory vs Disk I/O</p>
                <div className="bg-white/[0.02] backdrop-blur-sm rounded-xl border border-white/[0.06] p-4 space-y-3">
                  <SpeedBar label="RAM (Bloom + Math)" value={memTime} max={maxTime} color="#38bdf8" />
                  <SpeedBar label="SSD (AOF Write)" value={diskTime} max={maxTime} color="#fbbf24" />
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
      {/* ════ THE NEW FLOATING BUTTON & DRAWER ════ */}
      <InfoDrawerTrigger onClick={() => setInfoOpen(true)} />
      <InfoDrawer open={infoOpen} onClose={() => setInfoOpen(false)} type="live" />
    </div>
  )
}