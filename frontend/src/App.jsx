import React, { useState, useEffect } from 'react';
import { ShieldAlert, Activity, CheckCircle, XCircle } from 'lucide-react';

function App() {
  const [logs, setLogs] = useState([]);
  const [systemAlerts, setSystemAlerts] = useState([]);

  useEffect(() => {
    // Connect to the NodeJS WebSocket Orchestrator
    const ws = new WebSocket('ws://localhost:5001');

    ws.onmessage = (event) => {
      const message = JSON.parse(event.data);

      if (message.type === 'ALERT') {
        // C++ Graph Engine found a Fraud Ring!
        setSystemAlerts((prev) => [message.data, ...prev].slice(0, 3));
      } else if (message.type === 'TXN') {
        // Live Transaction coming in
        setLogs((prev) => [message.data, ...prev].slice(0, 15)); // Keep last 15 logs on screen
      }
    };

    return () => ws.close();
  }, []);

  return (
    <div className="min-h-screen p-8 font-mono">
      <div className="max-w-6xl mx-auto">
        
        {/* HEADER */}
        <div className="flex items-center justify-between mb-8 pb-4 border-b border-slate-700">
          <div>
            <h1 className="text-3xl font-bold text-white flex items-center gap-3">
              <Activity className="text-blue-500" />
              LiteDB Fraud Engine
            </h1>
            <p className="text-slate-400 mt-1 text-sm">C++ Concurrent Architecture Monitor</p>
          </div>
          <div className="flex items-center gap-2 text-emerald-400 bg-emerald-400/10 px-4 py-2 rounded-full border border-emerald-400/20">
            <div className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse"></div>
            SYSTEM ONLINE
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          
          {/* LEFT COLUMN: LIVE TRANSACTION FEED */}
          <div className="lg:col-span-2">
            <h2 className="text-xl font-semibold mb-4 text-slate-300">Live Transaction Stream</h2>
            <div className="bg-slate-800/50 rounded-lg p-4 border border-slate-700 min-h-[500px]">
              {logs.length === 0 ? (
                <p className="text-slate-500 text-center mt-10">Waiting for data...</p>
              ) : (
                <div className="space-y-3">
                  {logs.map((log, i) => (
                    <div key={i} className={`p-3 rounded border flex items-center justify-between ${
                      log.status === 'APPROVED' 
                        ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-100' 
                        : 'bg-red-500/10 border-red-500/20 text-red-100'
                    }`}>
                      <div className="flex items-center gap-3">
                        {log.status === 'APPROVED' ? <CheckCircle size={18} className="text-emerald-500"/> : <XCircle size={18} className="text-red-500"/>}
                        <div>
                          <p className="text-sm font-bold opacity-80">{log.userId.substring(0, 15)}...</p>
                          <p className="text-xs opacity-60">Merchant: {log.merchantId}</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className={`text-sm font-bold ${log.status === 'APPROVED' ? 'text-emerald-400' : 'text-red-400'}`}>
                          {log.status}
                        </p>
                        {log.reason && <p className="text-xs opacity-70 mt-1 max-w-[200px] truncate">{log.reason}</p>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* RIGHT COLUMN: GRAPH AI ALERTS */}
          <div>
            <h2 className="text-xl font-semibold mb-4 text-rose-400 flex items-center gap-2">
              <ShieldAlert />
              Graph Engine Alerts
            </h2>
            <div className="space-y-4">
              {systemAlerts.length === 0 ? (
                <div className="bg-slate-800/50 p-6 rounded-lg border border-slate-700 text-center">
                  <p className="text-slate-500 text-sm">No fraud rings detected yet.</p>
                </div>
              ) : (
                systemAlerts.map((alert, i) => (
                  <div key={i} className="bg-rose-500/10 p-4 rounded-lg border border-rose-500/30 animate-pulse">
                    <p className="text-rose-400 text-sm font-bold leading-relaxed">{alert}</p>
                  </div>
                ))
              )}
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}

export default App;