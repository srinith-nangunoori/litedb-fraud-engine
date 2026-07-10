import React, { useEffect, useState } from 'react'
import { ComposableMap, Geographies, Geography, Marker, ZoomableGroup } from 'react-simple-maps'
import InfoDrawer, { InfoDrawerTrigger } from './InfoDrawer'

const GEO_URL = 'https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json'
const API_BASE = 'http://localhost:5001'

const GRAPH_SIZE = 300
const CENTER = GRAPH_SIZE / 2
const ORBIT_RADIUS = 100
const MERCHANT_R = 18
const COMPROMISED_R = 5
const SAFE_R = 4

// ─────────────────────────────────────────────────────────────────────────────
// COMPONENT 1: THE BIPARTITE NODE GRAPH (Harvester Module)
// ─────────────────────────────────────────────────────────────────────────────
function SyndicateGraph({ data }) {

  // SAFETY CHECK: Prevent React Black Screen Crash!
  if (!data || !data.compromisedUsers) return null;

  const { totalUsers, compromisedCount, compromisedUsers } = data
  const safeCount = Math.max(totalUsers - compromisedCount, 0)

  const allUsers = [
    ...compromisedUsers.map((id, i) => ({ id, compromised: true, index: i })),
    ...Array.from({ length: safeCount }, (_, i) => ({ id: `safe_${i}`, compromised: false, index: compromisedUsers.length + i })),
  ]

  const total = allUsers.length
  const nodes = allUsers.map((user, i) => {
    const angle = (i / Math.max(total, 1)) * Math.PI * 2 - Math.PI / 2
    return { ...user, x: CENTER + ORBIT_RADIUS * Math.cos(angle), y: CENTER + ORBIT_RADIUS * Math.sin(angle) }
  })

  return (
    <div className="flex flex-col items-center justify-center h-full w-full">
      <svg viewBox={`0 0 ${GRAPH_SIZE} ${GRAPH_SIZE}`} className="w-full max-w-[280px] h-auto overflow-visible">
        <circle cx={CENTER} cy={CENTER} r={ORBIT_RADIUS} fill="none" stroke="#27272a" strokeWidth={0.5} strokeDasharray="3 5" />
        {nodes.map((n) => (
          <line key={`line-${n.id}`} x1={CENTER} y1={CENTER} x2={n.x} y2={n.y} stroke={n.compromised ? '#f59e0b' : '#27272a'} strokeWidth={0.5} strokeOpacity={0.6} />
        ))}
        {nodes.filter(n => !n.compromised).map((n) => (
          <g key={`node-${n.id}`}>
            <circle cx={n.x} cy={n.y} r={SAFE_R} fill="#18181b" stroke="#3f3f46" strokeWidth={0.8} />
            <circle cx={n.x} cy={n.y} r={1} fill="#52525b" />
          </g>
        ))}
        {nodes.filter(n => n.compromised).map((n) => (
          <g key={`node-${n.id}`}>
            <circle cx={n.x} cy={n.y} r={COMPROMISED_R + 4} fill="none" stroke="#f59e0b" strokeWidth={0.5} className="animate-ping" style={{ transformOrigin: `${n.x}px ${n.y}px` }} />
            <circle cx={n.x} cy={n.y} r={COMPROMISED_R} fill="#451a03" stroke="#f59e0b" strokeWidth={1} />
            <circle cx={n.x} cy={n.y} r={2} fill="#f59e0b" />
          </g>
        ))}
        <circle cx={CENTER} cy={CENTER} r={MERCHANT_R + 8} fill="#f59e0b10" className="animate-pulse" />
        <circle cx={CENTER} cy={CENTER} r={MERCHANT_R} fill="#09090b" stroke="#f59e0b" strokeWidth={1.2} />
        <circle cx={CENTER} cy={CENTER} r={5} fill="#f59e0b" />
      </svg>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// COMPONENT 2: THE CRIME SCENE THREAT MAP (Cash-Out Module)
// ─────────────────────────────────────────────────────────────────────────────
const MemoizedWorld = React.memo(() => (
  <Geographies geography={GEO_URL}>
    {({ geographies }) =>
      geographies.map((geo) => (
        <Geography
          key={geo.rsmKey}
          geography={geo}
          fill="#0a0505" 
          stroke="#3f1d1d" 
          strokeWidth={0.5}
          style={{ default: { outline: 'none', vectorEffect: 'non-scaling-stroke' }, hover: { outline: 'none', vectorEffect: 'non-scaling-stroke' }, pressed: { outline: 'none', vectorEffect: 'non-scaling-stroke' } }}
        />
      ))
    }
  </Geographies>
));

function ThreatMap({ crimeScenes = [] }) {
  const [zoom, setZoom] = useState(1)
  const [center, setCenter] = useState([0, 20])

  return (
    <div className="w-full h-full min-h-[300px] relative rounded-2xl overflow-hidden bg-black/40 backdrop-blur-sm border border-white/[0.06]">
      <ComposableMap projection="geoMercator" projectionConfig={{ scale: 130 }} style={{ width: '100%', height: '100%' }}>
        <ZoomableGroup zoom={zoom} center={center} maxZoom={200} onMoveEnd={({ zoom: z, coordinates }) => { setZoom(z); setCenter(coordinates); }}>
          <MemoizedWorld />
          {crimeScenes.map((scene, i) => (
            <Marker key={i} coordinates={[scene.lon, scene.lat]}>
              <circle r={3 / zoom} fill="#ef4444" />
              <circle r={8 / zoom} fill="none" stroke="#ef4444" strokeWidth={1.5 / zoom} className="animate-ping" />
              <line x1={-6/zoom} y1={0} x2={6/zoom} y2={0} stroke="#ef4444" strokeWidth={0.5/zoom} />
              <line x1={0} y1={-6/zoom} x2={0} y2={6/zoom} stroke="#ef4444" strokeWidth={0.5/zoom} />
            </Marker>
          ))}
        </ZoomableGroup>
      </ComposableMap>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN PAGE LAYOUT
// ─────────────────────────────────────────────────────────────────────────────
export default function SyndicateExplorer({ blacklistedMerchants }) {
  const [activeMerchant, setActiveMerchant] = useState(null)
  const [intelData, setIntelData] = useState(null)
  const [crimeScenes, setCrimeScenes] = useState([])
  const [loading, setLoading] = useState(false)

  // NEW: Info Drawer open/close state
  const [infoOpen, setInfoOpen] = useState(false)

  useEffect(() => {
    if (!activeMerchant && blacklistedMerchants.length > 0) {
      setActiveMerchant(blacklistedMerchants[0])
    }
  }, [blacklistedMerchants, activeMerchant])

  useEffect(() => {
    if (!activeMerchant) return;
    setLoading(true);

    Promise.all([
      fetch(`${API_BASE}/api/syndicate/${encodeURIComponent(activeMerchant)}`).then(res => res.ok ? res.json() : null),
      fetch(`${API_BASE}/api/crimescenes/${encodeURIComponent(activeMerchant)}`).then(res => res.ok ? res.json() : [])
    ])
    .then(([graphData, sceneData]) => {
      setIntelData(graphData);
      setCrimeScenes(sceneData);
      setLoading(false);
    })
    .catch((err) => {
      console.error("Failed to fetch Syndicate Intel", err);
      setLoading(false);
    });

  }, [activeMerchant])

  const isHarvester = intelData && intelData.compromisedCount > 0;
  const isCashOut = crimeScenes && crimeScenes.length > 0;
  const isArchived = !loading && !isHarvester && !isCashOut;

  return (
    <div className="relative grid grid-cols-1 lg:grid-cols-12 gap-6 h-[calc(100vh-120px)] min-h-[700px]">

      {/* ════ INFO DRAWER PANEL ════ */}
      <InfoDrawer open={infoOpen} onClose={() => setInfoOpen(false)} type="syndicate" />
      
      {/* ════ SIDEBAR ════ */}
      <div className="lg:col-span-3 flex flex-col h-full overflow-hidden">
        <h2 className="text-[10px] font-medium tracking-[0.12em] text-zinc-500 uppercase mb-4">Blacklisted Entities</h2>
        <div className="flex-1 overflow-y-auto pr-1 space-y-2 custom-scrollbar">
          {blacklistedMerchants.length === 0 ? (
            <p className="text-[11px] text-zinc-600 mt-4 text-center">No fraud rings detected.</p>
          ) : (
            blacklistedMerchants.map((merchantId) => {
              const isActive = activeMerchant === merchantId
              return (
                <button
                  key={merchantId}
                  onClick={() => setActiveMerchant(merchantId)}
                  className={`group w-full text-left p-4 rounded-2xl border backdrop-blur-sm transition-all duration-300 focus:outline-none ${
                    isActive
                      ? 'bg-red-950/20 shadow-[0_0_20px_rgba(239,68,68,0.08)]'
                      : 'bg-zinc-950/60 hover:bg-zinc-900/40 hover:border-zinc-700'
                  }`}
                  style={{
                    borderColor: isActive ? 'rgba(239,68,68,0.3)' : 'rgba(255,255,255,0.06)',
                  }}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <span className="inline-block h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: '#ef4444', boxShadow: isActive ? '0 0 8px #ef4444' : 'none' }} />
                    <span className="font-mono text-[10px] text-zinc-300 truncate">{merchantId}</span>
                  </div>
                </button>
              )
            })
          )}
        </div>
      </div>

      {/* ════ MAIN INTEL PANEL ════ */}
      <div className="lg:col-span-9 flex flex-col h-full overflow-y-auto custom-scrollbar pr-2">
        {loading ? (
           <div className="bg-zinc-950/60 backdrop-blur-sm border border-white/[0.08] rounded-2xl h-[400px] flex items-center justify-center text-[10px] font-mono text-zinc-500 animate-pulse">
            ANALYZING THREAT VECTORS...
          </div>
        ) : (
          <div className="flex flex-col gap-6">
            
            {/* GLOBAL TARGET HEADER */}
            <div className="bg-zinc-950/60 backdrop-blur-sm border border-white/[0.08] hover:border-zinc-700 transition-colors duration-500 rounded-2xl p-6">
              <h3 className="font-mono text-[10px] text-zinc-500 uppercase tracking-widest mb-1">SYNDICATE TARGET ID</h3>
              <p className="font-mono text-2xl text-white">{activeMerchant}</p>
            </div>

            {/* DYNAMIC MODULE A: THE HARVESTER GRAPH */}
            {isHarvester && (
              <div className="bg-zinc-950/60 backdrop-blur-sm border border-amber-900/20 hover:border-amber-800/40 transition-colors duration-500 rounded-2xl p-6 flex flex-col lg:flex-row gap-8">
                {/* Left: The Graph */}
                <div className="flex-1 min-h-[300px] bg-black/40 backdrop-blur-sm rounded-2xl border border-white/[0.06] relative overflow-hidden">
                  <div className="absolute top-4 left-4 z-10">
                    <h3 className="font-mono text-[10px] text-amber-500 uppercase tracking-widest bg-black/80 backdrop-blur-sm px-2.5 py-1 rounded-full border border-amber-900/40">TYPE 1: DATA HARVESTER</h3>
                  </div>
                  <SyndicateGraph data={intelData} />
                </div>
                {/* Right: The Stats & Data */}
                <div className="w-full lg:w-1/3 flex flex-col gap-4">
                  <div className="bg-white/[0.02] backdrop-blur-sm border border-white/[0.06] hover:border-zinc-700 transition-colors duration-500 rounded-2xl p-4">
                    <span className="font-mono text-[9px] text-zinc-500 tracking-widest">EXPOSED CARDS</span>
                    <p className="font-mono text-2xl text-white mt-1">{intelData.totalUsers}</p>
                  </div>
                  <div className="bg-amber-950/10 backdrop-blur-sm border border-amber-900/20 hover:border-amber-800/40 transition-colors duration-500 rounded-2xl p-4">
                    <span className="font-mono text-[9px] text-amber-500 tracking-widest">COMPROMISED ORIGINS</span>
                    <p className="font-mono text-2xl text-amber-400 font-bold mt-1">{intelData.compromisedCount}</p>
                  </div>
                  <div className="flex-1 bg-white/[0.02] backdrop-blur-sm border border-white/[0.06] rounded-2xl p-4 overflow-y-auto">
                    <span className="font-mono text-[9px] text-zinc-500 tracking-widest block mb-3">COMPROMISED TOKENS</span>
                    <ul className="space-y-2">
                      {intelData.compromisedUsers.map((t) => (
                        <li key={t} className="font-mono text-[10px] text-zinc-400 break-all">{t}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>
            )}

            {/* DYNAMIC MODULE B: THE CASH-OUT MAP */}
            {isCashOut && (
              <div className="bg-zinc-950/60 backdrop-blur-sm border border-red-900/20 hover:border-red-800/40 transition-colors duration-500 rounded-2xl p-6 flex flex-col lg:flex-row gap-8">
                {/* Left: The Threat Map */}
                <div className="flex-1 min-h-[350px] relative">
                  <div className="absolute top-4 left-4 z-10">
                    <h3 className="font-mono text-[10px] text-red-500 uppercase tracking-widest bg-black/80 backdrop-blur-sm px-2.5 py-1 rounded-full border border-red-900/40">TYPE 2: CASH-OUT FRONT</h3>
                  </div>
                  <ThreatMap crimeScenes={crimeScenes} />
                </div>
                {/* Right: The Crime Scene Ledger */}
                <div className="w-full lg:w-1/3 flex flex-col gap-4">
                  <div className="bg-red-950/10 backdrop-blur-sm border border-red-900/20 hover:border-red-800/40 transition-colors duration-500 rounded-2xl p-4">
                    <span className="font-mono text-[9px] text-red-500 tracking-widest">ATTACK VECTORS DETECTED</span>
                    <p className="font-mono text-2xl text-red-400 font-bold mt-1">{crimeScenes.length}</p>
                  </div>
                  <div className="flex-1 bg-white/[0.02] backdrop-blur-sm border border-white/[0.06] rounded-2xl p-4 overflow-y-auto">
                    <span className="font-mono text-[9px] text-zinc-500 tracking-widest block mb-3">CRIME SCENE LEDGER (GPS)</span>
                    <ul className="space-y-3">
                      {crimeScenes.map((scene, i) => {
                        // FIX: Safely check if C++ evicted the data to SSD (returning null/NaN)
                        if (!scene || isNaN(scene.lat) || isNaN(scene.lon)) {
                          return (
                            <li key={i} className="font-mono text-[10px] text-zinc-500 border-l-2 border-zinc-700 pl-3">
                                <span className="opacity-60 block">Data Evicted to SSD (Archival Log)</span>
                            </li>
                          );
                        }
                        
                        return (
                          <li key={i} className="font-mono text-[10px] text-zinc-400 border-l-2 border-red-500/60 pl-3">
                            <span className="text-zinc-300 block mb-1">Time: {new Date(scene.timestamp * 1000).toLocaleTimeString()}</span>
                            <span className="opacity-70">Lat: {scene.lat.toFixed(4)}</span><br/>
                            <span className="opacity-70">Lon: {scene.lon.toFixed(4)}</span>
                          </li>
                        )
                      })}
                    </ul>
                  </div>
                </div>
              </div>
            )}
            {/* PANEL C: ARCHIVED (Only shows if evicted to SSD) */}
            {isArchived && (
              <div className="col-span-2 bg-[#000000] border border-white/10 rounded-2xl flex flex-col items-center justify-center p-12 text-center">
                <h3 className="font-mono text-[14px] text-zinc-400 uppercase tracking-widest mb-2">DATA EVICTED TO COLD STORAGE</h3>
                <p className="text-[11px] font-mono text-zinc-600 max-w-md">
                  This syndicate was successfully mitigated. All associated graph nodes and geospatial threat markers have been flushed from C++ RAM to the SSD Archival Log to maintain sub-millisecond system performance.
                </p>
              </div>
            )}

          </div>
        )}
      </div>
      {/* ════ THE NEW FLOATING BUTTON & DRAWER ════ */}
      <InfoDrawerTrigger onClick={() => setInfoOpen(true)} />
      <InfoDrawer open={infoOpen} onClose={() => setInfoOpen(false)} type="syndicate" />
    </div>
  )
}