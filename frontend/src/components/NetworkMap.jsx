import { useEffect, useMemo, useRef, useState } from 'react'
import { ComposableMap, Geographies, Geography, Marker, Line, ZoomableGroup } from 'react-simple-maps'

const geoUrl = 'https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json'
const API_BASE = 'http://localhost:5001'

// ─────────────────────────────────────────────────────────────
// CURATED COLOR PALETTE (No Reds, No Greens)
// ─────────────────────────────────────────────────────────────
export const USER_COLORS = [
  '#22d3ee', // Cyan
  '#e879f9', // Fuchsia
  '#fbbf24', // Amber
  '#818cf8', // Indigo
  '#a78bfa', // Violet
  '#f472b6', // Pink
  '#fb923c', // Orange
  '#38bdf8', // Sky Blue
  '#c084fc', // Purple
  '#facc15', // Yellow
  '#60a5fa', // Blue
]

// Hash function to permanently assign a user a specific color
export function getUserColor(userId) {
  if (!userId) return '#52525b';
  let hash = 0;
  for (let i = 0; i < userId.length; i++) {
    hash = userId.charCodeAt(i) + ((hash << 5) - hash);
  }
  return USER_COLORS[Math.abs(hash) % USER_COLORS.length];
}

// ─────────────────────────────────────────────────────────────
// COMPONENT
// ─────────────────────────────────────────────────────────────
export default function NetworkMap({ transactions }) {
  const [zoom, setZoom] = useState(1)
  const [center, setCenter] = useState([0, 20])
  const [historyPaths, setHistoryPaths] = useState({})
  const fetchedRef = useRef(new Set())

  // Sliding window of 15 transactions
  const mapTransactions = useMemo(() => {
    return transactions.filter((item) => item.type === 'TXN').slice(0, 15)
  }, [transactions])

  useEffect(() => {
    mapTransactions.forEach((txn) => {
      const { userId, lat, lon, status, reason } = txn.data
      const color = getUserColor(userId)
      const cacheKey = `${userId}-${txn.data.timestamp}`

      // Check if it's a velocity decline (The AI's old logic was broken here)
      const isVelocity = status === 'DECLINED' && reason && reason.includes('Velocity');

      if (isVelocity && !fetchedRef.current.has(cacheKey)) {
        fetchedRef.current.add(cacheKey)

        fetch(`${API_BASE}/api/history/${encodeURIComponent(userId)}`)
          .then((res) => (res.ok ? res.json() : []))
          .then((history) => {
            const fullPath = [...history, { lat, lon }]
            setHistoryPaths((prev) => ({
              ...prev,
              [cacheKey]: { id: cacheKey, path: fullPath, color, status }
            }))
            
            // Clean up old lines after 8 seconds
            setTimeout(() => {
              setHistoryPaths((prev) => {
                const newPaths = { ...prev };
                delete newPaths[cacheKey];
                return newPaths;
              });
            }, 8000);
          })
          .catch(console.error)
      }
    })
  }, [mapTransactions])

  // Scale-invariant sizes (Dynamically updates while panning/zooming)
  const dotR = 3 / zoom
  const strokeW = 1.2 / zoom

  return (
    <section className="mx-auto max-w-6xl px-8 py-16">
      <header className="mb-12 space-y-2">
        <h2 className="text-2xl font-light tracking-tight text-white">Geospatial Vector Map</h2>
        <p className="text-sm leading-relaxed text-zinc-500">Live transaction overlay · Persistent User Colors</p>
      </header>

      {/* Map Controls */}
      <div className="flex items-center gap-2 mb-3">
        <button onClick={() => setZoom((z) => Math.min(z * 1.6, 200))} className="px-3 py-1 rounded bg-zinc-950 border border-white/10 text-xs text-zinc-400 hover:text-white">+ Zoom</button>
        <button onClick={() => setZoom((z) => Math.max(z / 1.6, 1))} className="px-3 py-1 rounded bg-zinc-950 border border-white/10 text-xs text-zinc-400 hover:text-white">− Zoom</button>
        <button onClick={() => { setZoom(1); setCenter([0, 20]) }} className="px-3 py-1 rounded bg-zinc-950 border border-white/10 text-xs text-zinc-400 hover:text-white">Reset</button>
      </div>

      <div className="overflow-hidden rounded-2xl border border-white/10 bg-[#000000] relative flex items-center justify-center min-h-[520px]">
        <ComposableMap projection="geoMercator" projectionConfig={{ scale: 130 }} style={{ width: '100%', height: '520px' }}>
          
          {/* We use onMove instead of onMoveEnd for real-time resizing! */}
          <ZoomableGroup zoom={zoom} center={center} maxZoom={200} onMove={({ zoom: z, coordinates }) => { setZoom(z); setCenter(coordinates); }}>
            <Geographies geography={geoUrl}>
              {({ geographies }) =>
                geographies.map((geo) => (
                  <Geography key={geo.rsmKey} geography={geo} fill="#0d0d0f" stroke="#27272a" strokeWidth={0.5 / zoom} style={{ default: { outline: 'none' }, hover: { outline: 'none' }, pressed: { outline: 'none' } }} />
                ))
              }
            </Geographies>

            {/* DRAW LASER PATHS */}
            {Object.values(historyPaths).map((entry) => {
              const { id, path, color } = entry
              return (
                <g key={id}>
                  {path.map((point, i) => {
                    if (i === 0) return null;
                    const prev = path[i - 1];
                    const isFinal = i === path.length - 1;
                    return (
                      <Line key={`${id}-seg-${i}`} from={[prev.lon, prev.lat]} to={[point.lon, point.lat]} stroke={isFinal ? '#ef4444' : color} strokeWidth={strokeW * (isFinal ? 1.8 : 1)} strokeLinecap="round" style={isFinal ? { strokeDasharray: `${4 / zoom} ${4 / zoom}`, animation: 'dash 1s linear infinite' } : {}} />
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

            {/* LIVE DOTS */}
            {mapTransactions.map((txn, i) => {
              const { lat, lon, status, userId } = txn.data;
              const color = getUserColor(userId);
              return (
                <Marker key={`live-${userId}-${txn.data.timestamp}`} coordinates={[lon, lat]}>
                  <circle r={dotR * 1.6} fill={status === 'APPROVED' ? '#10b981' : '#ef4444'} opacity={1 - i * 0.05} />
                  <circle r={dotR * 2.5} fill="none" stroke={color} strokeWidth={strokeW} opacity={0.8} />
                </Marker>
              )
            })}
          </ZoomableGroup>
        </ComposableMap>
      </div>
      <style>{`@keyframes dash { to { stroke-dashoffset: -16; } }`}</style>
    </section>
  )
}