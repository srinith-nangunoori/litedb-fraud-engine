import { useState } from 'react'
import {
  Cpu,
  HardDrive,
  Globe,
  Network,
  ArrowRight,
  Zap,
  Layers,
  GitBranch,
} from 'lucide-react'

// ─────────────────────────────────────────────────────────────────────────────
// Static content model. Keeping copy as data (not inline JSX strings) makes the
// four pillars easy to scan, reorder, or extend without touching layout code.
// ─────────────────────────────────────────────────────────────────────────────
const PILLARS = [
  {
    id: 'engine',
    tag: 'A',
    icon: Cpu,
    title: 'The Execution Engine',
    subtitle: 'Speed',
    metric: '<15µs',
    metricLabel: 'per operation',
    span: 'lg',
    accent: 'from-sky-500/20 to-transparent',
    summary:
      'Every Bloom Filter lookup and risk-score calculation runs entirely in memory, measured at the microsecond level.',
    detail:
      'Micro-profiling traces each hot path down to individual CPU cycles. Bloom filter membership checks and the underlying math kernels complete in under 15 microseconds — an order of magnitude faster than a conventional database round-trip, because there is no query planner, no disk seek, and no network hop in the critical path.',
    terminal: [
      '$ profile --op=bloom_check',
      'avg: 11.4µs  p99: 14.8µs',
      'status: below_db_overhead',
    ],
  },
  {
    id: 'persistence',
    tag: 'B',
    icon: HardDrive,
    title: 'Dual-Persistence & Async Disk I/O',
    subtitle: 'Durability',
    metric: '10ns',
    metricLabel: 'pointer swap',
    span: 'xl',
    accent: 'from-violet-500/20 to-transparent',
    summary:
      'A background thread flushes the write-ahead log without ever pausing live traffic, backed by snapshots for instant recovery.',
    detail:
      'The engine writes to an in-memory buffer that a background thread later persists to the AOF (write-ahead log) on SSD. Rather than locking that buffer during flush, a Double-Buffering Pointer Swap hands the writer a fresh buffer in roughly 10 nanoseconds — live traffic never blocks on disk. In parallel, an RDB snapshot engine compresses the full in-memory state every 30 seconds, so a crash restores from disk in moments rather than replaying the entire log.',
    terminal: [
      '$ aof --flush-thread status',
      'buffer_swap: 10ns  blocking: none',
      'rdb_snapshot: every 30s',
    ],
  },
  {
    id: 'geospatial',
    tag: 'C',
    icon: Globe,
    title: 'Geospatial Velocity Math',
    subtitle: 'The Logic',
    metric: 'O(1)',
    metricLabel: 'lookup via LRU',
    span: 'md',
    accent: 'from-emerald-500/20 to-transparent',
    summary:
      'Haversine spherical trigonometry against a cached transaction history catches impossible travel instantly.',
    detail:
      'Each new transaction is checked against the user\u2019s most recent location, held in an LRU cache for constant-time lookup. Haversine spherical trigonometry computes the great-circle distance between the two points, and dividing by elapsed time reveals a required travel speed. A card used in Delhi and then New York five minutes later implies a velocity no aircraft can achieve — flagged before the second transaction ever clears.',
    terminal: [
      '$ velocity_check --pair=last,current',
      'distance: 11,764km  Δt: 5m',
      'required_speed: impossible',
    ],
  },
  {
    id: 'graph',
    tag: 'D',
    icon: Network,
    title: 'Bipartite Graph Clustering',
    subtitle: 'The AI',
    metric: '>30%',
    metricLabel: 'fraud ratio threshold',
    span: 'lg',
    accent: 'from-amber-500/20 to-transparent',
    summary:
      'A background thread traces victims back through merchants to surface money-laundering syndicates automatically.',
    detail:
      'Declined transactions are never written into the graph, keeping memory reserved for accounts that actually transact. An asynchronous background thread instead walks the bipartite graph of customers and merchants, tracing cases where a merchant\u2019s customers later turn up as fraud victims elsewhere. Once the share of a merchant\u2019s customers who go on to be victimized crosses a 30% Fraud Ratio, the merchant is auto-blacklisted as a probable laundering front.',
    terminal: [
      '$ graph_scan --mode=async',
      'merchant_X fraud_ratio: 34%',
      'action: auto_blacklist',
    ],
  },
]

