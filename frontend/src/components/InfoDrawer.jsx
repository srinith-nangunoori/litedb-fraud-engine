import React, { useEffect } from 'react'
import { X, MousePointerClick, Eye, Activity, MapPin, Network, Archive } from 'lucide-react'

// ─────────────────────────────────────────────────────────────
// SHARED MICRO-COMPONENTS
// ─────────────────────────────────────────────────────────────
function SpecTag({ children, tone = 'zinc' }) {
  const tones = {
    zinc: 'bg-white/[0.04] text-zinc-300 border-white/[0.08]',
    cyan: 'bg-cyan-950/40 text-cyan-300 border-cyan-900/40',
    amber: 'bg-amber-950/30 text-amber-400 border-amber-900/40',
    red: 'bg-red-950/30 text-red-400 border-red-900/40',
  }
  return (
    <span className={`inline-flex items-center rounded-md border px-1.5 py-0.5 font-mono text-[9px] tracking-wider ${tones[tone]}`}>
      {children}
    </span>
  )
}

function MetricRow({ tag, tone, children }) {
  return (
    <div className="flex gap-3 py-3 border-b border-white/[0.05] last:border-0">
      <SpecTag tone={tone}>{tag}</SpecTag>
      <p className="flex-1 text-[12px] leading-relaxed text-zinc-400">{children}</p>
    </div>
  )
}

