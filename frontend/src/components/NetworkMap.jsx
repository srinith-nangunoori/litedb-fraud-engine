import { useEffect, useMemo, useRef, useState } from 'react'
import { ComposableMap, Geographies, Geography, Marker, Line } from 'react-simple-maps'

// Professional TopoJSON world map
const geoUrl = "https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json"
const API_BASE = 'http://localhost:5001'
const VISIBLE_COUNT = 15

export default function NetworkMap({ transactions }) {
  const [velocityPaths, setVelocityPaths] = useState([])
  const fetchedUsersRef = useRef(new Set())

  // Keep only the newest transactions for the map dots
  const mapTransactions = useMemo(() => {
    return transactions
      .filter((item) => item.type === 'TXN')
      .slice(0, VISIBLE_COUNT)
  }, [transactions])

  useEffect(() => {
    mapTransactions.forEach((transaction) => {
      const { status, reason, userId, lat, lon } = transaction.data
      
      // If it is a Velocity Decline, fetch history and draw the line
      if (status === 'DECLINED' && reason && reason.toLowerCase().includes('velocity')) {
        if (fetchedUsersRef.current.has(userId)) return
        fetchedUsersRef.current.add(userId)

        fetch(`${API_BASE}/api/history/${encodeURIComponent(userId)}`)
          .then((res) => (res.ok ? res.json() : []))
          .then((history) => {
            if (history.length > 0) {
              // The history only contains VALID locations. We must append the Hacker's current location!
              const fullPath = [...history, { lat, lon }]
              
              const newPath = {
                id: `${userId}-${Date.now()}`,
                path: fullPath
              }

              setVelocityPaths((prev) => [...prev, newPath])

              // Fade the line out after 8 seconds
              setTimeout(() => {
                setVelocityPaths((prev) => prev.filter((p) => p.id !== newPath.id))
              }, 8000)
            }
          })
          .catch(console.error)
      }
    })
  }, [mapTransactions])

  return (
    <section className="mx-auto max-w-6xl px-8 py-16">
      <header className="mb-12 space-y-2">
        <h2 className="text-2xl font-light tracking-tight text-white">Geospatial Vector Map</h2>
        <p className="text-sm leading-relaxed text-zinc-500">Live transaction overlay · C++ Velocity tracking</p>
      </header>

      <div className="overflow-hidden rounded-2xl border border-neutral-900 bg-[#09090b] p-2 relative flex items-center justify-center min-h-[500px]">
        
        <ComposableMap projection="geoMercator" projectionConfig={{ scale: 130 }}>
          <Geographies geography={geoUrl}>
            {({ geographies }) =>
              geographies.map((geo) => (
                <Geography
                  key={geo.rsmKey}
                  geography={geo}
                  fill="#121214" // Deep dark gray continents
                  stroke="#27272a" // Crisp subtle borders
                  strokeWidth={0.5}
                  style={{
                    default: { outline: "none" },
                    hover: { outline: "none" },
                    pressed: { outline: "none" }
                  }}
                />
              ))
            }
          </Geographies>

          {/* 1. DRAW VELOCITY LASER PATHS */}
          {velocityPaths.map((entry) => {
            const lines = [];
            for (let i = 1; i < entry.path.length; i++) {
              const prev = entry.path[i - 1];
              const curr = entry.path[i];
              const isHackerJump = i === entry.path.length - 1;

              lines.push(
                <g key={`${entry.id}-segment-${i}`}>
                  <Line
                    from={[prev.lon, prev.lat]}
                    to={[curr.lon, curr.lat]}
                    stroke={isHackerJump ? "#ef4444" : "#3f3f46"} // Red for hacker jump, gray for valid history
                    strokeWidth={isHackerJump ? 1.5 : 1}
                    strokeLinecap="round"
                    style={isHackerJump ? { strokeDasharray: "4 4", animation: "dash 1s linear infinite" } : {}}
                  />
                  <Marker coordinates={[prev.lon, prev.lat]}>
                    <circle r={2} fill="#71717a" />
                  </Marker>
                </g>
              );
            }
            return <g key={entry.id}>{lines}</g>;
          })}

          {/* 2. PLOT LIVE TRANSACTIONS */}
          {mapTransactions.map((transaction, index) => {
            const { lat, lon, status, userId, timestamp } = transaction.data;
            const isApproved = status === 'APPROVED';
            
            return (
              <Marker key={`${userId}-${timestamp}-${index}`} coordinates={[lon, lat]}>
                <circle 
                  r={isApproved ? 3 : 5} 
                  fill={isApproved ? '#10b981' : '#ef4444'} 
                  opacity={1 - (index * 0.05)} 
                />
                {!isApproved && (
                  <circle r={10} fill="none" stroke="#ef4444" strokeWidth={1} opacity={0.5} className="animate-ping" />
                )}
              </Marker>
            );
          })}
        </ComposableMap>

      </div>
    </section>
  )
}