function PillarCard({ pillar, isOpen, onToggle }) {
  const Icon = pillar.icon

  const spanClasses = {
    lg: 'md:col-span-3',
    xl: 'md:col-span-4',
    md: 'md:col-span-2',
  }

  return (
    <div
      className={`group relative rounded-2xl border border-white/[0.08] bg-zinc-950/60 backdrop-blur-sm
      hover:border-zinc-700 transition-all duration-500 overflow-hidden cursor-pointer
      ${spanClasses[pillar.span]}`}
      onClick={onToggle}
    >
      {/* Ambient gradient wash, revealed on hover */}
      <div
        className={`pointer-events-none absolute inset-0 bg-gradient-to-br ${pillar.accent} opacity-0 group-hover:opacity-100 transition-opacity duration-500`}
      />

      <div className="relative p-6 flex flex-col h-full">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/[0.04] border border-white/[0.08] text-zinc-300 group-hover:text-white group-hover:border-zinc-600 transition-colors duration-500">
              <Icon size={16} strokeWidth={1.75} />
            </div>
            <span className="font-mono text-[10px] tracking-[0.2em] text-zinc-600 uppercase">
              Pillar {pillar.tag}
            </span>
          </div>

          <ArrowRight
            size={14}
            strokeWidth={1.75}
            className={`text-zinc-600 transition-transform duration-500 ${
              isOpen ? 'rotate-90' : 'group-hover:translate-x-0.5'
            }`}
          />
        </div>

        <div className="mt-5">
          <h3 className="text-[15px] font-semibold text-zinc-50 tracking-[-0.01em]">
            {pillar.title}
          </h3>
          <p className="text-[11px] text-zinc-500 mt-0.5 tracking-wide uppercase">
            {pillar.subtitle}
          </p>
        </div>

        <p className="mt-4 text-[13px] leading-relaxed text-zinc-400 font-light">
          {pillar.summary}
        </p>

        {/* Expandable technical detail */}
        <div
          className={`grid transition-all duration-500 ease-out ${
            isOpen ? 'grid-rows-[1fr] opacity-100 mt-4' : 'grid-rows-[0fr] opacity-0'
          }`}
        >
          <div className="overflow-hidden">
            <p className="text-[12.5px] leading-relaxed text-zinc-400 font-light border-t border-white/[0.06] pt-4">
              {pillar.detail}
            </p>
            <div className="mt-4 rounded-lg bg-black/60 border border-white/[0.06] px-3.5 py-3 font-mono text-[10.5px] leading-[1.8] text-emerald-400/80">
              {pillar.terminal.map((line, i) => (
                <div key={i} className={i === 0 ? 'text-zinc-500' : ''}>
                  {line}
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-auto pt-5 flex items-baseline gap-1.5">
          <span className="font-mono text-[22px] font-semibold text-zinc-100 tracking-tight">
            {pillar.metric}
          </span>
          <span className="text-[10.5px] text-zinc-600 tracking-wide">
            {pillar.metricLabel}
          </span>
        </div>
      </div>
    </div>
  )
}

export default function Architecture() {
  const [openId, setOpenId] = useState('engine')

  return (
    <div className="pb-4">
      {/* ── Section intro ── */}
      <div className="mb-10 max-w-2xl">
        <div className="flex items-center gap-2 mb-3">
          <Layers size={13} strokeWidth={1.75} className="text-zinc-600" />
          <span className="font-mono text-[10.5px] tracking-[0.2em] text-zinc-600 uppercase">
            System Design
          </span>
        </div>
        <h2 className="text-[26px] font-semibold text-zinc-50 tracking-[-0.02em]">
          Inside the Engine
        </h2>
        <p className="mt-3 text-[13.5px] leading-relaxed text-zinc-500 font-light">
          LiteDB is a custom C++ database built from first principles for one job:
          catching fraud before it settles. Four systems work together to make
          that possible — each trading conventional database overhead for
          purpose-built speed. Click a card to see how it works under the hood.
        </p>
      </div>

      {/* ── Bento grid ── */}
      <div className="grid grid-cols-1 md:grid-cols-7 gap-4">
        {PILLARS.map((pillar) => (
          <PillarCard
            key={pillar.id}
            pillar={pillar}
            isOpen={openId === pillar.id}
            onToggle={() => setOpenId(openId === pillar.id ? null : pillar.id)}
          />
        ))}
      </div>

      {/* ── Footer strip: ties the four pillars into one narrative ── */}
      <div className="mt-4 rounded-2xl border border-white/[0.08] bg-zinc-950/60 backdrop-blur-sm px-6 py-5 flex flex-col sm:flex-row sm:items-center gap-4 sm:gap-8">
        <div className="flex items-center gap-2.5 shrink-0">
          <GitBranch size={14} strokeWidth={1.75} className="text-zinc-500" />
          <span className="text-[11px] font-medium tracking-[0.1em] text-zinc-500 uppercase">
            Why it holds together
          </span>
        </div>
        <p className="text-[12.5px] leading-relaxed text-zinc-500 font-light">
          Speed makes real-time decisions possible; durability means those decisions
          survive a crash; the geospatial layer catches what a single transaction
          reveals; the graph layer catches what only shows up across thousands of
          them. Each pillar covers a failure mode the others can&apos;t.
        </p>
        <div className="hidden sm:flex items-center gap-1.5 ml-auto shrink-0 text-zinc-700">
          <Zap size={13} strokeWidth={1.75} />
          <span className="font-mono text-[10.5px]">C++17 · zero-copy · lock-free</span>
        </div>
      </div>
    </div>
  )
}