function Section({ icon: Icon, tone, title, children }) {
  const toneText = { cyan: 'text-cyan-400', amber: 'text-amber-400', red: 'text-red-400', zinc: 'text-zinc-400' }
  const toneBg = { cyan: 'bg-cyan-950/30 border-cyan-900/40', amber: 'bg-amber-950/30 border-amber-900/40', red: 'bg-red-950/30 border-red-900/40', zinc: 'bg-white/[0.04] border-white/[0.08]' }
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2.5">
        <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-lg border ${toneBg[tone]}`}>
          <Icon size={12} className={toneText[tone]} strokeWidth={2.25} />
        </span>
        <h3 className="text-[11px] font-semibold tracking-[0.1em] text-zinc-200 uppercase">{title}</h3>
      </div>
      <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] backdrop-blur-sm px-4">
        {children}
      </div>
    </div>
  )
}

function CalloutCard({ tone, label, children }) {
  const tones = { amber: 'border-amber-900/30 bg-amber-950/10 text-amber-400', red: 'border-red-900/30 bg-red-950/10 text-red-400', cyan: 'border-cyan-900/30 bg-cyan-950/10 text-cyan-400' }
  return (
    <div className={`rounded-xl border p-3.5 ${tones[tone]}`}>
      <p className="text-[9px] font-bold tracking-[0.14em] uppercase mb-1.5 opacity-90">{label}</p>
      <p className="text-[11px] leading-relaxed text-zinc-400">{children}</p>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// TRIGGER BUTTON — Floating Bottom-Right (Fixed Typography)
// ─────────────────────────────────────────────────────────────
export function InfoDrawerTrigger({ onClick }) {
  return (
    <button
      onClick={onClick}
      aria-label="Open guided tour"
      className="group fixed bottom-8 right-8 z-50 inline-flex items-center gap-2 rounded-full border border-white/10 bg-zinc-900/80 px-4 py-2 backdrop-blur-md shadow-2xl transition-all duration-300 hover:bg-zinc-800 hover:border-white/20 hover:text-white"
    >
      <div className="relative flex h-2 w-2 items-center justify-center">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-cyan-400 opacity-40"></span>
        <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-cyan-500"></span>
      </div>
      {/* Changed from font-mono to font-sans, adjusted tracking for a premium Apple look */}
      <span className="font-sans text-[11px] font-semibold tracking-wide uppercase text-zinc-300 group-hover:text-white transition-colors">
        How to read this
      </span>
    </button>
  )
}

// ─────────────────────────────────────────────────────────────
// STEP-BY-STEP GUIDED TOUR COMPONENTS
// ─────────────────────────────────────────────────────────────
function TourStep({ number, icon: Icon, title, children }) {
  return (
    <div className="relative pl-10 pb-8 last:pb-0">
      <div className="absolute left-[15px] top-8 bottom-0 w-px bg-white/[0.06] last:hidden" />
      <div className="absolute left-0 top-0 flex h-[30px] w-[30px] items-center justify-center rounded-full border border-white/10 bg-zinc-950 shadow-[0_0_15px_rgba(255,255,255,0.05)]">
        <span className="font-mono text-[12px] font-bold text-white">{number}</span>
      </div>
      <div className="pt-1">
        <div className="flex items-center gap-2 mb-2">
          <Icon size={14} className="text-cyan-400" />
          <h3 className="text-[13px] font-semibold tracking-wide text-zinc-100 uppercase">{title}</h3>
        </div>
        <div className="text-[12px] leading-relaxed text-zinc-400 space-y-3 font-light">
          {children}
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// MAIN DRAWER
// ─────────────────────────────────────────────────────────────
export default function InfoDrawer({ open, onClose, type = 'live' }) {

  useEffect(() => {
    if (!open) return
    const onKey = (e) => { if (e.key === 'Escape') onClose?.() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  const isLive = type === 'live'

  return (
    <>
      <div
        aria-hidden="true"
        onClick={onClose}
        className={`fixed inset-0 z-40 bg-black/40 backdrop-blur-[2px] transition-opacity duration-500 ease-in-out ${
          open ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        }`}
      />

      <aside
        role="dialog"
        className={`fixed top-0 right-0 z-50 h-full w-full sm:w-[450px] transform border-l border-white/[0.08] bg-zinc-950/95 backdrop-blur-2xl shadow-2xl transition-transform duration-500 ease-in-out ${
          open ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        <div className="flex h-full flex-col">

          {/* HEADER */}
          <div className="shrink-0 border-b border-white/[0.06] px-8 pt-8 pb-6 relative overflow-hidden bg-black/50">
            <div className="absolute -top-10 -right-10 h-40 w-40 rounded-full blur-3xl pointer-events-none bg-cyan-500/10" />
            <div className="relative flex items-start justify-between gap-4">
              <div>
                <span className="font-mono text-[9px] tracking-[0.2em] uppercase text-cyan-500 font-bold">
                  {isLive ? 'Live Operations Guide' : 'Syndicate Intel Guide'}
                </span>
                <h2 className="mt-2 text-[18px] font-semibold tracking-tight text-white">
                  How to read this dashboard
                </h2>
                <p className="mt-2 text-[11px] leading-relaxed text-zinc-500 max-w-[90%]">
                  {isLive
                    ? "This dashboard is monitoring a custom-built C++ database in real-time. Here is how to test its performance."
                    : "Our background C++ AI autonomously hunts down organized crime rings. Here is how to interpret the threat data."}
                </p>
              </div>
              <button
                onClick={onClose}
                className="shrink-0 rounded-full border border-white/[0.08] bg-white/[0.03] p-2 text-zinc-500 hover:bg-white/[0.08] hover:text-white transition-all"
              >
                <X size={16} />
              </button>
            </div>
          </div>

          {/* SCROLLABLE BODY */}
          <div className="flex-1 overflow-y-auto custom-scrollbar px-8 py-8">

            {isLive ? (
              <div className="space-y-2">
                <TourStep number="1" icon={Eye} title="Watch the Traffic Flow">
                  <p>Our simulator is currently firing overlapping, concurrent transactions globally.</p>
                  <p>Notice the <span className="font-mono text-[10px] bg-white/10 px-1 py-0.5 rounded border border-white/20 text-white">MULTI-COLORED DOTS</span>. To prevent visual confusion, our frontend dynamically assigns a unique, permanent "Round-Robin" color (Cyan, Amber, Violet, etc.) to a specific user's sequence ID. If you see a Violet path on the map, you can instantly find the corresponding Violet card scrolling in the left feed.</p>
                </TourStep>

                <TourStep number="2" icon={Activity} title="Spot the Velocity Anomalies">
                  <p>Wait for a <span className="text-red-400 font-mono text-[10px] bg-red-950/30 px-1 py-0.5 rounded border border-red-900/50">DASHED RED LASER</span> to shoot across the map.</p>
                  <p>This happens when the C++ Engine catches a hacker trying to travel at physically impossible speeds (e.g. from Delhi to London in 1 second). C++ catches this via O(1) Haversine spherical math, and the React UI dynamically fetches the user's historical coordinates to draw the flight path.</p>
                </TourStep>

                <TourStep number="3" icon={MousePointerClick} title="Verify Hardware Speeds">
                  <p>Click any card in the fast-scrolling feed to freeze it in the Inspector Pane on the right.</p>
                  <p>Look at the <strong>Memory vs Disk</strong> bar chart. Because we implemented a <strong>Double-Buffered Pointer Swap</strong> in C++, the engine writes logs asynchronously to the SSD. This drops disk latency to ~1 microsecond, allowing the database to process transactions infinitely faster than traditional synchronous databases.</p>
                </TourStep>
              </div>
            ) : (
              <div className="space-y-2">
                <TourStep number="1" icon={MousePointerClick} title="Select a Threat">
                  <p>Click on any of the Blacklisted Entities on the left sidebar.</p>
                  <p>These shell companies were caught automatically by our C++ graph-clustering thread, which sweeps the database memory every 10 seconds.</p>
                </TourStep>

                <TourStep number="2" icon={Network} title="Spot the Data Harvesters">
                  <p>If you see a <strong>Network Graph</strong> load in the center, this merchant is a <span className="text-amber-500 font-mono text-[10px] bg-amber-950/30 px-1 py-0.5 rounded border border-amber-900/50">TYPE 1 HARVESTER</span>.</p>
                  <p>They operate fake storefronts to steal credit card numbers. The bright <span className="text-amber-500 font-bold">Amber</span> nodes orbiting the center are innocent people who shopped here, and later had their cards fraudulently used in other countries.</p>
                </TourStep>

                <TourStep number="3" icon={MapPin} title="Spot the Cash-Out Fronts">
                  <p>If you see the <strong>World Map</strong> load in the center, this merchant is a <span className="text-red-400 font-mono text-[10px] bg-red-950/30 px-1 py-0.5 rounded border border-red-900/50">TYPE 2 CASH-OUT FRONT</span>.</p>
                  <p>Hackers set up these shell companies to launder stolen money. The glowing red biohazard crosshairs show exactly where the hackers were physically located on the globe when our C++ velocity engine blocked their fraudulent transactions.</p>
                </TourStep>

                <TourStep number="4" icon={Archive} title="Understand Cold Storage">
                  <p>If you click an older merchant and the screen says <strong>DATA EVICTED TO COLD STORAGE</strong>, this is an intentional memory optimization.</p>
                  <p>Our C++ engine automatically deletes inactive merchant nodes from RAM after 15 seconds to prevent Memory Leaks, flushing their data to an SSD archival log. The Bloom Filter, however, permanently retains their blacklist status in O(1) memory.</p>
                </TourStep>
              </div>
            )}

          </div>
        </div>
      </aside>
    </>
  )
}