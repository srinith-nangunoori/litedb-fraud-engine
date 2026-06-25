import React, { useEffect, useMemo, useRef, useState } from 'react'
import {
  ComposableMap,
  Geographies,
  Geography,
  Marker,
  Line,
  ZoomableGroup,
} from 'react-simple-maps'

const GEO_URL = 'https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json'
const API_BASE = 'http://localhost:5001'

// ─────────────────────────────────────────────────────────────────────────────
// 5-color round-robin palette (no reds, no greens — those are reserved for
// APPROVED/DECLINED status signals on the map lines)
// ─────────────────────────────────────────────────────────────────────────────
const USER_COLORS = ['#22d3ee', '#e879f9', '#fbbf24', '#818cf8', '#a78bfa']

function getColorForIndex(sequenceId) {
  if (sequenceId === undefined || sequenceId === null) return '#52525b'
  return USER_COLORS[sequenceId % USER_COLORS.length]
}

// ─────────────────────────────────────────────────────────────────────────────
// MemoizedWorld — geography tiles, rendered once and never re-rendered.
// vectorEffect="non-scaling-stroke" keeps stroke width constant regardless of
// ZoomableGroup's internal SVG scale transform.
// ─────────────────────────────────────────────────────────────────────────────
const MemoizedWorld = React.memo(function MemoizedWorld() {
  return (
    <Geographies geography={GEO_URL}>
      {({ geographies }) =>
        geographies.map((geo) => (
          <Geography
            key={geo.rsmKey}
            geography={geo}
            fill="#0d0d0f"
            stroke="#27272a"
            strokeWidth={0.5}
            style={{
              default: { outline: 'none', vectorEffect: 'non-scaling-stroke' },
              hover:   { outline: 'none', vectorEffect: 'non-scaling-stroke' },
              pressed: { outline: 'none', vectorEffect: 'non-scaling-stroke' },
            }}
          />
        ))
      }
    </Geographies>
  )
})

