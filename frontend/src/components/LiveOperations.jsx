import { useEffect, useMemo, useRef, useState } from 'react';
import { ComposableMap, Geographies, Geography, Marker, Line } from 'react-simple-maps';

// This is a minimal topojson map of the world
const geoUrl = "https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json";

function StatusDot({ status }) {
  const color = status === 'APPROVED' ? '#10b981' : '#ef4444';
  return (
    <span
      className="inline-block h-2 w-2 shrink-0 rounded-full"
      style={{ backgroundColor: color, boxShadow: `0 0 8px ${color}` }}
    />
  );
}

function TimingRow({ label, value }) {
  return (
    <div className="flex items-center justify-between border-b border-zinc-800/50 py-3 last:border-0">
      <span className="font-mono text-[10px] tracking-widest text-zinc-500 uppercase">{label}</span>
      <span className="font-mono text-xs text-zinc-300 tabular-nums">{value.toLocaleString()} µs</span>
    </div>
  );
}

export default function LiveOperations({ transactions, inspectedTxn, setInspectedTxn }) {
  const txnList = transactions.filter((item) => item.type === 'TXN');
  
  // State to hold the beautiful curved paths for hackers
  const [velocityPaths, setVelocityPaths] = useState([]);
  const fetchedUsersRef = useRef(new Set());

  // Watch the incoming transactions to trigger map paths
  useEffect(() => {
    const latestTxns = txnList.slice(0, 5); // Only check the newest ones
    
    latestTxns.forEach((transaction) => {
      const { status, reason, userId, lat, lon } = transaction.data;
      
      // If it's an impossible velocity fraud...
      if (status === 'DECLINED' && reason && reason.includes('Velocity')) {
        if (fetchedUsersRef.current.has(userId)) return;
        fetchedUsersRef.current.add(userId);

        // Fetch their history from the NodeJS backend
        fetch(`http://localhost:5001/api/history/${encodeURIComponent(userId)}`)
          .then((res) => (res.ok ? res.json() : []))
          .then((history) => {
            if (history.length > 0) {
              // Get the last valid location from their history
              const lastValid = history[history.length - 1];
              
              // Add a new glowing path to the map state
              const newPath = {
                id: `${userId}-${Date.now()}`,
                start: [lastValid.lon, lastValid.lat], // Note: Maps use [lon, lat]
                end: [lon, lat]
              };
              
              setVelocityPaths(prev => [...prev, newPath]);

              // Automatically remove the path after 8 seconds so the map stays clean
              setTimeout(() => {
                setVelocityPaths(prev => prev.filter(p => p.id !== newPath.id));
              }, 8000);
            }
          })
          .catch(console.error);
      }
    });
  }, [txnList]);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 h-[calc(100vh-120px)]">
      
      {/* ======================================================== */}
      {/* COLUMN 1: THE LIVE SCROLLING FEED (Col span 3)           */}
      {/* ======================================================== */}
      <div className="lg:col-span-3 flex flex-col h-full overflow-hidden">
        <h2 className="text-xs font-medium tracking-[0.1em] text-zinc-500 mb-4 uppercase">Live Feed</h2>
        
        <div className="flex-1 overflow-y-auto pr-2 space-y-2 custom-scrollbar">
          {txnList.length === 0 ? (
            <p className="text-xs text-zinc-600 mt-4">Awaiting C++ packets...</p>
          ) : (
            txnList.map((txn, index) => {
              const { data } = txn;
              const isSelected = inspectedTxn?.data?.userId === data.userId && inspectedTxn?.data?.timestamp === data.timestamp;
              
              return (
                <button
                  key={index}
                  onClick={() => setInspectedTxn(txn)}
                  className={`w-full text-left p-4 rounded-xl border transition-all duration-200 ${
                    isSelected 
                      ? 'bg-zinc-900 border-zinc-700' 
                      : 'bg-[#09090b] border-zinc-900 hover:border-zinc-800'
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <StatusDot status={data.status} />
                    <span className="font-mono text-[10px] text-zinc-600 tabular-nums">{data.t_total} µs</span>
                  </div>
                  <p className="font-mono text-[11px] text-zinc-300 truncate">{data.userId}</p>
                  <p className="text-[10px] text-zinc-500 mt-1 truncate">{data.merchantId}</p>
                </button>
              );
            })
          )}
        </div>
      </div>

      {/* ======================================================== */}
      {/* COLUMN 2: THE VECTOR MAP (Col span 6)                    */}
      {/* ======================================================== */}
      <div className="lg:col-span-6 flex flex-col h-full">
        <h2 className="text-xs font-medium tracking-[0.1em] text-zinc-500 mb-4 uppercase">Geospatial Vector Map</h2>
        
        <div className="flex-1 bg-[#09090b] rounded-2xl border border-zinc-900 flex items-center justify-center overflow-hidden relative">
          <ComposableMap projection="geoMercator" projectionConfig={{ scale: 120 }}>
            <Geographies geography={geoUrl}>
              {({ geographies }) =>
                geographies.map((geo) => (
                  <Geography
                    key={geo.rsmKey}
                    geography={geo}
                    fill="#18181b" // Very dark gray continents
                    stroke="#27272a" // Subtle borders
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

            {/* PLOT RECENT TRANSACTIONS AS DOTS */}
            {txnList.slice(0, 20).map((txn, i) => (
              <Marker key={i} coordinates={[txn.data.lon, txn.data.lat]}>
                <circle 
                  r={txn.data.status === 'APPROVED' ? 2 : 4} 
                  fill={txn.data.status === 'APPROVED' ? '#10b981' : '#ef4444'} 
                  opacity={1 - (i * 0.05)} // Fade out older dots
                />
              </Marker>
            ))}

            {/* DRAW LASER ARCS FOR VELOCITY HACKS */}
            {velocityPaths.map((path) => (
              <g key={path.id}>
                <Line
                  from={path.start}
                  to={path.end}
                  stroke="#ef4444"
                  strokeWidth={1.5}
                  strokeLinecap="round"
                  className="animate-pulse"
                  style={{ strokeDasharray: "4 4" }}
                />
                <Marker coordinates={path.start}>
                  <circle r={3} fill="#3b82f6" /> {/* Blue dot for last valid location */}
                </Marker>
              </g>
            ))}
          </ComposableMap>
        </div>
      </div>

      {/* ======================================================== */}
      {/* COLUMN 3: THE INSPECTOR PANE (Col span 3)                */}
      {/* ======================================================== */}
      <div className="lg:col-span-3 flex flex-col h-full">
        <h2 className="text-xs font-medium tracking-[0.1em] text-zinc-500 mb-4 uppercase">Inspector Pane</h2>
        
        <div className="flex-1 bg-[#09090b] rounded-2xl border border-zinc-900 p-6 overflow-y-auto">
          {!inspectedTxn ? (
            <div className="h-full flex items-center justify-center text-center px-4">
              <p className="text-[11px] leading-relaxed text-zinc-600">
                Select a transaction from the live feed to freeze its metrics for inspection.
              </p>
            </div>
          ) : (
            <div className="space-y-8 animate-in fade-in duration-300">
              {/* STATUS HEADER */}
              <div>
                <div className="flex items-center gap-3 mb-4">
                  <StatusDot status={inspectedTxn.data.status} />
                  <span className={`text-sm font-medium tracking-wide ${inspectedTxn.data.status === 'APPROVED' ? 'text-emerald-400' : 'text-red-400'}`}>
                    {inspectedTxn.data.status}
                  </span>
                </div>
                {inspectedTxn.data.reason && (
                  <div className="bg-red-950/30 border border-red-900/50 p-3 rounded-lg">
                    <p className="text-xs text-red-400/90 leading-relaxed">{inspectedTxn.data.reason}</p>
                  </div>
                )}
              </div>

              {/* PAYLOAD DATA */}
              <div>
                <p className="text-[10px] tracking-widest text-zinc-600 uppercase mb-3">Payload Data</p>
                <div className="space-y-1">
                  <p className="font-mono text-xs text-zinc-400 break-all">{inspectedTxn.data.userId}</p>
                  <p className="font-mono text-[11px] text-zinc-500">{inspectedTxn.data.merchantId}</p>
                  <p className="font-mono text-[10px] text-zinc-600 mt-2">Lat: {inspectedTxn.data.lat.toFixed(4)} | Lon: {inspectedTxn.data.lon.toFixed(4)}</p>
                </div>
              </div>

              {/* C++ MICRO-PROFILING */}
              <div>
                <p className="text-[10px] tracking-widest text-zinc-600 uppercase mb-3">C++ Engine Telemetry</p>
                <div className="bg-zinc-950 rounded-xl border border-zinc-900 p-4">
                  <TimingRow label="T_TOTAL" value={inspectedTxn.data.t_total} />
                  <TimingRow label="T_LOCK" value={inspectedTxn.data.t_lock} />
                  <TimingRow label="T_BLOOM" value={inspectedTxn.data.t_bloom} />
                  <TimingRow label="T_VELOCITY" value={inspectedTxn.data.t_velocity} />
                  <TimingRow label="T_DISK" value={inspectedTxn.data.t_disk} />
                </div>
              </div>

            </div>
          )}
        </div>
      </div>

    </div>
  );
}