function StatusPill({ status }) {
  const approved = status === 'APPROVED'
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[9px] font-semibold tracking-widest uppercase ${
        approved ? 'bg-emerald-950/60 text-emerald-400' : 'bg-red-950/60 text-red-400'
      }`}
    >
      <span
        className="inline-block h-1.5 w-1.5 rounded-full"
        style={{
          backgroundColor: approved ? '#10b981' : '#ef4444',
          boxShadow: `0 0 5px ${approved ? '#10b981' : '#ef4444'}`,
        }}
      />
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

// ─────────────────────────────────────────────────────────────────────────────
// MAIN COMPONENT
// ─────────────────────────────────────────────────────────────────────────────
export default function LiveOperations({ transactions, inspectedTxn, setInspectedTxn }) {
  const [zoom, setZoom] = useState(1)
  const [center, setCenter] = useState([0, 20])
  const [velocityPaths, setVelocityPaths] = useState([])
  const fetchedRef = useRef(new Set())

  // No second dedup — App.jsx already guarantees uniqueness before sequenceId assignment.
  // Any re-dedup here would create gaps in sequenceId sequence and break round-robin.
  const txnList = useMemo(() => {
    return transactions.filter((item) => item.type === 'TXN')
  }, [transactions])

  // Top-5 shared by both the feed cards AND the map dots — always in sync.
  const windowedTxns = txnList.slice(0, 5)

  // ── Velocity arc fetch ────────────────────────────────────────────────────
  // C++ backend does NOT write declined TXNs to history (cache protection).
  // We fetch valid history then append the current fraudulent coordinate ourselves.
  useEffect(() => {
    windowedTxns.forEach((txn) => {
      const { status, reason, userId, lat, lon } = txn.data
      const isVelocity = status === 'DECLINED' && reason?.toLowerCase().includes('velocity')
      if (!isVelocity) return

      const cacheKey = `${userId}-${txn.data.timestamp}`
      if (fetchedRef.current.has(cacheKey)) return
      fetchedRef.current.add(cacheKey)

      fetch(`${API_BASE}/api/history/${encodeURIComponent(userId)}`)
        .then((res) => (res.ok ? res.json() : []))
        .then((history) => {
          if (!history.length) return
          const fullPath = [...history, { lat, lon }]
          setVelocityPaths((prev) => [
            ...prev,
            { id: cacheKey, path: fullPath, color: getColorForIndex(txn.sequenceId) },
          ])
          setTimeout(
            () => setVelocityPaths((prev) => prev.filter((p) => p.id !== cacheKey)),
            8000
          )
        })
        .catch(console.error)
    })
  }, [windowedTxns])

  // ── Dot sizing ────────────────────────────────────────────────────────────
  // react-simple-maps applies a CSS transform: scale(zoom) to the ZoomableGroup
  // SVG group element. Elements rendered by <Marker> are placed INSIDE that
  // group, so they ARE scaled up by zoom. A <circle r={4}> will visually become
  // r=4*zoom on screen.
  //
  // To keep markers at a constant screen size we must counteract the scale:
  //   screen_r = geo_r * zoom  →  geo_r = screen_r / zoom
  //
  // This also means the dots naturally GROW when you zoom in (because they don't
  // shrink to compensate), which is the correct UX — zooming in should make
  // markers bigger and easier to interact with, not stay microscopic.
  //
  // We store the desired SCREEN size as a constant and divide by zoom to get
  // the correct SVG coordinate value.
  const SCREEN_DOT_R = 5       // desired radius in screen pixels at zoom=1
  const SCREEN_RING_R = 9      // desired halo radius in screen pixels at zoom=1
  const dotR   = SCREEN_DOT_R  / zoom
  const ringR  = SCREEN_RING_R / zoom
  const lineW  = 1.2 / zoom

  const d = inspectedTxn?.data
  const memTime  = d ? (d.t_bloom ?? 0) + (d.t_velocity ?? 0) : 0
  const diskTime = d ? (d.t_disk ?? 0) : 0
  const maxTime  = Math.max(memTime, diskTime, 1)

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 h-[calc(100vh-120px)] min-h-[700px]">

      {/* ══ COLUMN 1 · LIVE FEED ══════════════════════════════════════════════ */}
      <div className="lg:col-span-3 flex flex-col h-full overflow-hidden">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-[10px] font-medium tracking-[0.12em] text-zinc-500 uppercase">Live Feed</h2>
          <span className="font-mono text-[9px] text-zinc-700 tabular-nums">{txnList.length} events</span>
        </div>

        {/* Color legend strip */}
        <div className="flex gap-[3px] mb-3 px-0.5">
          {USER_COLORS.map((c, i) => (
            <span key={i} className="flex-1 h-0.5 rounded-full" style={{ backgroundColor: c, opacity: 0.5 }} />
          ))}
        </div>

        <div className="flex-1 overflow-y-auto pr-1 space-y-2">
          {txnList.map((txn) => {
            const { data } = txn
            const color = getColorForIndex(txn.sequenceId)
            const isSelected =
              inspectedTxn?.data?.userId === data.userId &&
              inspectedTxn?.data?.timestamp === data.timestamp

            return (
              <button
                key={txn.sequenceId}
                type="button"
                onClick={() => setInspectedTxn(txn)}
                className="w-full text-left p-3.5 rounded-xl border transition-all duration-300 focus:outline-none"
                style={{
                  borderColor: isSelected ? color : `${color}40`,
                  backgroundColor: isSelected ? `${color}15` : '#09090b',
                  boxShadow: isSelected ? `0 0 18px ${color}18, 0 0 6px ${color}10` : 'none',
                }}
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span
                      className="inline-block h-2 w-2 rounded-full shrink-0"
                      style={{ backgroundColor: color, boxShadow: `0 0 6px ${color}` }}
                    />
                    <StatusPill status={data.status} />
                  </div>
                  <span className="font-mono text-[9px] text-zinc-500 tabular-nums">
                    {data.t_total?.toLocaleString()} µs
                  </span>
                </div>
                <p className="font-mono text-[10px] text-zinc-200 truncate">{data.userId}</p>
                <p className="text-[9px] text-zinc-500 mt-0.5 truncate">{data.merchantId}</p>
              </button>
            )
          })}
        </div>
      </div>

      {/* ══ COLUMN 2 · MAP ════════════════════════════════════════════════════ */}
      <div className="lg:col-span-6 flex flex-col h-full">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-[10px] font-medium tracking-[0.12em] text-zinc-500 uppercase">
            Geospatial Vector Map
          </h2>
          <div className="flex gap-2">
            {[
              ['+', () => setZoom((z) => Math.min(z * 1.5, 200))],
              ['−', () => setZoom((z) => Math.max(z / 1.5, 1))],
              ['Reset', () => { setZoom(1); setCenter([0, 20]) }],
            ].map(([label, fn]) => (
              <button
                key={label}
                type="button"
                onClick={fn}
                className="px-2 py-0.5 rounded bg-zinc-900 text-[10px] text-zinc-400 hover:text-white border border-white/5 transition-colors"
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 bg-black rounded-2xl border border-white/10 overflow-hidden">
          <ComposableMap
            projection="geoMercator"
            projectionConfig={{ scale: 130 }}
            style={{ width: '100%', height: '100%', display: 'block' }}
          >
            <ZoomableGroup
              zoom={zoom}
              center={center}
              maxZoom={200}
              onMoveEnd={({ zoom: z, coordinates }) => {
                setZoom(z)
                setCenter(coordinates)
              }}
            >
              <MemoizedWorld />

              {/* ── Velocity arcs ─────────────────────────────────── */}
              {velocityPaths.map(({ id, path, color }) => (
                <g key={id}>
                  {/* Lines: history segments in the card's color, final hop in red */}
                  {path.map((point, i) => {
                    if (i === 0) return null
                    const prev = path[i - 1]
                    const isFinal = i === path.length - 1
                    return (
                      <Line
                        key={`${id}-seg-${i}`}
                        from={[prev.lon, prev.lat]}
                        to={[point.lon, point.lat]}
                        stroke={isFinal ? '#ef4444' : color}
                        strokeWidth={lineW * (isFinal ? 1.8 : 1)}
                        strokeLinecap="round"
                        style={isFinal ? {
                          strokeDasharray: `${4 / zoom} ${4 / zoom}`,
                          animation: 'dash 1s linear infinite',
                        } : {}}
                      />
                    )
                  })}
                  {/* Dots on arc waypoints */}
                  {path.map((point, i) => {
                    const isFinal = i === path.length - 1
                    return (
                      <Marker key={`${id}-dot-${i}`} coordinates={[point.lon, point.lat]}>
                        <circle
                          r={(isFinal ? dotR * 1.4 : dotR * 0.8)}
                          fill={isFinal ? '#ef4444' : color}
                        />
                      </Marker>
                    )
                  })}
                </g>
              ))}

              {/* ── Live transaction dots ─────────────────────────── */}
              {windowedTxns.map((txn, i) => {
                const { lat, lon, status } = txn.data
                const color = getColorForIndex(txn.sequenceId)
                const isDeclined = status === 'DECLINED'

                return (
                  <Marker
                    key={`live-${txn.sequenceId}`}
                    coordinates={[lon, lat]}
                  >
                    {/* The main identity dot (Always the user's color!) */}
                    <circle
                      r={dotR * 1.5}
                      fill={color}
                      opacity={1 - i * 0.15}
                    />
                    
                    {/* If declined, draw a simple red circle outline around it */}
                    {isDeclined && (
                      <circle
                        r={dotR * 3}
                        fill="none"
                        stroke="#ef4444"
                        strokeWidth={lineW}   // <--- CHANGED FROM strokeW TO lineW
                      />
                    )}
                  </Marker>
                )
              })}
            </ZoomableGroup>
          </ComposableMap>
        </div>

        <style>{`@keyframes dash { to { stroke-dashoffset: -16; } }`}</style>
      </div>

      {/* ══ COLUMN 3 · INSPECTOR ══════════════════════════════════════════════ */}
      <div className="lg:col-span-3 flex flex-col h-full">
        <h2 className="text-[10px] font-medium tracking-[0.12em] text-zinc-500 uppercase mb-4">
          Inspector Pane
        </h2>

        <div
          className="flex-1 rounded-2xl border overflow-y-auto transition-colors duration-300"
          style={{
            backgroundColor: '#000000',
            borderColor: inspectedTxn
              ? `${getColorForIndex(inspectedTxn.sequenceId)}30`
              : 'rgba(255,255,255,0.1)',
            boxShadow: inspectedTxn
              ? `0 0 24px ${getColorForIndex(inspectedTxn.sequenceId)}08`
              : 'none',
          }}
        >
          {!inspectedTxn ? (
            <div className="h-full flex flex-col items-center justify-center text-center px-6 gap-3">
              <div className="h-px w-12 bg-zinc-800" />
              <p className="text-[11px] leading-relaxed text-zinc-600">
                Click a transaction in the live feed to freeze its metrics here.
              </p>
              <div className="h-px w-12 bg-zinc-800" />
            </div>
          ) : (
            <div className="p-5 space-y-7">
              <div>
                <div className="flex items-center gap-3 mb-3">
                  <span
                    className="inline-block h-3 w-3 rounded-full shrink-0"
                    style={{
                      backgroundColor: getColorForIndex(inspectedTxn.sequenceId),
                      boxShadow: `0 0 8px ${getColorForIndex(inspectedTxn.sequenceId)}`,
                    }}
                  />
                  <StatusPill status={d.status} />
                </div>
                {d.reason && (
                  <div className="mt-2 rounded-lg bg-red-950/25 border border-red-900/40 p-3">
                    <p className="text-[10px] text-red-400/90 leading-relaxed font-mono">{d.reason}</p>
                  </div>
                )}
              </div>

              <div>
                <p className="text-[9px] tracking-[0.14em] text-zinc-600 uppercase mb-2">Payload Data</p>
                <div className="space-y-1 bg-zinc-950/50 rounded-lg border border-white/5 p-3">
                  <p className="font-mono text-[10px] text-zinc-300 break-all">{d.userId}</p>
                  <p className="font-mono text-[10px] text-zinc-500 mt-1">{d.merchantId}</p>
                  <p className="font-mono text-[9px] text-zinc-600 mt-2">
                    LAT: {d.lat?.toFixed(4)}&nbsp;&nbsp;LON: {d.lon?.toFixed(4)}
                  </p>
                </div>
              </div>

              <div>
                <p className="text-[9px] tracking-[0.14em] text-zinc-600 uppercase mb-2">C++ Engine Profiling</p>
                <div className="bg-zinc-950/50 rounded-lg border border-white/5 px-4">
                  <MonoRow label="T_TOTAL"    value={d.t_total} />
                  <MonoRow label="T_LOCK"     value={d.t_lock} />
                  <MonoRow label="T_BLOOM"    value={d.t_bloom} />
                  <MonoRow label="T_VELOCITY" value={d.t_velocity} />
                  <MonoRow label="T_DISK"     value={d.t_disk} />
                </div>
              </div>

              <div>
                <p className="text-[9px] tracking-[0.14em] text-zinc-600 uppercase mb-3">Memory vs Disk I/O</p>
                <div className="bg-zinc-950/50 rounded-lg border border-white/5 p-4 space-y-3">
                  <SpeedBar label="RAM (Bloom + Math)" value={memTime}  max={maxTime} color="#38bdf8" />
                  <SpeedBar label="SSD (AOF Write)"    value={diskTime} max={maxTime} color="#fbbf24" />
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

    </div>
  )
}